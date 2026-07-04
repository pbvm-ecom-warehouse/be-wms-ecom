// apps/wms/src/goods-receipt-note/goods-receipt-note.service.ts
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '@app/common';
import {
  GoodsReceiptNoteRepository,
  ResolvedGoodsReceiptNoteItem,
} from './goods-receipt-note.repository';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { StockRepository } from '../stock/stock.repository';
import { StockService } from '../stock/stock.service';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { PutAwayService } from '../put-away/put-away.service';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import {
  GoodsReceiptNoteStatus,
  type GoodsReceiptNoteDocument,
} from './schemas/goods-receipt-note.schema';
import { PurchaseOrderStatus } from '../purchase-order/schemas/purchase-order.schema';
import type {
  CreateGoodsReceiptNoteDto,
  QueryGoodsReceiptNoteDto,
} from './dto/goods-receipt-note.dto';

const NON_RECEIVABLE_STATUSES = new Set([
  PurchaseOrderStatus.CANCELLED,
  PurchaseOrderStatus.COMPLETED,
]);

@Injectable()
export class GoodsReceiptNoteService {
  constructor(
    private readonly repo: GoodsReceiptNoteRepository,
    private readonly purchaseOrderService: PurchaseOrderService,
    private readonly warehouseService: WarehouseService,
    private readonly stockRepo: StockRepository,
    private readonly stockService: StockService,
    private readonly stockTransactionHelper: StockTransactionHelper,
    private readonly putAwayService: PutAwayService,
  ) {}

  async createGoodsReceiptNote(
    dto: CreateGoodsReceiptNoteDto,
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument> {
    const po = await this.purchaseOrderService.getPurchaseOrder(
      dto.purchaseOrderId,
    );
    if (NON_RECEIVABLE_STATUSES.has(po.status)) {
      throw new AppException('PO_NOT_RECEIVABLE');
    }

    const poItemIds = new Set(po.items.map((i) => i.itemId.toString()));
    const resolvedItems: ResolvedGoodsReceiptNoteItem[] = [];
    for (const item of dto.items) {
      const poItem = po.items.find((i) => i.itemId.toString() === item.itemId);
      if (!poItemIds.has(item.itemId) || !poItem) {
        throw new AppException('GRN_ITEM_NOT_IN_PO');
      }

      const warehouseItem = await this.stockRepo.findItemById(item.itemId);
      if (
        warehouseItem?.isPerishable &&
        (!item.lotNumber || !item.expiryDate)
      ) {
        throw new AppException('GRN_LOT_INFO_MISSING');
      }

      resolvedItems.push({
        itemId: item.itemId,
        sku: item.sku,
        expectedQty: poItem.expectedQty,
        actualQty: item.actualQty,
        unit: item.unit,
        lotNumber: item.lotNumber,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        note: item.note,
      });
    }

    const grnNumber = await this.generateGrnNumber();
    return this.repo.createGoodsReceiptNote(
      dto.purchaseOrderId,
      po.warehouseId.toString(),
      grnNumber,
      resolvedItems,
      actorId,
    );
  }

  async confirmGoodsReceiptNote(
    id: string,
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    // Guard này làm confirm idempotent với retry HTTP: check TRƯỚC mọi ghi transaction/stock,
    // nên nếu transaction đã commit (GRN → CONFIRMED) thì retry luôn rơi vào đây và bị chặn sạch,
    // không cộng tồn 2 lần; nếu transaction chưa commit (crash giữa chừng) thì chưa ghi gì, retry chạy lại bình thường.
    if (grn.status !== GoodsReceiptNoteStatus.DRAFT) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }

    const po = await this.purchaseOrderService.getPurchaseOrder(
      grn.purchaseOrderId.toString(),
    );

    // Gộp baseQty theo itemId trước khi so sánh — 1 GRN có thể có nhiều dòng cùng item (nhiều lô)
    const baseQtyByItem = new Map<string, number>();
    const resolvedLines: {
      itemId: string;
      sku: string;
      baseQty: number;
      lotNumber?: string;
      expiryDate?: Date;
    }[] = [];

    for (const line of grn.items) {
      const warehouseItem = await this.stockRepo.findItemById(
        line.itemId.toString(),
      );
      const factor =
        warehouseItem?.altUnits?.find((u) => u.unit === line.unit)?.factor ?? 1;
      const baseQty = line.actualQty * factor;
      const key = line.itemId.toString();
      baseQtyByItem.set(key, (baseQtyByItem.get(key) ?? 0) + baseQty);
      resolvedLines.push({
        itemId: key,
        sku: line.sku,
        baseQty,
        lotNumber: line.lotNumber,
        expiryDate: line.expiryDate,
      });
    }

    for (const [itemId, totalBaseQty] of baseQtyByItem) {
      const poItem = po.items.find((i) => i.itemId.toString() === itemId);
      if (!poItem) throw new AppException('GRN_ITEM_NOT_IN_PO');
      if (poItem.receivedQty + totalBaseQty > poItem.expectedQty) {
        throw new AppException('GRN_QTY_EXCEEDS_PO');
      }
    }

    const stagingShelf = await this.warehouseService.findStagingShelf(
      grn.warehouseId.toString(),
    );

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      // Tích lũy dòng put-away trong cùng vòng lặp — cần lotId ĐÃ RESOLVE (không phải
      // lotNumber gốc từ GRN), vì PutAwayTask xếp hàng theo lô thật đã tạo/tìm thấy ở dưới.
      const putAwayLines: {
        itemId: string;
        lotId: Types.ObjectId | null;
        quantity: number;
      }[] = [];

      for (const line of resolvedLines) {
        const itemObjectId = new Types.ObjectId(line.itemId);
        const warehouseObjectId = new Types.ObjectId(
          grn.warehouseId.toString(),
        );

        let lotId: Types.ObjectId | null = null;
        if (line.lotNumber && line.expiryDate) {
          const existingLot = await this.stockRepo.findActiveLotByNumber(
            itemObjectId,
            line.lotNumber,
            session,
          );
          const lot =
            existingLot ??
            (await this.stockRepo.createLot(
              {
                itemId: itemObjectId,
                lotNumber: line.lotNumber,
                expiryDate: line.expiryDate,
                receivedDate: new Date(),
              },
              session,
            ));
          lotId = lot._id;
        }

        putAwayLines.push({
          itemId: line.itemId,
          lotId,
          quantity: line.baseQty,
        });

        await this.stockRepo.upsertBalance(
          itemObjectId,
          warehouseObjectId,
          line.baseQty,
          0,
          0,
          session,
        );
        await this.stockRepo.upsertInventory(
          itemObjectId,
          warehouseObjectId,
          stagingShelf._id,
          lotId,
          line.baseQty,
          session,
        );
        await this.stockRepo.insertMovement(
          {
            itemId: itemObjectId,
            warehouseId: warehouseObjectId,
            shelfId: stagingShelf._id,
            lotId,
            type: MovementType.RECEIVE,
            quantity: line.baseQty,
            refType: 'grn',
            refId: grn._id,
            createdBy: new Types.ObjectId(actorId),
          },
          session,
        );
        await this.purchaseOrderService.applyReceivedQty(
          grn.purchaseOrderId.toString(),
          line.itemId,
          line.baseQty,
          session,
        );
      }

      // Sinh PutAwayTask cùng transaction cộng tồn — nếu rollback thì task cũng không
      // được tạo, tránh việc GRN chưa confirm mà đã có task xếp hàng "ma".
      await this.putAwayService.createTaskFromGrn(
        grn._id,
        new Types.ObjectId(grn.warehouseId.toString()),
        putAwayLines,
        actorId,
        session,
      );

      await this.repo.updateStatusConfirmed(id, actorId, session);
    });

    // Ngoài transaction — BullMQ không tham gia Mongo transaction
    for (const [itemId, totalBaseQty] of baseQtyByItem) {
      await this.stockService.publishAvailableForItem(itemId, totalBaseQty);
    }

    const confirmed = await this.repo.findGoodsReceiptNoteById(id);
    if (!confirmed) throw new AppException('GRN_NOT_FOUND');
    return confirmed;
  }

  async approveGoodsReceiptNote(
    id: string,
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    if (grn.status !== GoodsReceiptNoteStatus.CONFIRMED) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }
    const approved = await this.repo.updateStatusApproved(id, actorId);
    if (!approved) throw new AppException('GRN_NOT_FOUND');
    return approved;
  }

  async listGoodsReceiptNotes(
    query: QueryGoodsReceiptNoteDto,
  ): Promise<{ data: GoodsReceiptNoteDocument[]; total: number }> {
    return this.repo.findGoodsReceiptNotes(query);
  }

  async getGoodsReceiptNote(id: string): Promise<GoodsReceiptNoteDocument> {
    const doc = await this.repo.findGoodsReceiptNoteById(id);
    if (!doc) throw new AppException('GRN_NOT_FOUND');
    return doc;
  }

  /** Sinh mã GRN dạng GRN-YYYYMMDD-xxxx, số thứ tự reset theo ngày. */
  private async generateGrnNumber(): Promise<string> {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const prefix = `GRN-${y}${m}${d}`;
    const count = await this.repo.countByGrnNumberPrefix(prefix);
    const seq = String(count + 1).padStart(4, '0');
    return `${prefix}-${seq}`;
  }
}
