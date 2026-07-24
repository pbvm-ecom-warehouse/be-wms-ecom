import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  EVENTS,
  QUEUES,
  type StockChangedPayload,
  type StockLowPayload,
  type WarehouseItemCreatedPayload,
} from '@app/events';
import { AppException, CloudinaryService } from '@app/common';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { StockRepository } from './stock.repository';
import type { CreateWarehouseItemData } from './stock.repository';
import type { WarehouseItemDocument } from './schemas/warehouse-item.schema';
import { ItemType } from './schemas/warehouse-item.schema';
import type { QueryWarehouseItemDto } from './dto/query-warehouse-item.dto';
import type {
  CreateWarehouseItemDto,
  UpdateWarehouseItemDto,
} from './dto/create-warehouse-item.dto';
import { SkuTemplateService } from './sku/sku-template.service';
import {
  BarcodeService,
  isMongoDuplicateKeyError,
} from './barcode/barcode.service';
import { StockTransactionHelper } from './helpers/with-stock-transaction.helper';

// Giới hạn upload ảnh mặt hàng — nhất quán với StockCountService (IMG-01/IMG-07).
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * PRODUCER: khi `available` (= onHand - reserved - expired) của 1 SKU đổi
 * do biến động phía WMS, bắn event stock.changed sang Ecommerce (Σ mọi kho).
 * Service production — được gọi thật từ GRN, kiểm kho, chuyển kho, in ly,
 * scrap-note, goods-return (xem các domain đó để biết nơi gọi).
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly stockRepo: StockRepository,
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATION)
    private readonly notificationQueue: Queue,
    private readonly skuTemplateSvc: SkuTemplateService,
    private readonly barcodeSvc: BarcodeService,
    private readonly txHelper: StockTransactionHelper,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /** Phát event báo Ecommerce cộng/trừ availableQty theo delta (đã gộp mọi kho).
   * jobId = refType:refId:sku — deterministic theo đúng chứng từ nguồn (khớp
   * StockMovement.refType/refId), để BullMQ tự chặn tạo job trùng nếu bị gọi
   * lặp cho cùng 1 biến động thật (vd retry ở tầng trên) — tránh Ecom cộng
   * dồn availableQty 2 lần cho cùng 1 sự kiện. */
  async emitStockChanged(
    sku: string,
    delta: number,
    refType: string,
    refId: Types.ObjectId | string,
  ): Promise<void> {
    const payload: StockChangedPayload = { sku, delta };
    const jobId = `${refType}:${refId.toString()}:${sku}`;
    await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload, { jobId });
    this.logger.log(`stock.changed → sku=${sku} delta=${delta} jobId=${jobId}`);
  }

  /**
   * Tính lại available tổng (mọi kho) của 1 item rồi báo Ecommerce.
   * Dùng sau khi ghi stock_balances trong các nghiệp vụ WMS.
   */
  async publishAvailableForItem(
    itemId: string,
    delta: number,
    refType: string,
    refId: Types.ObjectId | string,
  ): Promise<void> {
    const item = await this.stockRepo.findSkuById(itemId);
    if (!item) return;
    await this.emitStockChanged(item.sku, delta, refType, refId);
  }

  /**
   * Kiểm tra available HIỆN TẠI (đọc lại DB, KHÔNG nhận balance qua tham số) sau
   * biến động, phát stock.low nếu dưới ngưỡng minQuantity. PHẢI gọi SAU KHI
   * transaction Mongo đã commit — BullMQ không tham gia transaction. Đọc lại (thay
   * vì dùng giá trị upsertBalance trả về ngay trong transaction) để luôn đúng với
   * trạng thái CUỐI CÙNG khi 1 (item,warehouse) bị chạm nhiều lần trong cùng
   * transaction (vd GoodsReturn dòng DAMAGED: RETURN_IN rồi SCRAP bù ngay sau).
   * KHÔNG dùng jobId khi add job — mỗi lần gọi đều phải tạo job mới (quyết định:
   * không dedup, chấp nhận báo lại nếu tồn thấp kéo dài qua nhiều biến động).
   */
  async checkAndEmitStockLow(
    itemId: Types.ObjectId,
    warehouseId: Types.ObjectId,
  ): Promise<void> {
    const item = await this.stockRepo.findSkuAndMinQuantityById(itemId);
    if (!item || item.minQuantity == null) return;

    const balance = await this.stockRepo.findBalanceByItemAndWarehouse(
      itemId,
      warehouseId,
    );
    if (!balance) return;

    const available = balance.onHand - balance.reserved - balance.expired;
    if (available >= item.minQuantity) return;

    const payload: StockLowPayload = {
      sku: item.sku,
      warehouseId: warehouseId.toString(),
      available,
      minQuantity: item.minQuantity,
    };
    await this.notificationQueue.add(EVENTS.STOCK_LOW, payload);
    this.logger.log(
      `stock.low → sku=${item.sku} warehouseId=${warehouseId.toString()} available=${available} minQuantity=${item.minQuantity}`,
    );
  }

  /**
   * Tạo WarehouseItem CUP_BLANK/MATERIAL/PACKAGING — sku/barcode/attributes
   * hoàn toàn do BE tự resolve, KHÔNG tin bất kỳ giá trị nào từ client ngoài
   * templateId + attributeOptionIds (issue #25). CUP_PRINTED bị chặn ở đây —
   * chỉ tạo được qua PrintJobService.resolveOutputItem (đường nội bộ, xem
   * print-job.service.ts, không đổi trong scope issue này).
   *
   * Create item + đặt barcode registry trong CÙNG 1 Mongo transaction — nếu
   * 1 trong 2 fail thì rollback cả 2 (issue #25: "Create item + registry trong
   * cùng Mongo transaction"). Lỗi 11000 trên unique index sku bị bắt và map
   * sang STOCK_ITEM_SKU_CONFLICT (409) thay vì để lộ raw MongoServerError
   * (checklist: "không trả 500 khi race").
   */
  async createWarehouseItem(
    dto: CreateWarehouseItemDto,
    actorId: string,
    imageFiles?: UploadedImageFile[],
  ): Promise<WarehouseItemDocument> {
    // dto.type theo type CreateWarehouseItemDto không thể là CUP_PRINTED (đã
    // giới hạn @IsIn ở DTO) — check runtime này là phòng hờ, vì class-validator
    // chỉ chặn ở request thật qua ValidationPipe, không chặn khi service được
    // gọi trực tiếp (vd unit test, code path khác trong tương lai).
    if ((dto.type as ItemType) === ItemType.CUP_PRINTED) {
      throw new AppException('STOCK_SKU_TEMPLATE_MISMATCH');
    }

    const { sku, attributeSnapshot } =
      await this.skuTemplateSvc.resolveAndBuildSku(
        dto.templateId,
        dto.type,
        dto.attributeOptionIds,
      );

    // Upload ảnh TRƯỚC transaction — Cloudinary không tham gia Mongo session,
    // nhất quán với StockCountService.countItem (upload rồi mới ghi DB).
    const images: string[] = [];
    for (const file of imageFiles ?? []) {
      this.validateImageFile(file);
      const { url } = await this.cloudinary.uploadImage(
        file.buffer,
        'wms/warehouse-item',
      );
      images.push(url);
    }

    try {
      const createdItem = await this.txHelper.withStockTransaction(async (session) => {
        const itemId = new Types.ObjectId();
        const barcode = await this.barcodeSvc.generateAndReservePrimaryBarcode(
          itemId,
          session,
        );

        const data: CreateWarehouseItemData = {
          _id: itemId,
          sku,
          barcode,
          name: dto.name,
          type: dto.type,
          unit: dto.unit,
          altUnits: dto.altUnits,
          attributes: attributeSnapshot,
          isPerishable: dto.isPerishable,
          nearExpiryDays: dto.nearExpiryDays,
          minQuantity: dto.minQuantity,
          depth: dto.depth,
          width: dto.width,
          height: dto.height,
          images,
        };

        return this.stockRepo.createItem(
          data,
          new Types.ObjectId(actorId),
          session,
        );
      });

      try {
        const payload: WarehouseItemCreatedPayload = {
          sku: createdItem.sku,
          name: createdItem.name,
          type: createdItem.type,
          unit: createdItem.unit,
          initialQty: 0,
          attributes: (createdItem.attributes ?? []).map((attr) => ({
            code: attr.code,
            value: attr.value,
            name: attr.name,
          })),
        };
        await this.stockQueue.add(EVENTS.ITEM_CREATED, payload, {
          jobId: `item_created-${createdItem.sku}`,
        });
        this.logger.log(`warehouse_item.created → sku=${createdItem.sku} (initialQty=0)`);
      } catch (evtErr) {
        this.logger.error(
          `Lỗi khi phát sự kiện warehouse_item.created cho SKU ${createdItem.sku}:`,
          evtErr,
        );
      }

      return createdItem;
    } catch (err) {
      if (isMongoDuplicateKeyError(err)) {
        throw new AppException('STOCK_ITEM_SKU_CONFLICT');
      }
      throw err;
    }
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

  async listWarehouseItems(
    query: QueryWarehouseItemDto,
  ): Promise<{ data: WarehouseItemDocument[]; total: number }> {
    return this.stockRepo.findItems(query);
  }

  async getWarehouseItem(id: string): Promise<WarehouseItemDocument> {
    const doc = await this.stockRepo.findItemByIdDocument(id);
    if (!doc) throw new AppException('STOCK_ITEM_NOT_FOUND');
    return doc;
  }

  async updateWarehouseItem(
    id: string,
    dto: UpdateWarehouseItemDto,
    actorId: string,
  ): Promise<WarehouseItemDocument> {
    const doc = await this.stockRepo.updateItem(id, dto, actorId);
    if (!doc) throw new AppException('STOCK_ITEM_NOT_FOUND');
    return doc;
  }

  async deleteWarehouseItem(id: string, actorId: string): Promise<void> {
    const deleted = await this.stockRepo.softDeleteItem(id, actorId);
    if (!deleted) throw new AppException('STOCK_ITEM_NOT_FOUND');
  }
}
