import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '@app/common';
import {
  EVENTS,
  QUEUES,
  type PrintCompletedPayload,
  type StockChangedPayload,
} from '@app/events';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { PrintJobRepository, QueryPrintJobInput } from './print-job.repository';
import type {
  CompletePrintJobItemDto,
  ConsumePrintJobItemDto,
} from './dto/print-job.dto';
import {
  PrintJobLineStatus,
  type PrintJobDocument,
} from './schemas/print-job.schema';
import { StockRepository } from '../stock/stock.repository';
import { StockService } from '../stock/stock.service';
import { ItemType } from '../stock/schemas/warehouse-item.schema';
import { LocationRepository } from '../location/location.repository';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import { BarcodeService } from '../stock/barcode/barcode.service';

interface PrintRequestedItem {
  sku: string;
  quantity: number;
  designFile?: string;
  blankSku?: string;
}

interface ResolvedLine {
  inputItemId: Types.ObjectId;
  outputItemId: Types.ObjectId;
  sku: string;
  designFile?: string;
  quantity: number;
  reservedQty: number;
}

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
    // reserve CUP_BLANK bắn stock.changed lên QUEUES.STOCK (khớp
    // apps/ecommerce/src/catalog/stock.consumer.ts @Processor(QUEUES.STOCK));
    // print.completed bắn lên QUEUES.SHIPMENT (khớp
    // apps/ecommerce/src/order/order.consumer.ts @Processor(QUEUES.SHIPMENT))
    // — 2 queue khác nhau, KHÔNG dùng chung 1 queue cho cả 2 event.
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
    @InjectQueue(QUEUES.SHIPMENT) private readonly shipmentQueue: Queue,
  ) {}

  /**
   * Gọi từ PrintJobConsumer khi nhận print.requested. Idempotent theo orderId
   * (unique index) — event redeliver không tạo job trùng. Mỗi dòng: tìm/tạo
   * WarehouseItem CUP_PRINTED theo sku, xác định CUP_BLANK đầu vào qua
   * blankItemId đã lưu sẵn (hoặc blankSku nếu design mới), rồi giữ
   * (reserved) CUP_BLANK theo min(quantity, available) — không throw khi
   * thiếu tồn hoặc dữ liệu không khớp, chỉ log warning và bỏ dòng/giảm số
   * giữ, vì retry BullMQ sẽ lặp lại lỗi y hệt nếu throw ở đây.
   */
  async createFromPrintRequested(
    orderId: string,
    items: PrintRequestedItem[],
  ): Promise<void> {
    const isSample = orderId.endsWith('-sample');

    const existing = await this.repo.findByOrderId(orderId);
    if (existing) {
      this.logger.warn(
        `PrintJob đã tồn tại cho orderId=${orderId} → bỏ qua (idempotent).`,
      );
      return;
    }

    const lines: ResolvedLine[] = [];

    for (const item of items) {
      const resolved = await this.resolveOutputItem(item, orderId);
      if (!resolved) continue;

      const { inputItemId, outputItemId } = resolved;
      const balance = await this.stockRepo.findBalance(inputItemId);
      const available = balance
        ? balance.onHand - balance.reserved - balance.expired
        : 0;
      const reservedQty = Math.min(item.quantity, Math.max(available, 0));

      if (reservedQty < item.quantity) {
        this.logger.warn(
          `CUP_BLANK thiếu tồn cho sku=${item.sku} (orderId=${orderId}): cần ${item.quantity}, chỉ giữ được ${reservedQty}.`,
        );
      }

      lines.push({
        inputItemId,
        outputItemId,
        sku: item.sku,
        designFile: item.designFile,
        quantity: item.quantity,
        reservedQty,
      });
    }

    if (lines.length === 0) {
      this.logger.warn(
        `Không có dòng nào hợp lệ cho orderId=${orderId} → không tạo PrintJob.`,
      );
      return;
    }

    const touchedBalances = new Map<string, { itemId: Types.ObjectId }>();
    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      for (const line of lines) {
        if (line.reservedQty > 0) {
          await this.stockRepo.upsertBalance(
            line.inputItemId,
            0,
            line.reservedQty,
            0,
            session,
          );
          touchedBalances.set(line.inputItemId.toString(), {
            itemId: line.inputItemId,
          });
        }
      }
      await this.repo.createPrintJob(orderId, lines, session, isSample);
    });

    // Emit stock.changed CHỈ SAU KHI transaction đã commit thành công
    for (const line of lines) {
      if (line.reservedQty > 0) {
        await this.publishBlankStockChanged(
          line.inputItemId,
          -line.reservedQty,
          orderId,
        );
      }
    }

    for (const { itemId } of touchedBalances.values()) {
      await this.stockService.checkAndEmitStockLow(itemId);
    }

    this.logger.log(
      `PrintJob tạo thành công orderId=${orderId} isSample=${isSample} lines=${lines.length}`,
    );
  }

  private async resolveOutputItem(
    item: PrintRequestedItem,
    orderId: string,
  ): Promise<{
    inputItemId: Types.ObjectId;
    outputItemId: Types.ObjectId;
  } | null> {
    const existingOutput = await this.stockRepo.findItemBySku(item.sku);

    if (existingOutput) {
      if (
        existingOutput.type !== ItemType.CUP_PRINTED ||
        !existingOutput.blankItemId
      ) {
        this.logger.warn(
          `sku=${item.sku} đã tồn tại nhưng không phải CUP_PRINTED hợp lệ (thiếu blankItemId) → bỏ qua dòng này (orderId=${orderId}).`,
        );
        return null;
      }
      return {
        inputItemId: existingOutput.blankItemId,
        outputItemId: existingOutput._id,
      };
    }

    if (!item.blankSku) {
      this.logger.warn(
        `sku=${item.sku} là design mới nhưng thiếu blankSku → bỏ qua dòng này (orderId=${orderId}).`,
      );
      return null;
    }

    const blank = await this.stockRepo.findItemBySku(item.blankSku);
    if (!blank || blank.type !== ItemType.CUP_BLANK) {
      this.logger.warn(
        `blankSku=${item.blankSku} không khớp WarehouseItem CUP_BLANK nào → bỏ qua dòng sku=${item.sku} (orderId=${orderId}).`,
      );
      return null;
    }

    const created = await this.stockRepo.createItem(
      {
        sku: item.sku,
        name: `Ly in — ${item.sku}`,
        type: ItemType.CUP_PRINTED,
        unit: 'cái',
        blankItemId: blank._id,
      },
      new Types.ObjectId(),
    );
    return { inputItemId: blank._id, outputItemId: created._id };
  }

  private async publishBlankStockChanged(
    inputItemId: Types.ObjectId,
    delta: number,
    orderId: string,
  ): Promise<void> {
    const item = await this.stockRepo.findSkuById(inputItemId.toString());
    if (!item) return;
    const payload: StockChangedPayload = { sku: item.sku, delta };
    const jobId = `print_job_reserve:${orderId}:${item.sku}`;
    await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload, { jobId });
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
   * PRINTER xác nhận in xong 1 dòng (toàn bộ reservedQty), nhập CUP_PRINTED.
   * Cộng onHand+reserved giữ nguyên cho đúng đơn (available không đổi —
   * PRINT_OUTPUT), KHÔNG bắn stock.changed. Khi mọi dòng COMPLETED → emit
   * print.completed.
   */
  async completeItem(
    id: string,
    inputItemId: string,
    dto: CompletePrintJobItemDto,
    actorId: string,
  ): Promise<PrintJobDocument> {
    const job = await this.repo.findById(id);
    if (!job) throw new AppException('PRINT_JOB_NOT_FOUND');

    const line = job.items.find(
      (i) => i.inputItemId.toString() === inputItemId,
    );
    if (!line) throw new AppException('PRINT_JOB_ITEM_MISMATCH');
    if (line.remainingQty > 0) {
      throw new AppException('PRINT_JOB_ITEM_NOT_CONSUMED');
    }
    if (line.lineStatus === PrintJobLineStatus.COMPLETED) {
      throw new AppException('PRINT_JOB_ITEM_ALREADY_COMPLETED');
    }

    const shelf = await this.locationRepo.findShelfByCode(dto.shelfCode);
    if (!shelf) throw new AppException('PRINT_JOB_SHELF_NOT_FOUND');
    if (dto.quantity !== line.reservedQty) {
      throw new AppException('PRINT_JOB_QTY_EXCEEDS');
    }

    let allDone = false;
    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      await this.stockRepo.upsertInventory(
        line.outputItemId,
        shelf._id,
        null,
        dto.quantity,
        session,
      );
      await this.stockRepo.upsertBalance(
        line.outputItemId,
        dto.quantity,
        dto.quantity,
        0,
        session,
      );
      await this.stockRepo.insertMovement(
        {
          itemId: line.outputItemId,
          shelfId: shelf._id,
          lotId: null,
          type: MovementType.PRINT_OUTPUT,
          quantity: dto.quantity,
          refType: 'print_job',
          refId: job._id,
          createdBy: new Types.ObjectId(actorId),
        },
        session,
      );
      const result = await this.repo.markLineCompleted(
        id,
        line.inputItemId,
        session,
      );
      allDone = result.allDone;
      if (allDone) {
        await this.repo.markJobCompleted(
          id,
          new Types.ObjectId(actorId),
          session,
        );
      }
    });

    // S4-04: kiểm tra ngưỡng thấp tồn — sau khi transaction commit.
    await this.stockService.checkAndEmitStockLow(line.outputItemId);

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('PRINT_JOB_NOT_FOUND');

    if (allDone) {
      await this.emitPrintCompleted(job.orderId, id);
    }

    return updated;
  }

  private async emitPrintCompleted(
    orderId: string,
    printJobId: string,
  ): Promise<void> {
    const payload: PrintCompletedPayload = { orderId, printJobId };
    const jobId = `print_job:${printJobId}`;
    await this.shipmentQueue.add(EVENTS.PRINT_COMPLETED, payload, { jobId });
    this.logger.log(
      `print.completed → orderId=${orderId} printJobId=${printJobId}`,
    );
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
