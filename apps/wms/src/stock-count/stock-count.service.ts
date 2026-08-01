import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AppException, CloudinaryService } from '@app/common';
import { EVENTS, QUEUES, type StockChangedPayload } from '@app/events';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import {
  StockCountRepository,
  QueryStockCountInput,
} from './stock-count.repository';
import type {
  ApproveStockCountDto,
  CountStockCountItemDto,
  CreateStockCountDto,
} from './dto/stock-count.dto';
import {
  StockCountStatus,
  type StockCountDocument,
} from './schemas/stock-count.schema';
import { StockRepository } from '../stock/stock.repository';
import { StockService } from '../stock/stock.service';
import { LocationRepository } from '../location/location.repository';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import { DocumentNumberService } from '../document-number/document-number.service';

// Giới hạn upload ảnh minh chứng lệch tồn — theo đúng ràng buộc thiết kế IMG-01/IMG-07.
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class StockCountService {
  private readonly logger = new Logger(StockCountService.name);

  constructor(
    private readonly repo: StockCountRepository,
    private readonly stockRepo: StockRepository,
    private readonly stockService: StockService,
    private readonly locationRepo: LocationRepository,
    private readonly stockTransactionHelper: StockTransactionHelper,
    private readonly documentNumberService: DocumentNumberService,
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /**
   * MANAGER tạo phiếu kiểm kho — auto-generate dòng từ InventoryStock hiện có
   * trong phạm vi (toàn kho nếu không truyền zoneId). Không cho tạo phiếu
   * rỗng vì không có gì để đếm.
   */
  async createStockCount(
    dto: CreateStockCountDto,
    actorId: string,
  ): Promise<StockCountDocument> {
    let zoneId: Types.ObjectId | null = null;
    let shelfIds: Types.ObjectId[] | undefined;
    if (dto.zoneId) {
      const zone = await this.locationRepo.findZoneById(dto.zoneId);
      if (!zone) {
        throw new AppException('ZONE_NOT_FOUND');
      }
      zoneId = new Types.ObjectId(dto.zoneId);
      shelfIds = await this.locationRepo.findShelfIdsByZone(dto.zoneId);
    }

    const inventory = await this.stockRepo.findInventoryByScope(shelfIds);
    if (inventory.length === 0) {
      throw new AppException('STOCK_COUNT_EMPTY_SCOPE');
    }

    // Batch tra sku 1 lần cho mọi itemId thay vì N+1 query findSkuById từng
    // dòng — quan trọng với kiểm kho toàn kho (có thể hàng trăm/nghìn dòng).
    const distinctItemIds = [
      ...new Map(
        inventory.map((inv) => [inv.itemId.toString(), inv.itemId]),
      ).values(),
    ];
    const items = await this.stockRepo.findItemsByIds(distinctItemIds);
    const skuByItemId = new Map(
      items.map((item) => [item._id.toString(), item.sku]),
    );

    // InventoryStock có itemId không còn khớp WarehouseItem nào (dữ liệu mồ
    // côi) bị bỏ qua — log warning thay vì mặc định sku:'' (sku rỗng sẽ làm
    // hỏng payload stock.changed và có thể đụng jobId với dòng mồ côi khác
    // lúc approve). Một dòng lỗi không nên chặn tạo phiếu cho phần còn lại.
    const lines: {
      itemId: Types.ObjectId;
      sku: string;
      shelfId: Types.ObjectId;
      cellId: Types.ObjectId;
      lotId: Types.ObjectId | null;
      systemQty: number;
    }[] = [];
    for (const inv of inventory) {
      // Staging và dữ liệu legacy chưa có khoang không phải là vị trí kiểm kê
      // vật lý. Preflight/migration xử lý legacy riêng, không gộp nhiều khoang.
      if (!inv.cellId) continue;
      const sku = skuByItemId.get(inv.itemId.toString());
      if (!sku) {
        this.logger.warn(
          `itemId=${inv.itemId.toString()} không khớp WarehouseItem nào → bỏ qua dòng này khi tạo StockCount.`,
        );
        continue;
      }
      lines.push({
        itemId: inv.itemId,
        sku,
        shelfId: inv.shelfId,
        cellId: inv.cellId,
        lotId: inv.lotId,
        systemQty: inv.quantity,
      });
    }

    if (lines.length === 0) {
      throw new AppException('STOCK_COUNT_EMPTY_SCOPE');
    }

    const stockCountNumber = await this.documentNumberService.next('SC');
    return this.repo.createStockCount(
      zoneId,
      dto.note,
      new Types.ObjectId(actorId),
      lines,
      stockCountNumber,
    );
  }

  /**
   * COUNTER nhập số đếm thực cho 1 dòng (item+shelf+lot). Không đổi tồn thật
   * ngay — chỉ ghi nhận actualQty/delta trên chính StockCount, chờ MANAGER
   * approve mới áp dụng ADJUST.
   *
   * `images` optional — ảnh minh chứng lệch tồn (khuyến khích khi delta !== 0
   * nhưng không bắt buộc ở tầng validate, xem AC IMG-07). Validate + upload
   * Cloudinary (folder wms/stock-count) ngay tại đây trước khi ghi.
   */
  async countItem(
    id: string,
    itemId: string,
    dto: CountStockCountItemDto,
    actorId: string,
    imageFiles?: UploadedImageFile[],
  ): Promise<StockCountDocument> {
    const stockCount = await this.repo.findById(id);
    if (!stockCount) throw new AppException('STOCK_COUNT_NOT_FOUND');
    if (
      ![StockCountStatus.DRAFT, StockCountStatus.IN_PROGRESS].includes(
        stockCount.status,
      )
    ) {
      throw new AppException(
        stockCount.status === StockCountStatus.APPROVED
          ? 'STOCK_COUNT_ALREADY_APPROVED'
          : 'STOCK_COUNT_NOT_COUNTABLE',
      );
    }

    const itemObjId = new Types.ObjectId(itemId);
    const shelfObjId = new Types.ObjectId(dto.shelfId);
    const lotObjId = dto.lotId ? new Types.ObjectId(dto.lotId) : null;

    const line = stockCount.items.find(
      (i) =>
        i.itemId.toString() === itemId &&
        i.shelfId.toString() === dto.shelfId &&
        i.cellId?.toString() === dto.cellId &&
        (i.lotId?.toString() ?? null) === (dto.lotId ?? null),
    );
    if (!line) throw new AppException('STOCK_COUNT_ITEM_MISMATCH');
    const cellObjId = new Types.ObjectId(dto.cellId);

    const currentInventory = await this.stockRepo.findInventory(
      itemObjId,
      shelfObjId,
      lotObjId,
      undefined,
      cellObjId,
    );
    const currentSystemQty = currentInventory?.quantity ?? 0;

    if (stockCount.status === StockCountStatus.DRAFT) {
      await this.repo.setCountedByIfDraft(id, new Types.ObjectId(actorId));
    }

    const images: string[] = [];
    for (const file of imageFiles ?? []) {
      this.validateImageFile(file);
      const { url } = await this.cloudinary.uploadImage(
        file.buffer,
        'wms/stock-count',
      );
      images.push(url);
    }

    await this.repo.countItem(
      id,
      itemObjId,
      shelfObjId,
      cellObjId,
      lotObjId,
      currentSystemQty,
      dto.actualQty,
      dto.reason ?? null,
      images,
    );
    await this.repo.markCompletedIfAllCounted(id);

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('STOCK_COUNT_NOT_FOUND');
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
   * MANAGER duyệt cả phiếu — áp ADJUST cho mọi dòng có delta !== 0 trong 1
   * transaction, rồi bắn stock.changed cho mỗi dòng lệch (available đổi
   * trực tiếp qua onHand, không qua reserved, nên luôn cần sync Ecom).
   */
  async approveStockCount(
    id: string,
    dto: ApproveStockCountDto,
    actorId: string,
  ): Promise<StockCountDocument> {
    const stockCount = await this.repo.findById(id);
    if (!stockCount) throw new AppException('STOCK_COUNT_NOT_FOUND');
    if (stockCount.status !== StockCountStatus.COMPLETED) {
      throw new AppException('STOCK_COUNT_NOT_COMPLETED');
    }

    const changedLines = stockCount.items.filter(
      (i) => i.delta !== null && i.delta !== 0,
    );

    // S4-04: nhiều dòng lệch có thể cùng itemId (vd cùng SKU lệch ở 2 kệ/lot
    // khác nhau) — checkAndEmitStockLow đọc lại balance sau commit nên chỉ cần
    // gọi 1 lần cho mỗi itemId, dồn vào set để dedup trước.
    const touchedItemIds = new Set<string>();

    type StaleLineKey = {
      itemId: Types.ObjectId;
      shelfId: Types.ObjectId;
      cellId: Types.ObjectId;
      lotId: Types.ObjectId | null;
    };
    let staleLine: StaleLineKey | null = null;
    try {
      await this.stockTransactionHelper.withStockTransaction(
        async (session) => {
          const claimed = await this.repo.claimApprovedIfCompleted(
            id,
            new Types.ObjectId(actorId),
            dto.reason,
            session,
          );
          if (!claimed) throw new AppException('STOCK_COUNT_ALREADY_APPROVED');

          for (const line of stockCount.items) {
            const current = await this.stockRepo.findInventory(
              line.itemId,
              line.shelfId,
              line.lotId,
              session,
              line.cellId,
            );
            if ((current?.quantity ?? 0) !== line.systemQty) {
              staleLine = {
                itemId: line.itemId,
                shelfId: line.shelfId,
                cellId: line.cellId,
                lotId: line.lotId,
              };
              throw new AppException('STOCK_COUNT_STALE_LINE');
            }
            if (!line.delta) continue;
            const delta = line.delta;
            if (delta < 0 && (current?.quarantinedQuantity ?? 0) > 0) {
              const adjusted =
                await this.stockRepo.decrementInventoryIfAvailable(
                  line.itemId,
                  line.shelfId,
                  line.cellId,
                  line.lotId,
                  -delta,
                  session,
                  true,
                );
              if (!adjusted) throw new AppException('STOCK_COUNT_STALE_LINE');
            } else {
              await this.stockRepo.upsertInventory(
                line.itemId,
                line.shelfId,
                line.lotId,
                delta,
                session,
                { cellId: line.cellId },
              );
            }
            await this.stockRepo.upsertBalance(
              line.itemId,
              delta,
              0,
              0,
              session,
            );
            touchedItemIds.add(line.itemId.toString());
            await this.stockRepo.insertMovement(
              {
                itemId: line.itemId,
                shelfId: line.shelfId,
                cellId: line.cellId,
                lotId: line.lotId,
                type: MovementType.ADJUST,
                quantity: delta,
                refType: 'stock_count',
                refId: stockCount._id,
                createdBy: new Types.ObjectId(actorId),
              },
              session,
            );
          }
        },
      );
    } catch (error) {
      const stale = staleLine as StaleLineKey | null;
      if (stale) {
        await this.repo.reopenLineForRecount(
          id,
          stale.itemId,
          stale.shelfId,
          stale.cellId,
          stale.lotId,
        );
      }
      throw error;
    }

    const deltaBySku = new Map<string, number>();
    for (const line of changedLines) {
      deltaBySku.set(line.sku, (deltaBySku.get(line.sku) ?? 0) + line.delta!);
    }
    for (const [sku, delta] of deltaBySku) {
      if (delta === 0) continue;
      const payload: StockChangedPayload = {
        sku,
        delta,
      };
      const jobId = `stock_count:${id}:${sku}`;
      await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload, { jobId });
    }

    // S4-04: kiểm tra ngưỡng thấp tồn — sau khi commit. Lặp theo touchedItemIds
    // (đã dedup) để không bắn trùng alert khi nhiều dòng lệch cùng item.
    for (const itemIdStr of touchedItemIds) {
      await this.stockService.checkAndEmitStockLow(
        new Types.ObjectId(itemIdStr),
      );
    }

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('STOCK_COUNT_NOT_FOUND');
    return updated;
  }

  async listStockCounts(
    query: QueryStockCountInput,
  ): Promise<{ data: StockCountDocument[]; total: number }> {
    return this.repo.findAll(query);
  }

  async getStockCount(id: string): Promise<StockCountDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('STOCK_COUNT_NOT_FOUND');
    return doc;
  }
}
