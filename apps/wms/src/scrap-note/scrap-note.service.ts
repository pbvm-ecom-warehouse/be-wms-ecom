import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { AppException, CloudinaryService } from '@app/common';
import { EVENTS, QUEUES } from '@app/events';
import { Queue } from 'bullmq';
import { Types, type ClientSession } from 'mongoose';
import {
  ScrapNoteRepository,
  QueryScrapNoteInput,
} from './scrap-note.repository';
import type {
  CreateStockCountScrapFormDto,
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
import { DocumentNumberService } from '../document-number/document-number.service';
import { StockCountRepository } from '../stock-count/stock-count.repository';
import { StockCountStatus } from '../stock-count/schemas/stock-count.schema';
import { BarcodeService } from '../stock/barcode/barcode.service';
import { LotStatus } from '../stock/schemas/lot.schema';
import { ZonePurpose } from '../location/schemas/zone.schema';

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
    private readonly documentNumberService: DocumentNumberService,
    private readonly stockCountRepo: StockCountRepository,
    private readonly barcodeService: BarcodeService,
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /**
   * COUNTER tạo/cập nhật một đề xuất hủy từ đúng dòng đã đếm. Barcode chỉ
   * xác nhận SKU; shelf/lot phải khớp chính xác snapshot của Stock Count.
   */
  async createFromStockCount(
    stockCountId: string,
    itemId: string,
    dto: CreateStockCountScrapFormDto,
    actorId: string,
    imageFiles: UploadedImageFile[] = [],
  ): Promise<ScrapNoteDocument> {
    const stockCount = await this.stockCountRepo.findById(stockCountId);
    if (!stockCount) throw new AppException('STOCK_COUNT_NOT_FOUND');
    if (stockCount.status === StockCountStatus.APPROVED) {
      throw new AppException('STOCK_COUNT_ALREADY_APPROVED');
    }

    const lotId = dto.lotId ? new Types.ObjectId(dto.lotId) : null;
    const line = stockCount.items.find(
      (candidate) =>
        candidate.itemId.toString() === itemId &&
        candidate.shelfId.toString() === dto.shelfId &&
        candidate.cellId?.toString() === dto.cellId &&
        (candidate.lotId?.toString() ?? null) === (lotId?.toString() ?? null),
    );
    if (!line) throw new AppException('STOCK_COUNT_ITEM_MISMATCH');

    const scannedItemId = await this.barcodeService.findItemIdByCode(
      dto.itemBarcode,
    );
    if (!scannedItemId || scannedItemId.toString() !== itemId) {
      throw new AppException('SCRAP_NOTE_BARCODE_MISMATCH');
    }
    if (line.actualQty === null) {
      throw new AppException('SCRAP_NOTE_SOURCE_LINE_NOT_COUNTED');
    }
    if (dto.quantity > line.actualQty) {
      throw new AppException('SCRAP_NOTE_QTY_EXCEEDS_ACTUAL');
    }

    const sourceId = new Types.ObjectId(stockCountId);
    const existing = await this.repo.findBySourceStockCountId(sourceId);
    if (existing && existing.status !== ScrapNoteStatus.DRAFT) {
      throw new AppException('SCRAP_NOTE_ALREADY_DECIDED');
    }

    const uploadedImages: string[] = [];
    for (const file of imageFiles) {
      this.validateImageFile(file);
      const { url } = await this.cloudinary.uploadImage(
        file.buffer,
        'wms/scrap-note',
      );
      uploadedImages.push(url);
    }

    const itemObjectId = new Types.ObjectId(itemId);
    const shelfObjectId = new Types.ObjectId(dto.shelfId);
    const cellObjectId = new Types.ObjectId(dto.cellId);
    const existingLine = existing?.items.find(
      (candidate) =>
        candidate.itemId.toString() === itemId &&
        candidate.sourceCellId?.toString() === dto.cellId &&
        (candidate.lotId?.toString() ?? null) === (lotId?.toString() ?? null),
    );
    if (existingLine && dto.quantity > existingLine.lockedQuantity) {
      throw new AppException('SCRAP_NOTE_QTY_EXCEEDS_LOCKED_ROW');
    }

    const scrapNoteNumber =
      existing?.scrapNoteNumber ??
      (await this.documentNumberService.next('SCR'));
    let availabilityDelta = 0;
    let updated: ScrapNoteDocument | null = null;
    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      let lockedQuantity = existingLine?.lockedQuantity ?? 0;
      let excludedByExpired = existingLine?.excludedByExpired ?? false;
      if (!existingLine) {
        const locked = await this.stockRepo.lockInventoryRowForQuarantine(
          itemObjectId,
          shelfObjectId,
          cellObjectId,
          lotId,
          session,
          dto.quantity,
        );
        if (!locked) {
          throw new AppException('SCRAP_NOTE_SOURCE_ROW_LOCKED');
        }
        if (dto.quantity > locked.quantity) {
          throw new AppException('SCRAP_NOTE_QTY_EXCEEDS');
        }
        lockedQuantity = locked.quarantinedQuantity ?? dto.quantity;
        const lot = lotId
          ? await this.stockRepo.findLotById(lotId, session)
          : null;
        excludedByExpired = lot?.status === LotStatus.EXPIRED;
        if (!excludedByExpired) {
          const balanceLocked = await this.stockRepo.adjustQuarantinedBalance(
            itemObjectId,
            lockedQuantity,
            session,
          );
          if (!balanceLocked) throw new AppException('STOCK_BALANCE_NOT_FOUND');
          availabilityDelta = -lockedQuantity;
        }
      }

      updated = await this.repo.upsertFromStockCount(
        {
          sourceStockCountId: sourceId,
          scrapNoteNumber,
          createdBy: new Types.ObjectId(actorId),
          line: {
            itemId: itemObjectId,
            sku: line.sku,
            shelfId: shelfObjectId,
            sourceCellId: cellObjectId,
            lockedQuantity,
            excludedByExpired,
            lotId,
            quantity: dto.quantity,
            reason: dto.reason,
            ...(imageFiles.length > 0 ? { images: uploadedImages } : {}),
          },
        },
        session,
      );
      if (!updated) throw new AppException('SCRAP_NOTE_ALREADY_DECIDED');
    });

    if (availabilityDelta !== 0) {
      await this.stockQueue.add(
        EVENTS.STOCK_CHANGED,
        { sku: line.sku, delta: availabilityDelta },
        { jobId: `scrap_lock:${stockCountId}:${itemId}:${dto.cellId}` },
      );
    }
    if (!updated) throw new AppException('SCRAP_NOTE_ALREADY_DECIDED');
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

  /** MANAGER duyệt chỉ mở nhiệm vụ chuyển khu hủy; chưa trừ tồn vật lý. */
  async approveScrapNote(
    id: string,
    actorId: string,
  ): Promise<ScrapNoteDocument> {
    const scrapNote = await this.repo.findById(id);
    if (!scrapNote) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    if (scrapNote.status !== ScrapNoteStatus.DRAFT) {
      throw new AppException('SCRAP_NOTE_ALREADY_DECIDED');
    }
    if (scrapNote.sourceStockCountId) {
      const source = await this.stockCountRepo.findById(
        scrapNote.sourceStockCountId.toString(),
      );
      if (!source || source.status !== StockCountStatus.APPROVED) {
        throw new AppException('SCRAP_NOTE_SOURCE_NOT_APPROVED');
      }
    }

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      const claimed = await this.repo.claimApprovedIfDraft(
        id,
        new Types.ObjectId(actorId),
        session,
      );
      if (!claimed) throw new AppException('SCRAP_NOTE_ALREADY_DECIDED');
    });

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    return updated;
  }

  /**
   * COUNTER quét hàng + khoang nguồn + khoang khu hủy. Chỉ chuyển quantity
   * được duyệt; phần còn lại của dòng nguồn được mở khóa để Shipper dùng.
   */
  async moveItemToScrap(
    id: string,
    itemId: string,
    dto: {
      itemBarcode: string;
      sourceCellBarcode: string;
      targetCellBarcode: string;
    },
    actorId: string,
  ): Promise<ScrapNoteDocument> {
    const scrapNote = await this.repo.findById(id);
    if (!scrapNote) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    if (scrapNote.status !== ScrapNoteStatus.APPROVED) {
      throw new AppException('SCRAP_NOTE_NOT_APPROVED');
    }
    const scannedItemId = await this.barcodeService.findItemIdByCode(
      dto.itemBarcode,
    );
    if (!scannedItemId || scannedItemId.toString() !== itemId) {
      throw new AppException('SCRAP_NOTE_BARCODE_MISMATCH');
    }
    const [sourceCell, sourceShelfByCode, targetCell] = await Promise.all([
      this.locationRepo.findCellByCode(dto.sourceCellBarcode),
      this.locationRepo.findShelfByCode(dto.sourceCellBarcode),
      this.locationRepo.findCellByCode(dto.targetCellBarcode),
    ]);
    if ((!sourceCell && !sourceShelfByCode) || !targetCell) {
      throw new AppException('SCRAP_NOTE_CELL_NOT_FOUND');
    }
    const targetRack = await this.locationRepo.findRackById(
      targetCell.rackId.toString(),
    );
    const targetZone = targetRack
      ? await this.locationRepo.findZoneById(targetRack.zoneId.toString())
      : null;
    if (targetZone?.zonePurpose !== ZonePurpose.SCRAP) {
      throw new AppException('SCRAP_NOTE_TARGET_NOT_SCRAP_ZONE');
    }
    const sourceCellId = sourceCell?._id ?? null;
    const sourceShelfId = sourceCell?.shelfId ?? sourceShelfByCode!._id;
    const line = scrapNote.items.find(
      (candidate) =>
        candidate.itemId.toString() === itemId &&
        candidate.shelfId.toString() === sourceShelfId.toString() &&
        (candidate.sourceCellId?.toString() ?? null) ===
          (sourceCellId?.toString() ?? null) &&
        !candidate.scrapCellId,
    );
    if (!line) throw new AppException('SCRAP_NOTE_ITEM_MISMATCH');

    const targetShelfId = targetCell.shelfId;
    let availabilityDelta = 0;
    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      const sourceAfter =
        await this.stockRepo.decrementQuarantinedInventoryIfAvailable(
          line.itemId,
          sourceShelfId,
          sourceCellId,
          line.lotId,
          line.quantity,
          session,
        );
      if (!sourceAfter) throw new AppException('SCRAP_NOTE_QTY_EXCEEDS');

      await this.stockRepo.upsertInventory(
        line.itemId,
        targetShelfId,
        line.lotId,
        line.quantity,
        session,
        {
          cellId: targetCell._id,
          isQuarantined: true,
          quarantinedQuantityDelta: line.quantity,
        },
      );
      const releaseQuantity = Math.max(0, line.lockedQuantity - line.quantity);
      if (releaseQuantity > 0) {
        const released = await this.stockRepo.releaseInventoryQuarantine(
          line.itemId,
          sourceShelfId,
          sourceCellId,
          line.lotId,
          releaseQuantity,
          session,
        );
        if (!released) throw new AppException('STOCK_BALANCE_INVALID');
        const lot = line.lotId
          ? await this.stockRepo.findLotById(line.lotId, session)
          : null;
        const isExpired =
          line.excludedByExpired ||
          lot?.status === LotStatus.EXPIRED ||
          Boolean(lot?.expiryDate && lot.expiryDate <= new Date());
        const releasedBalance = await this.stockRepo.releaseQuarantinedBalance(
          line.itemId,
          releaseQuantity,
          isExpired,
          session,
        );
        if (!releasedBalance) throw new AppException('STOCK_BALANCE_INVALID');
        if (!isExpired) {
          availabilityDelta = releaseQuantity;
        }
      }

      for (const [shelfId, cellId, quantity] of [
        [sourceShelfId, sourceCellId, -line.quantity],
        [targetShelfId, targetCell._id, line.quantity],
      ] as const) {
        await this.stockRepo.insertMovement(
          {
            itemId: line.itemId,
            shelfId,
            cellId,
            lotId: line.lotId,
            type: MovementType.SCRAP_TRANSFER,
            quantity,
            refType: 'scrap_note',
            refId: scrapNote._id,
            createdBy: new Types.ObjectId(actorId),
          },
          session,
        );
      }

      const moved = await this.repo.markItemMovedToScrap(
        id,
        line.itemId,
        sourceCellId,
        targetCell._id,
        session,
      );
      if (!moved) throw new AppException('SCRAP_NOTE_ITEM_ALREADY_MOVED');
      await this.repo.markQuarantinedIfAllMoved(id, session);
    });

    if (availabilityDelta > 0) {
      await this.stockQueue.add(
        EVENTS.STOCK_CHANGED,
        { sku: line.sku, delta: availabilityDelta },
        {
          jobId: `scrap_move:${id}:${itemId}:${
            sourceCellId?.toString() ?? sourceShelfId.toString()
          }`,
        },
      );
    }
    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    return updated;
  }

  /** MANAGER xác nhận tiêu hủy vật lý sau khi mọi dòng đã vào khu SCRAP. */
  async disposeScrapNote(
    id: string,
    actorId: string,
  ): Promise<ScrapNoteDocument> {
    const scrapNote = await this.repo.findById(id);
    if (!scrapNote) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    if (scrapNote.status !== ScrapNoteStatus.QUARANTINED) {
      throw new AppException('SCRAP_NOTE_NOT_QUARANTINED');
    }
    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      const claimed = await this.repo.claimDisposedIfQuarantined(
        id,
        new Types.ObjectId(actorId),
        session,
      );
      if (!claimed) throw new AppException('SCRAP_NOTE_ALREADY_DISPOSED');

      for (const line of scrapNote.items) {
        if (!line.scrapCellId)
          throw new AppException('SCRAP_NOTE_NOT_QUARANTINED');
        const targetCell = await this.locationRepo.findCellById(
          line.scrapCellId.toString(),
          session,
        );
        if (!targetCell) throw new AppException('SCRAP_NOTE_CELL_NOT_FOUND');
        const removed =
          await this.stockRepo.decrementQuarantinedInventoryIfAvailable(
            line.itemId,
            targetCell.shelfId,
            line.scrapCellId,
            line.lotId,
            line.quantity,
            session,
          );
        if (!removed) throw new AppException('SCRAP_NOTE_QTY_EXCEEDS');
        const balanceUpdated = await this.stockRepo.disposeQuarantinedBalance(
          line.itemId,
          line.quantity,
          line.excludedByExpired,
          session,
        );
        if (!balanceUpdated) throw new AppException('STOCK_BALANCE_INVALID');
        await this.stockRepo.insertMovement(
          {
            itemId: line.itemId,
            shelfId: targetCell.shelfId,
            cellId: line.scrapCellId,
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
    });
    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('SCRAP_NOTE_NOT_FOUND');
    return updated;
  }

  /**
   * Dùng bởi GoodsReturnService (UC-09) khi confirm() gặp dòng DAMAGED: hàng
   * đã được nhập staging và cách ly trong cùng transaction. Tạo phiếu
   * APPROVED để COUNTER chuyển sang khu SCRAP; chưa trừ onHand tại đây.
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
    const scrapNoteNumber = await this.documentNumberService.next('SCR');
    const scrapNote = await this.repo.createApprovedScrapNote(
      params.actorId,
      [
        {
          itemId: params.itemId,
          sku: params.sku,
          shelfId: params.shelfId,
          sourceCellId: null,
          lockedQuantity: params.quantity,
          excludedByExpired: false,
          lotId: params.lotId,
          quantity: params.quantity,
          reason: 'Hàng hoàn trả bị hỏng (RMA)',
        },
      ],
      params.session,
      scrapNoteNumber,
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

    const releasedEvents: Array<{
      sku: string;
      quantity: number;
      cellId: string;
    }> = [];
    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      const claimed = await this.repo.claimRejectedIfDraft(
        id,
        new Types.ObjectId(actorId),
        dto.rejectReason,
        session,
      );
      if (!claimed) throw new AppException('SCRAP_NOTE_ALREADY_DECIDED');
      for (const line of scrapNote.items) {
        if (!line.sourceCellId) continue;
        const unlocked = await this.stockRepo.releaseInventoryQuarantine(
          line.itemId,
          line.shelfId,
          line.sourceCellId,
          line.lotId,
          line.lockedQuantity,
          session,
        );
        if (!unlocked) continue;
        if (line.lockedQuantity > 0) {
          const lot = line.lotId
            ? await this.stockRepo.findLotById(line.lotId, session)
            : null;
          const isExpired =
            line.excludedByExpired ||
            lot?.status === LotStatus.EXPIRED ||
            Boolean(lot?.expiryDate && lot.expiryDate <= new Date());
          if (isExpired) {
            const balanceReleased =
              await this.stockRepo.releaseQuarantinedBalance(
                line.itemId,
                line.lockedQuantity,
                isExpired,
                session,
              );
            if (!balanceReleased)
              throw new AppException('STOCK_BALANCE_INVALID');
          } else {
            const balanceReleased =
              await this.stockRepo.releaseQuarantinedBalance(
                line.itemId,
                line.lockedQuantity,
                false,
                session,
              );
            if (!balanceReleased)
              throw new AppException('STOCK_BALANCE_INVALID');
            releasedEvents.push({
              sku: line.sku,
              quantity: line.lockedQuantity,
              cellId: line.sourceCellId.toString(),
            });
          }
        }
      }
    });

    for (const event of releasedEvents) {
      await this.stockQueue.add(
        EVENTS.STOCK_CHANGED,
        { sku: event.sku, delta: event.quantity },
        { jobId: `scrap_reject:${id}:${event.cellId}` },
      );
    }

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
