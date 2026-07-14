import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  PrintJob,
  PrintJobDocument,
  PrintJobLineStatus,
  PrintJobStatus,
} from './schemas/print-job.schema';

export interface CreatePrintJobLineInput {
  inputItemId: Types.ObjectId;
  outputItemId: Types.ObjectId;
  sku: string;
  designFile?: string;
  quantity: number;
  reservedQty: number;
}

export interface QueryPrintJobInput {
  status?: PrintJobStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class PrintJobRepository {
  constructor(
    @InjectModel(PrintJob.name)
    private readonly model: Model<PrintJob>,
  ) {}

  findByOrderId(orderId: string): Promise<PrintJobDocument | null> {
    return this.model.findOne({ orderId }).exec();
  }

  findById(id: string): Promise<PrintJobDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  // remainingQty = reservedQty lúc khởi tạo — chưa consume gì nên còn lại đúng bằng số đã giữ
  // session bắt buộc: gọi trong cùng transaction với reserve CUP_BLANK (upsertBalance)
  // để tránh reserve "mồ côi" khi tạo PrintJob thất bại giữa chừng.
  async createPrintJob(
    orderId: string,
    warehouseId: Types.ObjectId,
    lines: CreatePrintJobLineInput[],
    session: ClientSession,
  ): Promise<PrintJobDocument> {
    const [doc] = await this.model.create(
      [
        {
          orderId,
          warehouseId,
          status: PrintJobStatus.PENDING,
          items: lines.map((l) => ({
            inputItemId: l.inputItemId,
            outputItemId: l.outputItemId,
            sku: l.sku,
            designFile: l.designFile,
            quantity: l.quantity,
            reservedQty: l.reservedQty,
            remainingQty: l.reservedQty,
            lineStatus: PrintJobLineStatus.PENDING,
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
   * Set lineStatus=COMPLETED cho dòng khớp inputItemId. Trả allDone=true nếu
   * SAU khi set, mọi dòng của job đều COMPLETED — service dùng để quyết định
   * có chuyển job status + set confirmedBy hay không (repository không tự
   * set job status ở đây vì cần actorId từ service).
   */
  async markLineCompleted(
    id: string,
    inputItemId: Types.ObjectId,
    session: ClientSession,
  ): Promise<{ allDone: boolean }> {
    const doc = await this.model.findOne({ _id: id }, null, { session });
    if (!doc) return { allDone: false };
    const line = doc.items.find(
      (i) => i.inputItemId.toString() === inputItemId.toString(),
    );
    if (!line) return { allDone: false };
    line.lineStatus = PrintJobLineStatus.COMPLETED;
    await doc.save({ session });
    const allDone = doc.items.every(
      (i) => i.lineStatus === PrintJobLineStatus.COMPLETED,
    );
    return { allDone };
  }

  /** Set status=COMPLETED + confirmedBy — gọi bởi service SAU khi markLineCompleted trả allDone=true. */
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
