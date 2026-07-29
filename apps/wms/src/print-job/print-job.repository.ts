import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PrintStage } from '@app/events';
import { ClientSession, Model, Types } from 'mongoose';
import {
  PrintJob,
  PrintJobDocument,
  PrintJobLineStatus,
  PrintJobStatus,
} from './schemas/print-job.schema';

export interface CreatePrintJobLineInput {
  orderItemId: string;
  inputItemId: Types.ObjectId;
  outputItemId: Types.ObjectId;
  outputBarcode: string;
  sku: string;
  designFile?: string;
  quantity: number;
  reservedQty: number;
}

export interface QueryPrintJobInput {
  status?: PrintJobStatus;
  stage?: PrintStage;
  page?: number;
  limit?: number;
}

@Injectable()
export class PrintJobRepository {
  constructor(
    @InjectModel(PrintJob.name)
    private readonly model: Model<PrintJob>,
  ) {}

  findByOrderAndStage(
    orderId: string,
    stage: PrintStage,
  ): Promise<PrintJobDocument | null> {
    return this.model.findOne({ orderId, stage }).exec();
  }

  findById(id: string): Promise<PrintJobDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  // remainingQty = reservedQty lúc khởi tạo — chưa consume gì nên còn lại đúng bằng số đã giữ
  // session bắt buộc: gọi trong cùng transaction với reserve CUP_BLANK (upsertBalance)
  // để tránh reserve "mồ côi" khi tạo PrintJob thất bại giữa chừng.
  async createPrintJob(
    orderId: string,
    stage: PrintStage,
    lines: CreatePrintJobLineInput[],
    session: ClientSession,
    printJobNumber: string,
    orderCode: string,
    orderDetail?: Record<string, any>,
  ): Promise<PrintJobDocument> {
    const [doc] = await this.model.create(
      [
        {
          printJobNumber,
          orderId,
          orderCode,
          stage,
          status: PrintJobStatus.PENDING,
          orderDetail,
          items: lines.map((l) => ({
            orderItemId: l.orderItemId,
            inputItemId: l.inputItemId,
            outputItemId: l.outputItemId,
            outputBarcode: l.outputBarcode,
            sku: l.sku,
            designFile: l.designFile,
            quantity: l.quantity,
            reservedQty: l.reservedQty,
            remainingQty: l.reservedQty,
            lineStatus: PrintJobLineStatus.PENDING,
            putawayRemainingQty: 0,
          })),
        },
      ],
      { session },
    );
    return doc;
  }

  async findAll(
    query: QueryPrintJobInput,
  ): Promise<{ data: PrintJobDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;
    if (query.stage) filter['stage'] = query.stage;

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { data, total };
  }

  /** $elemMatch theo inputItemId để tránh sửa nhầm phần tử mảng khi có nhiều dòng. */
  decrementRemainingQty(
    id: string,
    inputItemId: Types.ObjectId,
    quantity: number,
    session: ClientSession,
  ): Promise<PrintJobDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, items: { $elemMatch: { inputItemId } } },
        { $inc: { 'items.$.remainingQty': -quantity } },
        { new: true, session },
      )
      .exec();
  }

  /**
   * Gọi sau decrementRemainingQty — nếu dòng vừa hết remainingQty thì set
   * lineStatus=CONSUMED, và nếu job đang PENDING thì chuyển IN_PROGRESS
   * (dòng đầu tiên bắt đầu tiêu thụ trong toàn job).
   */
  async markLineConsumedIfDone(
    id: string,
    inputItemId: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    const doc = await this.model.findOne({ _id: id }, null, { session });
    if (!doc) return;
    const line = doc.items.find(
      (i) => i.inputItemId.toString() === inputItemId.toString(),
    );
    if (!line || line.remainingQty !== 0) return;
    line.lineStatus = PrintJobLineStatus.CONSUMED;
    if (doc.status === PrintJobStatus.PENDING) {
      doc.status = PrintJobStatus.IN_PROGRESS;
    }
    await doc.save({ session });
  }

  /**
   * Claim dòng CONSUMED để ghi output đúng một lần trong transaction. Production
   * giữ số lượng ở staging; SAMPLE dùng putawayQuantity=0.
   */
  async markLineOutputStaged(
    id: string,
    inputItemId: Types.ObjectId,
    putawayQuantity: number,
    stagingShelfId: Types.ObjectId,
    session: ClientSession,
  ): Promise<{ allPrinted: boolean } | null> {
    const doc = await this.model.findOne({ _id: id }, null, { session });
    if (!doc) return null;
    const line = doc.items.find(
      (i) => i.inputItemId.toString() === inputItemId.toString(),
    );
    if (!line || line.lineStatus !== PrintJobLineStatus.CONSUMED) return null;
    line.lineStatus = PrintJobLineStatus.COMPLETED;
    line.putawayRemainingQty = putawayQuantity;
    doc.outputStagingShelfId ??= stagingShelfId;
    await doc.save({ session });
    return {
      allPrinted: doc.items.every(
        (item) => item.lineStatus === PrintJobLineStatus.COMPLETED,
      ),
    };
  }

  markJobPutawayPending(
    id: string,
    session: ClientSession,
  ): Promise<PrintJobDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: PrintJobStatus.IN_PROGRESS },
        { $set: { status: PrintJobStatus.PUTAWAY_PENDING } },
        { new: true, session },
      )
      .exec();
  }

  decrementPutawayRemainingQty(
    id: string,
    inputItemId: Types.ObjectId,
    quantity: number,
    session: ClientSession,
  ): Promise<PrintJobDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: PrintJobStatus.PUTAWAY_PENDING,
          items: {
            $elemMatch: {
              inputItemId,
              putawayRemainingQty: { $gte: quantity },
            },
          },
        },
        { $inc: { 'items.$.putawayRemainingQty': -quantity } },
        { new: true, session },
      )
      .exec();
  }

  async markJobCompletedIfPutawayDone(
    id: string,
    confirmedBy: Types.ObjectId,
    session: ClientSession,
  ): Promise<boolean> {
    const doc = await this.model.findOne({ _id: id }, null, { session });
    if (!doc || doc.status !== PrintJobStatus.PUTAWAY_PENDING) return false;
    if (doc.items.some((item) => item.putawayRemainingQty !== 0)) return false;
    doc.status = PrintJobStatus.COMPLETED;
    doc.confirmedBy = confirmedBy;
    await doc.save({ session });
    return true;
  }

  /** SAMPLE hoàn tất ngay sau proof; PRODUCTION chỉ gọi sau khi put-away đủ. */
  async markJobCompleted(
    id: string,
    confirmedBy: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { _id: id },
        { $set: { status: PrintJobStatus.COMPLETED, confirmedBy } },
        { session },
      )
      .exec();
  }
}
