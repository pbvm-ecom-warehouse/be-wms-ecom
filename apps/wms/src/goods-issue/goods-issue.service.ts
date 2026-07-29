import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '@app/common/errors/app.exception';
import { WmsRole } from '@app/auth';
import { EVENTS, QUEUES, type GoodsIssuedPayload } from '@app/events';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import {
  GoodsIssueRepository,
  QueryGoodsIssueInput,
} from './goods-issue.repository';
import type { ConfirmGoodsIssueLineDto } from './dto/goods-issue.dto';
import {
  GoodsIssueStatus,
  type GoodsIssueDocument,
} from './schemas/goods-issue.schema';
import {
  StockRepository,
  type PickSuggestion,
} from '../stock/stock.repository';
import { StockService } from '../stock/stock.service';
import { LocationRepository } from '../location/location.repository';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import { BarcodeService } from '../stock/barcode/barcode.service';
import { WarehouseNavigationService } from '../location/navigation.service';
import { DocumentNumberService } from '../document-number/document-number.service';

interface OrderReadyItem {
  sku: string;
  quantity: number;
}

@Injectable()
export class GoodsIssueService {
  private readonly logger = new Logger(GoodsIssueService.name);

  constructor(
    private readonly repo: GoodsIssueRepository,
    private readonly stockRepo: StockRepository,
    private readonly stockService: StockService,
    private readonly locationRepo: LocationRepository,
    private readonly stockTransactionHelper: StockTransactionHelper,
    private readonly barcodeSvc: BarcodeService,
    private readonly navigationService: WarehouseNavigationService,
    private readonly documentNumberService: DocumentNumberService,
    @InjectQueue(QUEUES.SHIPMENT) private readonly shipmentQueue: Queue,
    @InjectQueue(QUEUES.SHIPMENT_INTERNAL)
    private readonly shipmentInternalQueue: Queue,
  ) {}

  /**
   * Gọi từ OrderReadyConsumer khi nhận order.ready_to_fulfill. Idempotent theo
   * orderId (unique index) — event redeliver không tạo phiếu trùng. Sku không
   * khớp WarehouseItem bị bỏ qua (log warning) thay vì chặn cả phiếu, vì retry
   * BullMQ sẽ lặp lại lỗi y hệt nếu throw ở đây.
   */
  async createFromOrderReady(
    orderId: string,
    orderCode: string,
    items: OrderReadyItem[],
    shippingAddress: Record<string, unknown>,
    recipient: { name: string; phone: string },
    paymentMethod: 'COD' | 'ONLINE',
    codAmount: number,
  ): Promise<void> {
    const existing = await this.repo.findByOrderId(orderId);
    if (existing) {
      this.logger.warn(
        `GoodsIssue đã tồn tại cho orderId=${orderId} → bỏ qua (idempotent).`,
      );
      return;
    }

    const lines: { itemId: Types.ObjectId; sku: string; quantity: number }[] =
      [];
    for (const item of items) {
      const warehouseItem = await this.stockRepo.findItemBySku(item.sku);
      if (!warehouseItem) {
        this.logger.warn(
          `Sku=${item.sku} không khớp WarehouseItem nào → bỏ qua dòng này (orderId=${orderId}).`,
        );
        continue;
      }
      lines.push({
        itemId: warehouseItem._id,
        sku: item.sku,
        quantity: item.quantity,
      });
    }

    if (lines.length === 0) {
      this.logger.warn(
        `Không có dòng nào khớp sku cho orderId=${orderId} → không tạo GoodsIssue.`,
      );
      return;
    }

    const goodsIssueNumber = await this.documentNumberService.next('GI');
    await this.repo.createGoodsIssue({
      orderId,
      orderCode,
      goodsIssueNumber,
      lines,
      shippingAddress,
      recipient,
      paymentMethod,
      codAmount,
    });
  }

  async getPickSuggestions(
    id: string,
    itemId: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<PickSuggestion[]> {
    const gi = await this.repo.findById(id);
    if (!gi) throw new AppException('GOODS_ISSUE_NOT_FOUND');
    this.assertCanOperate(gi, actorId, actorRole);
    const line = gi.items.find((i) => i.itemId.toString() === itemId);
    if (!line) throw new AppException('GOODS_ISSUE_ITEM_MISMATCH');

    const warehouseItem = await this.stockRepo.findItemById(itemId);
    const isPerishable = warehouseItem?.isPerishable ?? false;

    const suggestions = await this.stockRepo.findAvailableStockForPick(
      new Types.ObjectId(itemId),
      isPerishable,
    );
    const navigable = (
      await Promise.all(
        suggestions.map(async (suggestion) => {
          if (
            !suggestion.rackId ||
            !suggestion.cellId ||
            !suggestion.cellCode
          ) {
            return null;
          }
          try {
            const path = await this.navigationService.getPath(
              suggestion.rackId.toString(),
            );
            return { ...suggestion, path };
          } catch (error) {
            if (
              error instanceof AppException &&
              [
                'NAVIGATION_RACK_NOT_CONNECTED',
                'NAVIGATION_PATH_NOT_FOUND',
                'NAVIGATION_GATE_NOT_CONNECTED',
                'NAVIGATION_GATE_NOT_FOUND',
              ].includes(error.code)
            ) {
              return null;
            }
            throw error;
          }
        }),
      )
    ).filter((value) => value !== null);

    navigable.sort((left, right) => {
      if (isPerishable) {
        const expiryDelta =
          (left.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (right.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER);
        if (expiryDelta !== 0) return expiryDelta;
      }
      return left.path.distanceM - right.path.distanceM;
    });
    return navigable;
  }

  /**
   * SHIPPER owner quét itemBarcode + cellBarcode để xác nhận xuất 1 dòng.
   * Đối xứng với PutAwayService.confirmLine, nhưng trừ onHand+reserved
   * (available không đổi — đã trừ lúc reserve ở checkout) thay vì chỉ dịch
   * chuyển vị trí, và KHÔNG bắn stock.changed.
   */
  async confirmLine(
    id: string,
    dto: ConfirmGoodsIssueLineDto,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<GoodsIssueDocument> {
    const gi = await this.repo.findById(id);
    if (!gi) throw new AppException('GOODS_ISSUE_NOT_FOUND');
    this.assertCanOperate(gi, actorId, actorRole);

    const itemId = await this.barcodeSvc.findItemIdByCode(dto.itemBarcode);
    if (!itemId) throw new AppException('GOODS_ISSUE_ITEM_NOT_FOUND');
    const item = await this.stockRepo.findItemByIdDocument(itemId.toString());
    if (!item) throw new AppException('GOODS_ISSUE_ITEM_NOT_FOUND');

    const cell = dto.cellBarcode
      ? await this.locationRepo.findCellByCode(dto.cellBarcode)
      : null;
    if (!cell) throw new AppException('GOODS_ISSUE_CELL_NOT_FOUND');
    const shelf = await this.locationRepo.findShelfById(
      cell.shelfId.toString(),
    );
    if (!shelf) throw new AppException('GOODS_ISSUE_SHELF_NOT_FOUND');

    const line = gi.items.find(
      (i) => i.itemId.toString() === item._id.toString(),
    );
    if (!line) throw new AppException('GOODS_ISSUE_ITEM_MISMATCH');

    const lotId = dto.lotId ? new Types.ObjectId(dto.lotId) : null;
    const inventory = await this.stockRepo.findInventory(
      item._id,
      shelf._id,
      lotId,
      undefined,
      cell._id,
    );
    if (!inventory) throw new AppException('STOCK_INSUFFICIENT');

    // quantity = số thùng nguyên cần xuất — không còn quy đổi qua factor
    // (quyết định: quantity luôn là thùng, factor chỉ để hiển thị).
    const quantity = dto.quantity ?? 0;
    if (quantity <= 0) {
      throw new AppException('GOODS_ISSUE_PACKAGE_COUNT_REQUIRED');
    }
    if (quantity > line.remainingQty) {
      throw new AppException('GOODS_ISSUE_QTY_EXCEEDS');
    }
    if (inventory.quantity < quantity) {
      throw new AppException('STOCK_INSUFFICIENT');
    }

    const suggestedCellId = dto.suggestedCellId
      ? new Types.ObjectId(dto.suggestedCellId)
      : null;
    const isOverride =
      suggestedCellId !== null &&
      suggestedCellId.toString() !== cell._id.toString();

    let justConfirmed = false;
    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      const activeCell = await this.locationRepo.lockActiveCellForInventory(
        cell._id.toString(),
        session,
      );
      if (!activeCell) throw new AppException('GOODS_ISSUE_CELL_NOT_FOUND');

      const issueUpdated = await this.repo.decrementRemainingQty(
        id,
        item._id,
        quantity,
        session,
      );
      if (!issueUpdated) throw new AppException('GOODS_ISSUE_QTY_EXCEEDS');

      const inventoryUpdated =
        await this.stockRepo.decrementInventoryIfAvailable(
          item._id,
          shelf._id,
          cell._id,
          lotId,
          quantity,
          session,
        );
      if (!inventoryUpdated) throw new AppException('STOCK_INSUFFICIENT');

      const balanceUpdated = await this.stockRepo.issueReservedIfAvailable(
        item._id,
        quantity,
        session,
      );
      if (!balanceUpdated) throw new AppException('STOCK_INSUFFICIENT');

      await this.stockRepo.insertMovement(
        {
          itemId: item._id,
          shelfId: shelf._id,
          cellId: cell._id,
          lotId,
          type: MovementType.ISSUE,
          quantity: -quantity,
          refType: 'goods_issue',
          refId: gi._id,
          createdBy: new Types.ObjectId(actorId),
          packageFactor: inventory.packageFactor,
          packageVolumeCm3Snapshot: inventory.packageVolumeCm3Snapshot,
          suggestedCellId,
          actualCellId: cell._id,
          isOverride,
        },
        session,
      );
      justConfirmed = await this.repo.markConfirmedIfAllDone(id, session);
    });

    await this.stockService.checkAndEmitStockLow(item._id);

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('GOODS_ISSUE_NOT_FOUND');

    if (justConfirmed) {
      await this.emitGoodsIssued(gi.orderId, id);
    }

    return updated;
  }
  private async emitGoodsIssued(
    orderId: string,
    goodsIssueId: string,
  ): Promise<void> {
    const payload: GoodsIssuedPayload = { orderId, goodsIssueId };
    const jobId = `goods_issue:${goodsIssueId}`;
    // 2 queue riêng — QUEUES.SHIPMENT cho Ecom, QUEUES.SHIPMENT_INTERNAL cho WMS tự xử lý —
    // tránh 2 worker cùng cạnh tranh 1 job trên cùng queue (BullMQ competing consumer).
    await Promise.all([
      this.shipmentQueue.add(EVENTS.GOODS_ISSUED, payload, { jobId }),
      this.shipmentInternalQueue.add(EVENTS.GOODS_ISSUED, payload, { jobId }),
    ]);
    this.logger.log(
      `goods.issued → orderId=${orderId} goodsIssueId=${goodsIssueId}`,
    );
  }

  async listGoodsIssues(
    query: QueryGoodsIssueInput,
    actorId?: string,
    actorRole?: WmsRole,
  ): Promise<{ data: GoodsIssueDocument[]; total: number }> {
    return this.repo.findAll(
      actorRole === WmsRole.SHIPPER && actorId
        ? { ...query, assignedShipperId: actorId, includeUnassigned: true }
        : query,
    );
  }

  async claim(id: string, shipperId: string): Promise<GoodsIssueDocument> {
    const claimed = await this.repo.claim(id, new Types.ObjectId(shipperId));
    if (claimed) return claimed;

    const current = await this.repo.findById(id);
    if (!current) throw new AppException('GOODS_ISSUE_NOT_FOUND');
    if (
      current.status === GoodsIssueStatus.PICKING &&
      current.assignedShipperId?.toString() === shipperId
    ) {
      return current;
    }
    if (current.status === GoodsIssueStatus.CONFIRMED) {
      throw new AppException('GOODS_ISSUE_ALREADY_CONFIRMED');
    }
    throw new AppException('GOODS_ISSUE_ALREADY_CLAIMED');
  }

  async getGoodsIssue(id: string): Promise<GoodsIssueDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('GOODS_ISSUE_NOT_FOUND');
    return doc;
  }

  private assertCanOperate(
    goodsIssue: GoodsIssueDocument,
    actorId: string,
    actorRole: WmsRole,
  ): void {
    if (actorRole === WmsRole.ADMIN) return;
    if (!goodsIssue.assignedShipperId) {
      throw new AppException('GOODS_ISSUE_NOT_CLAIMED');
    }
    if (goodsIssue.assignedShipperId.toString() !== actorId) {
      throw new AppException('GOODS_ISSUE_NOT_OWNER');
    }
    if (goodsIssue.status !== GoodsIssueStatus.PICKING) {
      throw new AppException('GOODS_ISSUE_ALREADY_CONFIRMED');
    }
  }
}
