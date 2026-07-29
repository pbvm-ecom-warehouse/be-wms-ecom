import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '@app/common';
import {
  EVENTS,
  PrintStage,
  QUEUES,
  type PrintCompletedPayload,
  type PrintRequestedPayload,
  type StockChangedPayload,
} from '@app/events';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { PrintJobRepository, QueryPrintJobInput } from './print-job.repository';
import type {
  CompletePrintJobItemDto,
  ConsumePrintJobItemDto,
  PutawayPrintJobItemDto,
} from './dto/print-job.dto';
import {
  PrintJobLineStatus,
  PrintJobStatus,
  type PrintJobDocument,
} from './schemas/print-job.schema';
import { StockRepository } from '../stock/stock.repository';
import { StockService } from '../stock/stock.service';
import { ItemType } from '../stock/schemas/warehouse-item.schema';
import { LocationRepository } from '../location/location.repository';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import { BarcodeService } from '../stock/barcode/barcode.service';
import { DocumentNumberService } from '../document-number/document-number.service';

interface ResolvedLine {
  orderItemId: string;
  inputItemId: Types.ObjectId;
  outputItemId?: Types.ObjectId;
  outputBarcode?: string;
  sku: string;
  designFile: string;
  quantity: number;
  reservedQty: number;
  storageProfile: {
    unit: string;
    altUnits?: { unit: string; factor: number }[];
    depth?: number;
    width?: number;
    height?: number;
  };
}

interface PersistableLine extends Omit<ResolvedLine, 'storageProfile'> {
  outputItemId: Types.ObjectId;
  outputBarcode: string;
}

const PRINT_SKU_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_PRINT_SKU_SEGMENT_LENGTH = 128;

@Injectable()
export class PrintJobService {
  private readonly logger = new Logger(PrintJobService.name);

  constructor(
    private readonly repo: PrintJobRepository,
    private readonly stockRepo: StockRepository,
    private readonly stockService: StockService,
    private readonly locationRepo: LocationRepository,
    private readonly stockTransactionHelper: StockTransactionHelper,
    private readonly barcodeSvc: BarcodeService,
    private readonly documentNumberService: DocumentNumberService,
    // reserve CUP_BLANK bắn stock.changed lên QUEUES.STOCK (khớp
    // apps/ecommerce/src/catalog/stock.consumer.ts @Processor(QUEUES.STOCK));
    // print.completed bắn lên QUEUES.SHIPMENT (khớp
    // apps/ecommerce/src/order/order.consumer.ts @Processor(QUEUES.SHIPMENT))
    // — 2 queue khác nhau, KHÔNG dùng chung 1 queue cho cả 2 event.
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
    @InjectQueue(QUEUES.SHIPMENT) private readonly shipmentQueue: Queue,
  ) {}

  /**
   * Nhận canonical print.requested. Payload malformed bị reject trước mọi ghi;
   * master WMS thiếu/sai type throw lỗi thường để BullMQ còn retry sau khi dữ
   * liệu master được sửa. SAMPLE và PRODUCTION idempotent độc lập.
   */
  async createFromPrintRequested(
    payload: PrintRequestedPayload,
  ): Promise<void> {
    const request = this.normalizePrintRequest(payload);
    const { orderId, orderCode, stage, items, orderDetail } = request;

    const existing = await this.repo.findByOrderAndStage(orderId, stage);
    if (existing) {
      this.logger.warn(
        `PrintJob đã tồn tại cho orderId=${orderId} stage=${stage} → đối soát side effect (idempotent).`,
      );
      const existingReservations = this.collectReservations(
        Array.isArray(existing.items) ? existing.items : [],
      );
      await this.publishReservationSideEffects(
        existingReservations,
        orderId,
        stage,
      );
      return;
    }

    const printJobNumber = await this.documentNumberService.next('PRN');
    const lines: ResolvedLine[] = [];
    const blankBySku = new Map<
      string,
      {
        _id: Types.ObjectId;
        sku: string;
        type: ItemType;
        unit: string;
        altUnits?: { unit: string; factor: number }[];
        depth?: number;
        width?: number;
        height?: number;
      }
    >();
    const outputBySku = new Map<
      string,
      {
        _id: Types.ObjectId;
        type: ItemType;
        blankItemId?: Types.ObjectId;
        barcode?: string;
      } | null
    >();

    // Preflight toàn bộ dòng trước transaction để không tạo output/reserve nửa
    // request rồi mới phát hiện một dòng sau bị sai.
    for (const item of items) {
      let blank = blankBySku.get(item.blankSku);
      if (!blank) {
        const foundBlank = await this.stockRepo.findItemBySku(item.blankSku);
        if (!foundBlank || foundBlank.type !== ItemType.CUP_BLANK) {
          throw new Error(
            `Không tìm thấy WarehouseItem CUP_BLANK hợp lệ cho blankSku=${item.blankSku} (orderId=${orderId}).`,
          );
        }
        blank = {
          _id: foundBlank._id,
          sku: foundBlank.sku,
          type: foundBlank.type,
          unit: foundBlank.unit,
          altUnits: foundBlank.altUnits,
          depth: foundBlank.depth,
          width: foundBlank.width,
          height: foundBlank.height,
        };
        blankBySku.set(item.blankSku, blank);
      }

      const outputSku = this.buildPrintedSku(item);
      let output = outputBySku.get(outputSku);
      if (output === undefined) {
        const foundOutput = await this.stockRepo.findItemBySku(outputSku);
        output = foundOutput
          ? {
              _id: foundOutput._id,
              type: foundOutput.type,
              blankItemId: foundOutput.blankItemId,
              barcode: foundOutput.barcode,
            }
          : null;
        outputBySku.set(outputSku, output);
      }
      if (
        output &&
        (output.type !== ItemType.CUP_PRINTED ||
          !output.blankItemId ||
          output.blankItemId.toString() !== blank._id.toString())
      ) {
        throw new Error(
          `SKU output=${outputSku} không phải CUP_PRINTED hợp lệ của blankSku=${item.blankSku} (orderId=${orderId}).`,
        );
      }
      let verifiedOutputBarcode = output?.barcode;
      if (output && verifiedOutputBarcode) {
        const registeredItemId = await this.barcodeSvc.findItemIdByCode(
          verifiedOutputBarcode,
        );
        if (
          !registeredItemId ||
          registeredItemId.toString() !== output._id.toString()
        ) {
          verifiedOutputBarcode = undefined;
        }
      }

      lines.push({
        orderItemId: item.orderItemId,
        inputItemId: blank._id,
        outputItemId: output?._id,
        outputBarcode: verifiedOutputBarcode,
        sku: outputSku,
        designFile: item.designFile,
        quantity: item.quantity,
        reservedQty: item.quantity,
        storageProfile: {
          unit: blank.unit,
          altUnits: blank.altUnits,
          depth: blank.depth,
          width: blank.width,
          height: blank.height,
        },
      });
    }

    const { reservedByBlank } =
      await this.stockTransactionHelper.withStockTransaction(
        async (session) => {
          // MongoDB có thể chạy lại callback transaction khi gặp transient
          // error; mọi accumulator phải nằm trong callback để mỗi attempt sạch.
          const reservedByBlank = new Map<
            string,
            { itemId: Types.ObjectId; quantity: number }
          >();
          const persistedLines: PersistableLine[] = [];
          const createdOutputBySku = new Map<string, Types.ObjectId>();
          const barcodeByOutputId = new Map<string, string>();
          for (const line of lines) {
            const key = line.inputItemId.toString();
            const aggregate = reservedByBlank.get(key);
            reservedByBlank.set(key, {
              itemId: line.inputItemId,
              quantity: (aggregate?.quantity ?? 0) + line.reservedQty,
            });
          }

          // Claim toàn bộ blank trước khi tạo output/job. Predicate atomic này
          // vừa chống over-reserve giữa hai order, vừa đảm bảo thiếu một dòng
          // sẽ rollback trọn request thay vì lưu job partial/0 quantity.
          for (const { itemId, quantity } of reservedByBlank.values()) {
            const reserved = await this.stockRepo.reserveIfAvailable(
              itemId,
              quantity,
              session,
            );
            if (!reserved) {
              throw new AppException(
                'STOCK_INSUFFICIENT',
                `Không đủ CUP_BLANK để tạo trọn lệnh in orderId=${orderId} stage=${stage}`,
              );
            }
          }

          for (const line of lines) {
            let outputItemId = line.outputItemId;
            let outputBarcode = line.outputBarcode;
            if (!outputItemId) {
              outputItemId = createdOutputBySku.get(line.sku);
              outputBarcode = outputItemId
                ? barcodeByOutputId.get(outputItemId.toString())
                : undefined;
            }
            if (!outputItemId) {
              outputItemId = new Types.ObjectId();
              outputBarcode =
                await this.barcodeSvc.generateAndReservePrimaryBarcode(
                  outputItemId,
                  session,
                );
              const created = await this.stockRepo.createItem(
                {
                  _id: outputItemId,
                  sku: line.sku,
                  barcode: outputBarcode,
                  name: `Ly in — ${line.sku}`,
                  type: ItemType.CUP_PRINTED,
                  ...line.storageProfile,
                  blankItemId: line.inputItemId,
                },
                new Types.ObjectId(),
                session,
              );
              outputItemId = created._id;
              createdOutputBySku.set(line.sku, outputItemId);
              barcodeByOutputId.set(outputItemId.toString(), outputBarcode);
            } else {
              await this.stockRepo.syncPrintedItemStorageProfile(
                outputItemId,
                line.storageProfile,
                session,
              );
              if (!outputBarcode) {
                outputBarcode =
                  await this.barcodeSvc.generateAndReservePrimaryBarcode(
                    outputItemId,
                    session,
                  );
                await this.stockRepo.setItemPrimaryBarcode(
                  outputItemId,
                  outputBarcode,
                  session,
                );
              }
            }
            const { storageProfile, ...persistedLine } = line;
            void storageProfile;
            persistedLines.push({
              ...persistedLine,
              outputItemId,
              outputBarcode,
            });
          }

          await this.repo.createPrintJob(
            orderId,
            stage,
            persistedLines,
            session,
            printJobNumber,
            orderCode,
            orderDetail,
          );
          return { reservedByBlank };
        },
      );

    // Emit stock.changed CHỈ SAU KHI transaction đã commit thành công
    await this.publishReservationSideEffects(reservedByBlank, orderId, stage);

    this.logger.log(
      `PrintJob tạo thành công orderId=${orderId} stage=${stage} lines=${lines.length}`,
    );
  }

  private normalizePrintRequest(
    payload: PrintRequestedPayload,
  ): PrintRequestedPayload {
    const raw = payload as unknown as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') {
      throw new AppException(
        'VALIDATION_FAILED',
        'print.requested phải là object.',
      );
    }

    const orderId = this.requireText(raw.orderId, 'orderId');
    const orderCode = this.requireText(raw.orderCode, 'orderCode');
    let stage = raw.stage;
    let normalizedOrderId = orderId;
    // Tương thích ngắn hạn với producer legacy chỉ khi vẫn có đầy đủ mapping
    // canonical trên từng dòng. Legacy thiếu orderItemId sẽ bị reject bên dưới.
    if (stage === undefined && typeof raw.isSample === 'boolean') {
      stage = raw.isSample ? PrintStage.SAMPLE : PrintStage.PRODUCTION;
      if (raw.isSample && normalizedOrderId.endsWith('-sample')) {
        normalizedOrderId = normalizedOrderId.slice(0, -'-sample'.length);
      }
    }
    if (stage !== PrintStage.SAMPLE && stage !== PrintStage.PRODUCTION) {
      throw new AppException(
        'VALIDATION_FAILED',
        'stage phải là SAMPLE hoặc PRODUCTION.',
      );
    }
    if (!Array.isArray(raw.items) || raw.items.length === 0) {
      throw new AppException(
        'VALIDATION_FAILED',
        'print.requested phải có ít nhất một dòng.',
      );
    }

    const seenOrderItemIds = new Set<string>();
    const items = raw.items.map((rawItem, index) => {
      if (!rawItem || typeof rawItem !== 'object') {
        throw new AppException(
          'VALIDATION_FAILED',
          `items[${index}] không hợp lệ.`,
        );
      }
      const item = rawItem as Record<string, unknown>;
      const orderItemId = this.requireSafeSegment(
        item.orderItemId,
        `items[${index}].orderItemId`,
      );
      if (seenOrderItemIds.has(orderItemId)) {
        throw new AppException(
          'VALIDATION_FAILED',
          `orderItemId=${orderItemId} bị trùng trong print.requested.`,
        );
      }
      seenOrderItemIds.add(orderItemId);
      const blankSku = this.requireSafeSegment(
        item.blankSku,
        `items[${index}].blankSku`,
      ).toUpperCase();
      if (
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new AppException(
          'VALIDATION_FAILED',
          `items[${index}].quantity phải là số nguyên dương.`,
        );
      }
      const designFile = this.requireText(
        item.designFile,
        `items[${index}].designFile`,
      );
      const designId =
        item.designId === undefined
          ? undefined
          : this.requireSafeSegment(item.designId, `items[${index}].designId`);
      return {
        orderItemId,
        blankSku,
        quantity: item.quantity,
        designFile,
        ...(designId ? { designId } : {}),
      };
    });

    return {
      orderId: normalizedOrderId,
      orderCode,
      stage,
      items,
      ...(raw.orderDetail &&
      typeof raw.orderDetail === 'object' &&
      !Array.isArray(raw.orderDetail)
        ? { orderDetail: raw.orderDetail as Record<string, any> }
        : {}),
    };
  }

  private buildPrintedSku(
    item: PrintRequestedPayload['items'][number],
  ): string {
    const identity = item.designId ?? item.orderItemId;
    const canonicalIdentity = this.requireSafeSegment(
      identity,
      item.designId ? 'designId' : 'orderItemId',
    );
    // Không xóa ký tự phân cách vì A-B, A_B, A.B và AB sẽ va chạm. Digest
    // 96-bit giữ SKU gọn, deterministic giữa SAMPLE/PRODUCTION và không làm
    // lộ/biến dạng identity gốc trong mã kho.
    const identityDigest = createHash('sha256')
      .update(canonicalIdentity)
      .digest('hex')
      .slice(0, 24)
      .toUpperCase();
    return `${item.blankSku}-DSG${identityDigest}`;
  }

  private requireText(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new AppException('VALIDATION_FAILED', `${field} là bắt buộc.`);
    }
    return value.trim();
  }

  private requireSafeSegment(value: unknown, field: string): string {
    const segment = this.requireText(value, field);
    if (
      segment.length > MAX_PRINT_SKU_SEGMENT_LENGTH ||
      !PRINT_SKU_SEGMENT.test(segment)
    ) {
      throw new AppException(
        'VALIDATION_FAILED',
        `${field} chứa ký tự không an toàn cho SKU.`,
      );
    }
    return segment;
  }

  private async publishBlankStockChanged(
    inputItemId: Types.ObjectId,
    delta: number,
    orderId: string,
    stage: PrintStage,
  ): Promise<void> {
    const item = await this.stockRepo.findSkuById(inputItemId.toString());
    if (!item) return;
    const payload: StockChangedPayload = { sku: item.sku, delta };
    const jobId = `print-job-reserve-${orderId}-${stage}-${item.sku}`;
    await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload, { jobId });
  }

  private collectReservations(
    items: ReadonlyArray<{
      inputItemId: Types.ObjectId;
      reservedQty: number;
    }>,
  ): Map<string, { itemId: Types.ObjectId; quantity: number }> {
    const reservations = new Map<
      string,
      { itemId: Types.ObjectId; quantity: number }
    >();
    for (const item of items) {
      if (!Number.isFinite(item.reservedQty) || item.reservedQty <= 0) continue;
      const key = item.inputItemId.toString();
      const current = reservations.get(key);
      reservations.set(key, {
        itemId: item.inputItemId,
        quantity: (current?.quantity ?? 0) + item.reservedQty,
      });
    }
    return reservations;
  }

  private async publishReservationSideEffects(
    reservations: ReadonlyMap<
      string,
      { itemId: Types.ObjectId; quantity: number }
    >,
    orderId: string,
    stage: PrintStage,
  ): Promise<void> {
    for (const { itemId, quantity } of reservations.values()) {
      await this.publishBlankStockChanged(itemId, -quantity, orderId, stage);
      await this.stockService.checkAndEmitStockLow(itemId);
    }
  }

  /**
   * PRINTER quét itemBarcode(CUP_BLANK)+shelfCode để xác nhận bắt đầu in.
   * Trừ onHand+reserved thật (available không đổi — đã trừ lúc reserve khi
   * tạo job) và KHÔNG bắn stock.changed, đối xứng với
   * GoodsIssueService.confirmLine.
   */
  async consumeItem(
    id: string,
    inputItemId: string,
    dto: ConsumePrintJobItemDto,
    actorId: string,
  ): Promise<PrintJobDocument> {
    const job = await this.repo.findById(id);
    if (!job) throw new AppException('PRINT_JOB_NOT_FOUND');
    this.assertCompletionMapping(job);

    const itemId = await this.barcodeSvc.findItemIdByCode(dto.itemBarcode);
    if (!itemId) throw new AppException('PRINT_JOB_ITEM_NOT_FOUND');
    const item = await this.stockRepo.findItemByIdDocument(itemId.toString());
    if (!item) throw new AppException('PRINT_JOB_ITEM_NOT_FOUND');

    const shelf = await this.locationRepo.findShelfByCode(dto.shelfCode);
    if (!shelf) throw new AppException('PRINT_JOB_SHELF_NOT_FOUND');

    const line = job.items.find(
      (i) =>
        i.inputItemId.toString() === item._id.toString() &&
        i.inputItemId.toString() === inputItemId,
    );
    if (!line) throw new AppException('PRINT_JOB_ITEM_MISMATCH');
    if (dto.quantity > line.remainingQty) {
      throw new AppException('PRINT_JOB_QTY_EXCEEDS');
    }

    const inventory = await this.stockRepo.findInventory(
      item._id,
      shelf._id,
      null,
    );
    if (!inventory || inventory.quantity < dto.quantity) {
      throw new AppException('STOCK_INSUFFICIENT');
    }

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      await this.stockRepo.upsertInventory(
        item._id,
        shelf._id,
        null,
        -dto.quantity,
        session,
      );
      await this.stockRepo.upsertBalance(
        item._id,
        -dto.quantity,
        -dto.quantity,
        0,
        session,
      );
      await this.stockRepo.insertMovement(
        {
          itemId: item._id,
          shelfId: shelf._id,
          lotId: null,
          type: MovementType.PRINT_CONSUME,
          quantity: -dto.quantity,
          refType: 'print_job',
          refId: job._id,
          createdBy: new Types.ObjectId(actorId),
        },
        session,
      );
      await this.repo.decrementRemainingQty(
        id,
        item._id,
        dto.quantity,
        session,
      );
      await this.repo.markLineConsumedIfDone(id, item._id, session);
    });

    // S4-04: kiểm tra ngưỡng thấp tồn — sau khi transaction commit.
    await this.stockService.checkAndEmitStockLow(item._id);

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('PRINT_JOB_NOT_FOUND');
    return updated;
  }

  /**
   * PRINTER xác nhận in xong 1 dòng. Output luôn vào staging. SAMPLE hoàn tất
   * và phát proof ngay; PRODUCTION chuyển PUTAWAY_PENDING, chưa phát event.
   */
  async completeItem(
    id: string,
    inputItemId: string,
    dto: CompletePrintJobItemDto,
    actorId: string,
  ): Promise<PrintJobDocument> {
    const job = await this.repo.findById(id);
    if (!job) throw new AppException('PRINT_JOB_NOT_FOUND');
    this.assertCompletionMapping(job);

    const line = job.items.find(
      (i) => i.inputItemId.toString() === inputItemId,
    );
    if (!line) throw new AppException('PRINT_JOB_ITEM_MISMATCH');
    if (line.remainingQty > 0) {
      throw new AppException('PRINT_JOB_ITEM_NOT_CONSUMED');
    }
    const proofImage = dto.proofImage?.trim() || undefined;
    if (line.lineStatus === PrintJobLineStatus.COMPLETED) {
      if (
        job.stage === PrintStage.SAMPLE &&
        job.status === PrintJobStatus.COMPLETED
      ) {
        if (job.stage === PrintStage.SAMPLE && !proofImage) {
          throw new AppException(
            'VALIDATION_FAILED',
            'Lệnh in mẫu phải có ảnh minh chứng trước khi phát lại kết quả.',
          );
        }
        await this.emitPrintCompleted(job, id, proofImage);
        return job;
      }
      throw new AppException('PRINT_JOB_ITEM_ALREADY_COMPLETED');
    }
    const willFinishJob = job.items.every(
      (item) =>
        item === line || item.lineStatus === PrintJobLineStatus.COMPLETED,
    );
    if (job.stage === PrintStage.SAMPLE && willFinishJob && !proofImage) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Lệnh in mẫu phải có ảnh minh chứng trước khi hoàn tất.',
      );
    }

    if (dto.quantity !== line.reservedQty) {
      throw new AppException('PRINT_JOB_QTY_EXCEEDS');
    }
    const configuredStaging = job.outputStagingShelfId
      ? null
      : await this.locationRepo.findStagingShelf();
    const stagingShelfId =
      job.outputStagingShelfId ?? configuredStaging?._id ?? null;
    if (!stagingShelfId) {
      throw new AppException('PRINT_JOB_STAGING_SHELF_NOT_FOUND');
    }

    let allPrinted = false;
    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      const staged = await this.repo.markLineOutputStaged(
        id,
        line.inputItemId,
        job.stage === PrintStage.PRODUCTION ? dto.quantity : 0,
        stagingShelfId,
        session,
      );
      if (!staged) {
        throw new AppException('PRINT_JOB_ITEM_ALREADY_COMPLETED');
      }
      allPrinted = staged.allPrinted;
      await this.stockRepo.upsertInventory(
        line.outputItemId,
        stagingShelfId,
        null,
        dto.quantity,
        session,
      );
      await this.stockRepo.upsertBalance(
        line.outputItemId,
        dto.quantity,
        job.stage === PrintStage.PRODUCTION ? dto.quantity : 0,
        0,
        session,
      );
      await this.stockRepo.insertMovement(
        {
          itemId: line.outputItemId,
          shelfId: stagingShelfId,
          lotId: null,
          type: MovementType.PRINT_OUTPUT,
          quantity: dto.quantity,
          refType: 'print_job',
          refId: job._id,
          createdBy: new Types.ObjectId(actorId),
        },
        session,
      );
      if (allPrinted) {
        if (job.stage === PrintStage.SAMPLE) {
          await this.repo.markJobCompleted(
            id,
            new Types.ObjectId(actorId),
            session,
          );
        } else {
          await this.repo.markJobPutawayPending(id, session);
        }
      }
    });

    // S4-04: kiểm tra ngưỡng thấp tồn — sau khi transaction commit.
    await this.stockService.checkAndEmitStockLow(line.outputItemId);

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('PRINT_JOB_NOT_FOUND');

    if (allPrinted && job.stage === PrintStage.SAMPLE) {
      await this.emitPrintCompleted(job, id, proofImage);
    }

    return updated;
  }

  /**
   * PRINTER cất CUP_PRINTED từ staging vào khoang thật. Đây chỉ là chuyển vị
   * trí nên StockBalance không đổi; event production chỉ phát sau khi cất đủ.
   */
  async putawayItem(
    id: string,
    inputItemId: string,
    dto: PutawayPrintJobItemDto,
    actorId: string,
  ): Promise<PrintJobDocument> {
    const job = await this.repo.findById(id);
    if (!job) throw new AppException('PRINT_JOB_NOT_FOUND');
    this.assertCompletionMapping(job);

    if (
      job.stage === PrintStage.PRODUCTION &&
      job.status === PrintJobStatus.COMPLETED &&
      job.items.every((item) => item.putawayRemainingQty === 0)
    ) {
      await this.emitPrintCompleted(job, id);
      return job;
    }
    if (
      job.stage !== PrintStage.PRODUCTION ||
      job.status !== PrintJobStatus.PUTAWAY_PENDING
    ) {
      throw new AppException('PRINT_JOB_PUTAWAY_NOT_READY');
    }

    const line = job.items.find(
      (item) => item.inputItemId.toString() === inputItemId,
    );
    if (!line) throw new AppException('PRINT_JOB_ITEM_MISMATCH');
    if (dto.quantity > line.putawayRemainingQty) {
      throw new AppException('PRINT_JOB_QTY_EXCEEDS');
    }

    const scannedItemId = await this.barcodeSvc.findItemIdByCode(
      dto.itemBarcode,
    );
    if (
      !scannedItemId ||
      scannedItemId.toString() !== line.outputItemId.toString()
    ) {
      throw new AppException('PRINT_JOB_ITEM_MISMATCH');
    }
    const outputItem = await this.stockRepo.findItemByIdDocument(
      scannedItemId.toString(),
    );
    if (!outputItem) throw new AppException('PRINT_JOB_ITEM_NOT_FOUND');
    if (!outputItem.depth || !outputItem.width || !outputItem.height) {
      throw new AppException('PRINT_JOB_PUTAWAY_DIMENSIONS_REQUIRED');
    }
    const outputDepth = outputItem.depth;
    const outputWidth = outputItem.width;
    const outputHeight = outputItem.height;

    const cell = await this.locationRepo.findCellByCode(dto.cellBarcode);
    if (!cell) throw new AppException('PUTAWAY_CELL_NOT_FOUND');
    const shelf = await this.locationRepo.findShelfById(
      cell.shelfId.toString(),
    );
    if (!shelf) throw new AppException('PUTAWAY_SHELF_NOT_FOUND');
    if (shelf.isStaging) throw new AppException('PUTAWAY_SHELF_IS_STAGING');
    const stagingShelfId = job.outputStagingShelfId;
    if (!stagingShelfId) {
      throw new AppException('PRINT_JOB_STAGING_SHELF_NOT_FOUND');
    }

    const unitVolume = outputDepth * outputWidth * outputHeight;
    const suggestedCellId = dto.suggestedCellId
      ? new Types.ObjectId(dto.suggestedCellId)
      : null;
    const isOverride =
      suggestedCellId !== null &&
      suggestedCellId.toString() !== cell._id.toString();
    let completed = false;

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      const lineUpdated = await this.repo.decrementPutawayRemainingQty(
        id,
        line.inputItemId,
        dto.quantity,
        session,
      );
      if (!lineUpdated) throw new AppException('PRINT_JOB_QTY_EXCEEDS');

      const activeCell = await this.locationRepo.lockActiveCellForInventory(
        cell._id.toString(),
        session,
      );
      if (!activeCell) throw new AppException('PUTAWAY_CELL_NOT_FOUND');
      const activeShelf = await this.locationRepo.lockActiveShelfForInventory(
        activeCell.shelfId.toString(),
        session,
      );
      if (!activeShelf) throw new AppException('PUTAWAY_SHELF_NOT_FOUND');
      if (activeShelf.isStaging) {
        throw new AppException('PUTAWAY_SHELF_IS_STAGING');
      }
      if (
        outputDepth > activeCell.innerDepth ||
        outputWidth > activeCell.innerWidth ||
        outputHeight > activeCell.innerHeight
      ) {
        throw new AppException('PUTAWAY_CELL_DIMENSION_MISMATCH');
      }
      const occupiedVolume = await this.stockRepo.findOccupiedVolumeForCell(
        activeCell._id,
        session,
      );
      const usableVolume =
        activeCell.innerDepth *
        activeCell.innerWidth *
        activeCell.innerHeight *
        (activeCell.fillFactor ?? 0.75);
      if (occupiedVolume + dto.quantity * unitVolume > usableVolume) {
        throw new AppException('PUTAWAY_CELL_CAPACITY_EXCEEDED');
      }

      const stagingUpdated = await this.stockRepo.decrementInventoryIfAvailable(
        line.outputItemId,
        stagingShelfId,
        null,
        null,
        dto.quantity,
        session,
      );
      if (!stagingUpdated) throw new AppException('STOCK_INSUFFICIENT');
      await this.stockRepo.upsertInventory(
        line.outputItemId,
        activeShelf._id,
        null,
        dto.quantity,
        session,
        {
          cellId: activeCell._id,
          packageFactor: 1,
          packageVolumeCm3Snapshot: unitVolume,
        },
      );
      await this.stockRepo.insertMovement(
        {
          itemId: line.outputItemId,
          shelfId: stagingShelfId,
          lotId: null,
          type: MovementType.PUTAWAY,
          quantity: -dto.quantity,
          refType: 'print_job',
          refId: job._id,
          createdBy: new Types.ObjectId(actorId),
        },
        session,
      );
      await this.stockRepo.insertMovement(
        {
          itemId: line.outputItemId,
          shelfId: activeShelf._id,
          cellId: activeCell._id,
          lotId: null,
          type: MovementType.PUTAWAY,
          quantity: dto.quantity,
          refType: 'print_job',
          refId: job._id,
          createdBy: new Types.ObjectId(actorId),
          packageFactor: 1,
          packageVolumeCm3Snapshot: unitVolume,
          suggestedCellId,
          actualCellId: activeCell._id,
          isOverride,
        },
        session,
      );
      completed = await this.repo.markJobCompletedIfPutawayDone(
        id,
        new Types.ObjectId(actorId),
        session,
      );
    });

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('PRINT_JOB_NOT_FOUND');
    if (completed) await this.emitPrintCompleted(updated, id);
    return updated;
  }

  private async emitPrintCompleted(
    job: PrintJobDocument,
    printJobId: string,
    proofImage?: string,
  ): Promise<void> {
    const payload: PrintCompletedPayload = {
      orderId: job.orderId,
      printJobId,
      stage: job.stage,
      items: job.items.map((item) => ({
        orderItemId: item.orderItemId,
        printedSku: item.sku,
        quantity: item.reservedQty,
      })),
      ...(proofImage ? { proofImage } : {}),
    };
    const jobId = `print-job-${printJobId}`;
    await this.shipmentQueue.add(EVENTS.PRINT_COMPLETED, payload, { jobId });
    this.logger.log(
      `print.completed → orderId=${job.orderId} stage=${job.stage} printJobId=${printJobId}`,
    );
  }

  /**
   * Dữ liệu legacy thiếu mapping không được hoàn tất nửa chừng rồi mới fail
   * lúc phát event, vì khi đó output đã được ghi nhưng Ecommerce không thể map.
   */
  private assertCompletionMapping(job: PrintJobDocument): void {
    if (
      job.stage !== PrintStage.SAMPLE &&
      job.stage !== PrintStage.PRODUCTION
    ) {
      throw new AppException(
        'VALIDATION_FAILED',
        'PrintJob legacy thiếu stage; cần migration trước khi hoàn tất.',
      );
    }
    for (const [index, item] of job.items.entries()) {
      this.requireSafeSegment(item.orderItemId, `items[${index}].orderItemId`);
      this.requireText(item.sku, `items[${index}].sku`);
      if (
        !Number.isInteger(item.reservedQty) ||
        item.reservedQty <= 0 ||
        item.reservedQty !== item.quantity
      ) {
        throw new AppException(
          'VALIDATION_FAILED',
          `items[${index}].reservedQty phải bằng quantity và là số nguyên dương.`,
        );
      }
    }
  }

  async listPrintJobs(
    query: QueryPrintJobInput,
  ): Promise<{ data: PrintJobDocument[]; total: number }> {
    return this.repo.findAll(query);
  }

  async getPrintJob(id: string): Promise<PrintJobDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('PRINT_JOB_NOT_FOUND');
    return doc;
  }
}
