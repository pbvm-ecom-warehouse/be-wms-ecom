import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AppException, CloudinaryService } from '@app/common';
import { EVENTS, QUEUES, type StockChangedPayload } from '@app/events';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import {
  GoodsReturnRepository,
  QueryGoodsReturnInput,
} from './goods-return.repository';
import type {
  CreateGoodsReturnDto,
  InspectGoodsReturnDto,
} from './dto/goods-return.dto';
import {
  GoodsReturnItemCondition,
  GoodsReturnStatus,
  type GoodsReturnDocument,
} from './schemas/goods-return.schema';
import { StockRepository } from '../stock/stock.repository';
import { StockService } from '../stock/stock.service';
import { WarehouseRepository } from '../warehouse/warehouse.repository';
import { ScrapNoteService } from '../scrap-note/scrap-note.service';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';

interface OrderReturnedItem {
  sku: string;
  quantity: number;
}

// Giới hạn upload ảnh minh chứng hàng trả — theo đúng ràng buộc thiết kế IMG-01/IMG-05.
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class GoodsReturnService {
  private readonly logger = new Logger(GoodsReturnService.name);

  constructor(
    private readonly repo: GoodsReturnRepository,
    private readonly stockRepo: StockRepository,
    private readonly stockService: StockService,
    private readonly warehouseRepo: WarehouseRepository,
    private readonly scrapNoteService: ScrapNoteService,
    private readonly stockTransactionHelper: StockTransactionHelper,
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /**
   * Gọi từ OrderReturnedConsumer khi nhận order.returned. Idempotent theo
   * orderId — event redeliver không tạo phiếu trùng. Sku không khớp
   * WarehouseItem bị bỏ qua (log warning) thay vì chặn cả phiếu, giống
   * GoodsIssueService.createFromOrderReady — retry BullMQ sẽ lặp lại lỗi y
   * hệt nếu throw ở đây. warehouseId để null — RECEIVER gán lúc inspect.
   */
  async createFromOrderReturned(
    orderId: string,
    items: OrderReturnedItem[],
  ): Promise<void> {
    const existing = await this.repo.findByOrderId(orderId);
    if (existing) {
      this.logger.warn(
        `GoodsReturn đã tồn tại cho orderId=${orderId} → bỏ qua (idempotent).`,
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
        `Không có dòng nào khớp sku cho orderId=${orderId} → không tạo GoodsReturn.`,
      );
      return;
    }

    await this.repo.createGoodsReturn(orderId, null, undefined, lines);
  }

  /**
   * RECEIVER tạo phiếu hoàn thủ công (không qua event order.returned) — vd
   * hàng lỗi NCC trả trực tiếp tại kho. createdBy = actor ngay từ đầu (khác
   * luồng event, ở đây luôn có actor con người thao tác).
   */
  async createGoodsReturn(
    dto: CreateGoodsReturnDto,
    actorId: string,
  ): Promise<GoodsReturnDocument> {
    const lines: { itemId: Types.ObjectId; sku: string; quantity: number }[] =
      [];
    for (const itemDto of dto.items) {
      const item = await this.stockRepo.findItemById(itemDto.itemId);
      if (!item) throw new AppException('STOCK_ITEM_NOT_FOUND');
      lines.push({
        itemId: new Types.ObjectId(itemDto.itemId),
        sku: item.sku,
        quantity: itemDto.quantity,
      });
    }

    return this.repo.createGoodsReturn(
      dto.orderId,
      new Types.ObjectId(actorId),
      dto.note,
      lines,
    );
  }

  /**
   * RECEIVER gán kho nhận trả + phân loại GOOD/DAMAGED từng dòng. Chưa đụng
   * tồn kho thật — cho phép rà soát/sửa trước khi confirm(). isPerishable +
   * condition=GOOD bắt buộc lotId (nhập lại đúng lô còn hạn); condition=
   * DAMAGED không cần lotId (hàng sẽ bị hủy ngay, không cần biết đúng lô).
   *
   * `imagesByItemId` optional — ảnh minh chứng gắn theo đúng dòng (thường dùng
   * cho condition=DAMAGED nhưng không bắt buộc, xem AC IMG-05). Validate +
   * upload Cloudinary (folder wms/goods-return) ngay tại đây trước khi ghi.
   */
  async inspectGoodsReturn(
    id: string,
    dto: InspectGoodsReturnDto,
    actorId: string,
    imagesByItemId?: Map<string, UploadedImageFile[]>,
  ): Promise<GoodsReturnDocument> {
    const goodsReturn = await this.repo.findById(id);
    if (!goodsReturn) throw new AppException('GOODS_RETURN_NOT_FOUND');
    if (goodsReturn.status !== GoodsReturnStatus.DRAFT) {
      throw new AppException('GOODS_RETURN_ALREADY_DECIDED');
    }

    const warehouseId = new Types.ObjectId(dto.warehouseId);
    const warehouse = await this.warehouseRepo.findWarehouseById(
      dto.warehouseId,
    );
    if (!warehouse) throw new AppException('WAREHOUSE_NOT_FOUND');

    const lines: {
      itemId: Types.ObjectId;
      condition: GoodsReturnItemCondition;
      shelfId: Types.ObjectId;
      lotId: Types.ObjectId | null;
      images: string[];
    }[] = [];

    for (const itemDto of dto.items) {
      const existingLine = goodsReturn.items.find(
        (i) => i.itemId.toString() === itemDto.itemId,
      );
      if (!existingLine) throw new AppException('GOODS_RETURN_ITEM_NOT_FOUND');

      const shelf = await this.warehouseRepo.findShelfById(itemDto.shelfId);
      if (!shelf) throw new AppException('SHELF_NOT_FOUND');

      const item = await this.stockRepo.findItemById(itemDto.itemId);
      if (!item) throw new AppException('STOCK_ITEM_NOT_FOUND');
      if (
        item.isPerishable &&
        itemDto.condition === GoodsReturnItemCondition.GOOD &&
        !itemDto.lotId
      ) {
        throw new AppException('GOODS_RETURN_ITEM_ISPERISHABLE_NO_LOT');
      }

      const files = imagesByItemId?.get(itemDto.itemId) ?? [];
      const images: string[] = [];
      for (const file of files) {
        this.validateImageFile(file);
        const { url } = await this.cloudinary.uploadImage(
          file.buffer,
          'wms/goods-return',
        );
        images.push(url);
      }

      lines.push({
        itemId: new Types.ObjectId(itemDto.itemId),
        condition: itemDto.condition,
        shelfId: new Types.ObjectId(itemDto.shelfId),
        lotId: itemDto.lotId ? new Types.ObjectId(itemDto.lotId) : null,
        images,
      });
    }

    if (lines.length !== goodsReturn.items.length) {
      throw new AppException('GOODS_RETURN_ITEM_NOT_FOUND');
    }

    await this.repo.setInspected(
      id,
      warehouseId,
      new Types.ObjectId(actorId),
      lines,
    );

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('GOODS_RETURN_NOT_FOUND');
    return updated;
  }

  private validateImageFile(file: UploadedImageFile): void {
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Chỉ nhận file ảnh (jpeg/png/webp)',
      );
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new AppException('VALIDATION_FAILED', 'File ảnh tối đa 5MB');
    }
  }

  /**
   * RECEIVER xác nhận — trong 1 transaction: dòng GOOD nhập lại kho thật
   * (onHand+/InventoryStock+/RETURN_IN, sau commit bắn stock.changed(+) vì
   * available tăng thật). Dòng DAMAGED nhập TẠM (onHand+/InventoryStock+/
   * RETURN_IN) rồi NGAY LẬP TỨC hủy qua ScrapNoteService (onHand-/
   * InventoryStock-/SCRAP + tạo ScrapNote APPROVED skipAvailableSync=true) —
   * không bao giờ bắn stock.changed cho dòng này (net stock effect = 0,
   * hàng chưa từng sellable).
   */
  async confirmGoodsReturn(
    id: string,
    actorId: string,
  ): Promise<GoodsReturnDocument> {
    const goodsReturn = await this.repo.findById(id);
    if (!goodsReturn) throw new AppException('GOODS_RETURN_NOT_FOUND');
    if (goodsReturn.status !== GoodsReturnStatus.INSPECTED) {
      throw new AppException('GOODS_RETURN_NOT_INSPECTED');
    }

    const actorObjectId = new Types.ObjectId(actorId);
    const goodLines: { sku: string; quantity: number }[] = [];
    const scrapNoteIdByItemId = new Map<string, Types.ObjectId>();
    // S4-04: mọi dòng (GOOD và DAMAGED) đều chạm upsertBalance ở dưới — dòng DAMAGED
    // còn bị ScrapNoteService bù trừ ngay sau trong CÙNG transaction, nhưng vì
    // checkAndEmitStockLow đọc lại balance sau commit nên chỉ cần set map 1 lần ở
    // đây, không cần biết chi tiết bên trong ScrapNoteService.
    const touchedBalances = new Map<
      string,
      { itemId: Types.ObjectId; warehouseId: Types.ObjectId }
    >();

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      for (const line of goodsReturn.items) {
        if (!line.shelfId) continue; // đã inspect nên luôn có shelfId — guard cho type-safety

        await this.stockRepo.upsertInventory(
          line.itemId,
          goodsReturn.warehouseId!,
          line.shelfId,
          line.lotId,
          line.quantity,
          session,
        );
        await this.stockRepo.upsertBalance(
          line.itemId,
          goodsReturn.warehouseId!,
          line.quantity,
          0,
          0,
          session,
        );
        touchedBalances.set(
          `${line.itemId.toString()}:${goodsReturn.warehouseId!.toString()}`,
          { itemId: line.itemId, warehouseId: goodsReturn.warehouseId! },
        );
        await this.stockRepo.insertMovement(
          {
            itemId: line.itemId,
            warehouseId: goodsReturn.warehouseId!,
            shelfId: line.shelfId,
            lotId: line.lotId,
            type: MovementType.RETURN_IN,
            quantity: line.quantity,
            refType: 'goods_return',
            refId: goodsReturn._id,
            createdBy: actorObjectId,
          },
          session,
        );

        if (line.condition === GoodsReturnItemCondition.DAMAGED) {
          const scrapNoteId =
            await this.scrapNoteService.createApprovedScrapNoteForReturn({
              warehouseId: goodsReturn.warehouseId!,
              itemId: line.itemId,
              sku: line.sku,
              shelfId: line.shelfId,
              lotId: line.lotId,
              quantity: line.quantity,
              actorId: actorObjectId,
              session,
            });
          scrapNoteIdByItemId.set(line.itemId.toString(), scrapNoteId);
        } else {
          goodLines.push({ sku: line.sku, quantity: line.quantity });
        }
      }

      await this.repo.setRestocked(id, scrapNoteIdByItemId, session);
    });

    for (const line of goodLines) {
      const payload: StockChangedPayload = {
        sku: line.sku,
        delta: line.quantity,
      };
      const jobId = `goods_return:${id}:${line.sku}`;
      await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload, { jobId });
    }
    for (const { itemId, warehouseId } of touchedBalances.values()) {
      await this.stockService.checkAndEmitStockLow(itemId, warehouseId);
    }

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('GOODS_RETURN_NOT_FOUND');
    return updated;
  }

  /**
   * Huỷ phiếu — chỉ cho phép ở DRAFT/INSPECTED (chưa đụng tồn kho thật).
   */
  async cancelGoodsReturn(id: string): Promise<GoodsReturnDocument> {
    const goodsReturn = await this.repo.findById(id);
    if (!goodsReturn) throw new AppException('GOODS_RETURN_NOT_FOUND');
    if (
      goodsReturn.status === GoodsReturnStatus.RESTOCKED ||
      goodsReturn.status === GoodsReturnStatus.CANCELLED
    ) {
      throw new AppException('GOODS_RETURN_ALREADY_DECIDED');
    }

    await this.repo.setCancelled(id);

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('GOODS_RETURN_NOT_FOUND');
    return updated;
  }

  async listGoodsReturns(
    query: QueryGoodsReturnInput,
  ): Promise<{ data: GoodsReturnDocument[]; total: number }> {
    return this.repo.findAll(query);
  }

  async getGoodsReturn(id: string): Promise<GoodsReturnDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('GOODS_RETURN_NOT_FOUND');
    return doc;
  }
}
