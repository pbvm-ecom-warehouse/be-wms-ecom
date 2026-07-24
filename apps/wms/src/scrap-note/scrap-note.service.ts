import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { AppException, CloudinaryService } from '@app/common';
import { EVENTS, QUEUES, type StockChangedPayload } from '@app/events';
import { Queue } from 'bullmq';
import { Types, type ClientSession } from 'mongoose';
import {
  ScrapNoteRepository,
  QueryScrapNoteInput,
} from './scrap-note.repository';
import type {
  CreateScrapNoteDto,
  RejectScrapNoteDto,
} from './dto/scrap-note.dto';
import {
  ScrapNoteStatus,
  type ScrapNoteDocument,
} from './schemas/scrap-note.schema';
import { StockRepository } from '../stock/stock.repository';
import { StockService } from '../stock/stock.service';
import { LocationRepository } from '../location/location.repository';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';

// Giới hạn upload ảnh minh chứng hủy hàng — theo đúng ràng buộc thiết kế IMG-01/IMG-06.
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class ScrapNoteService {
  constructor(
    private readonly repo: ScrapNoteRepository,
    private readonly stockRepo: StockRepository,
    private readonly stockService: StockService,
    private readonly locationRepo: LocationRepository,
    private readonly stockTransactionHelper: StockTransactionHelper,
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /**
   * COUNTER/RECEIVER đề xuất hủy — tạo phiếu kèm toàn bộ dòng ngay từ đầu.
   * Validate từng dòng: item tồn tại, isPerishable thì bắt buộc lotId, tồn
   * tại đúng vị trí (shelf+lot) phải đủ số lượng đề xuất. Không đụng tồn
   * kho thật ở bước này — chỉ MANAGER approve mới trừ.
   *
   * `imagesByIndex` optional — ảnh minh chứng gắn theo đúng dòng (vị trí trong
   * `dto.items`), đính lúc tạo phiếu (không auto-generate, xem AC IMG-06).
   * Validate + upload Cloudinary (folder wms/scrap-note) ngay tại đây trước
   * khi ghi.
   */
  async createScrapNote(
    dto: CreateScrapNoteDto,
    actorId: string,
    imagesByIndex?: Map<number, UploadedImageFile[]>,
  ): Promise<ScrapNoteDocument> {
    const lines: {
      itemId: Types.ObjectId;
      sku: string;
      shelfId: Types.ObjectId;
      lotId: Types.ObjectId | null;
      quantity: number;
      reason: string;
      images: string[];
    }[] = [];

    for (const [index, itemDto] of dto.items.entries()) {
      const item = await this.stockRepo.findItemById(itemDto.itemId);
      if (!item) throw new AppException('STOCK_ITEM_NOT_FOUND');
      if (item.isPerishable && !itemDto.lotId) {
        throw new AppException('SCRAP_NOTE_ITEM_ISPERISHABLE_NO_LOT');
      }

      const shelf = await this.locationRepo.findShelfById(itemDto.shelfId);
      if (!shelf) throw new AppException('SHELF_NOT_FOUND');

      const itemId = new Types.ObjectId(itemDto.itemId);
      const shelfId = new Types.ObjectId(itemDto.shelfId);
      const lotId = itemDto.lotId ? new Types.ObjectId(itemDto.lotId) : null;

      const inventory = await this.stockRepo.findInventory(
        itemId,
        shelfId,
        lotId,
      );
      if (!inventory || inventory.quantity < itemDto.quantity) {
        throw new AppException('SCRAP_NOTE_QTY_EXCEEDS');
      }

      const files = imagesByIndex?.get(index) ?? [];
      const images: string[] = [];
      for (const file of files) {
        this.validateImageFile(file);
        const { url } = await this.cloudinary.uploadImage(
          file.buffer,
          'wms/scrap-note',
        );
        images.push(url);
      }

      lines.push({
        itemId,
        sku: item.sku,
        shelfId,
        lotId,
        quantity: itemDto.quantity,
        reason: itemDto.reason,
        images,
      });
    }

    return this.repo.createScrapNote(
      dto.note,
      new Types.ObjectId(actorId),
      lines,
    );
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
   * MANAGER duyệt cả phiếu — trong 1 transaction, trừ InventoryStock +
   * StockBalance.onHand cho mọi dòng, và trừ thêm StockBalance.expired cho
   * dòng có lotId (hủy vì hết hạn — available không đổi, hàng vốn đã ngoài
   * available). Sau khi commit, bắn stock.changed CHỈ cho dòng không có
   * lotId VÀ không có skipAvailableSync (hủy vì hỏng, hàng thật sự đang
   * available trước khi hủy — phải sync Ecom). Dòng skipAvailableSync=true
   * (sinh từ GoodsReturn UC-09, hàng DAMAGED chưa từng vào available) không
   * bao giờ bắn — xem GoodsReturnService.confirmGoodsReturn.
   */
  async approveScrapNote(
    id: string,
    actorId: string,
  ): Promise<ScrapNoteDocument> {
    const scrapNote = await this.repo.findById(id);
    if (!scrapNote) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    if (scrapNote.status !== ScrapNoteStatus.DRAFT) {
      throw new AppException('SCRAP_NOTE_ALREADY_DECIDED');
    }

    // S4-04: nhiều dòng scrap có thể cùng itemId (vd cùng SKU hỏng ở 2 lot khác
    // nhau) — checkAndEmitStockLow đọc lại balance sau commit nên chỉ cần gọi
    // 1 lần cho mỗi itemId, dồn vào set để dedup trước.
    const touchedItemIds = new Set<string>();

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      for (const line of scrapNote.items) {
        await this.stockRepo.upsertInventory(
          line.itemId,
          line.shelfId,
          line.lotId,
          -line.quantity,
          session,
        );
        const expiredDelta = line.lotId ? -line.quantity : 0;
        await this.stockRepo.upsertBalance(
          line.itemId,
          -line.quantity,
          0,
          expiredDelta,
          session,
        );
        touchedItemIds.add(line.itemId.toString());
        await this.stockRepo.insertMovement(
          {
            itemId: line.itemId,
            shelfId: line.shelfId,
            lotId: line.lotId,
            type: MovementType.SCRAP,
            quantity: -line.quantity,
            refType: 'scrap_note',
            refId: scrapNote._id,
            createdBy: new Types.ObjectId(actorId),
          },
          session,
        );
      }
      await this.repo.setApproved(id, new Types.ObjectId(actorId), session);
    });

    for (const line of scrapNote.items) {
      if (line.lotId || line.skipAvailableSync) continue;
      const payload: StockChangedPayload = {
        sku: line.sku,
        delta: -line.quantity,
      };
      const jobId = `scrap_note:${id}:${line.sku}`;
      await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload, { jobId });
    }

    // S4-04: kiểm tra ngưỡng thấp tồn cho MỌI dòng (bao gồm cả lotId/skipAvailableSync
    // — khác với vòng lặp stock.changed phía trên, vì stock.low quan tâm available
    // sau MỌI biến động onHand, không chỉ dòng ảnh hưởng available đã sync Ecom).
    // Lặp theo touchedItemIds (đã dedup) để không bắn trùng alert khi nhiều dòng
    // cùng item.
    for (const itemIdStr of touchedItemIds) {
      await this.stockService.checkAndEmitStockLow(
        new Types.ObjectId(itemIdStr),
      );
    }

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    return updated;
  }

  /**
   * Dùng bởi GoodsReturnService (UC-09) khi confirm() gặp dòng DAMAGED: hàng
   * đã được nhập TẠM vào InventoryStock/onHand trong CÙNG transaction ngay
   * trước lệnh gọi này — ở đây trừ lại đúng số lượng đó (SCRAP) và ghi nhận
   * 1 ScrapNote đã APPROVED làm audit trail, với skipAvailableSync=true để
   * approveScrapNote's stock.changed logic không áp dụng ở đây (phương thức
   * này tự thực hiện việc trừ tồn, không gọi approveScrapNote). KHÔNG bắn
   * stock.changed — hàng này chưa từng tăng available.
   */
  async createApprovedScrapNoteForReturn(params: {
    itemId: Types.ObjectId;
    sku: string;
    shelfId: Types.ObjectId;
    lotId: Types.ObjectId | null;
    quantity: number;
    actorId: Types.ObjectId;
    session: ClientSession;
  }): Promise<Types.ObjectId> {
    const scrapNote = await this.repo.createApprovedScrapNote(
      params.actorId,
      [
        {
          itemId: params.itemId,
          sku: params.sku,
          shelfId: params.shelfId,
          lotId: params.lotId,
          quantity: params.quantity,
          reason: 'Hàng hoàn trả bị hỏng (RMA)',
          skipAvailableSync: true,
        },
      ],
      params.session,
    );
    await this.stockRepo.upsertInventory(
      params.itemId,
      params.shelfId,
      params.lotId,
      -params.quantity,
      params.session,
    );
    await this.stockRepo.upsertBalance(
      params.itemId,
      -params.quantity,
      0,
      0,
      params.session,
    );
    await this.stockRepo.insertMovement(
      {
        itemId: params.itemId,
        shelfId: params.shelfId,
        lotId: params.lotId,
        type: MovementType.SCRAP,
        quantity: -params.quantity,
        refType: 'scrap_note',
        refId: scrapNote._id,
        createdBy: params.actorId,
      },
      params.session,
    );

    return scrapNote._id;
  }

  /**
   * MANAGER từ chối — không đụng tồn kho, chỉ ghi nhận lý do từ chối.
   */
  async rejectScrapNote(
    id: string,
    dto: RejectScrapNoteDto,
    actorId: string,
  ): Promise<ScrapNoteDocument> {
    const scrapNote = await this.repo.findById(id);
    if (!scrapNote) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    if (scrapNote.status !== ScrapNoteStatus.DRAFT) {
      throw new AppException('SCRAP_NOTE_ALREADY_DECIDED');
    }

    await this.repo.setRejected(
      id,
      new Types.ObjectId(actorId),
      dto.rejectReason,
    );

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    return updated;
  }

  async listScrapNotes(
    query: QueryScrapNoteInput,
  ): Promise<{ data: ScrapNoteDocument[]; total: number }> {
    return this.repo.findAll(query);
  }

  async getScrapNote(id: string): Promise<ScrapNoteDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    return doc;
  }
}
