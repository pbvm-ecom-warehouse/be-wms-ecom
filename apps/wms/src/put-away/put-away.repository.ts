import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  PutAwayTask,
  PutAwayTaskDocument,
  PutAwayTaskSourceType,
  PutAwayTaskStatus,
} from './schemas/put-away-task.schema';

export interface CreatePutAwayLineInput {
  itemId: Types.ObjectId;
  sku?: string;
  lotId: Types.ObjectId | null;
  quantity: number;
  packageSpec?: {
    unit: string;
    factor: number;
    depthCm: number;
    widthCm: number;
    heightCm: number;
    volumeCm3: number;
  };
}

export interface QueryPutAwayTaskInput {
  status?: PutAwayTaskStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class PutAwayRepository {
  constructor(
    @InjectModel(PutAwayTask.name)
    private readonly model: Model<PutAwayTaskDocument>,
  ) {}

  // remainingQty = quantity lúc khởi tạo — chưa xếp gì nên còn lại đúng bằng số lượng cần xếp
  async createTask(
    grnId: Types.ObjectId,
    lines: CreatePutAwayLineInput[],
    actorId: string,
    session: ClientSession,
    sourceShelfId: Types.ObjectId,
    source: {
      type: PutAwayTaskSourceType;
      number?: string;
    } = { type: PutAwayTaskSourceType.GOODS_RECEIPT },
  ): Promise<PutAwayTaskDocument> {
    const [doc] = await this.model.create(
      [
        {
          grnId,
          sourceType: source.type,
          ...(source.number ? { sourceNumber: source.number } : {}),
          sourceShelfId,
          status: PutAwayTaskStatus.PENDING,
          items: lines.map((l) => ({
            itemId: l.itemId,
            ...(l.sku ? { sku: l.sku } : {}),
            lotId: l.lotId,
            quantity: l.quantity,
            remainingQty: l.quantity,
            packageSpec: l.packageSpec,
          })),
          createdBy: new Types.ObjectId(actorId),
        },
      ],
      { session },
    );
    return doc;
  }

  findTaskById(id: string): Promise<PutAwayTaskDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  async findTasks(
    query: QueryPutAwayTaskInput,
  ): Promise<{ data: PutAwayTaskDocument[]; total: number }> {
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

  /**
   * Dùng positional operator `items.$` để chỉ $inc đúng 1 phần tử mảng khớp
   * (itemId, lotId) trong filter — nếu chỉ filter theo _id thì Mongo không biết
   * item nào trong mảng cần cập nhật, dễ sửa nhầm phần tử đầu tiên.
   *
   * Bug đã sửa (final review): filter { 'items.itemId': x, 'items.lotId': y } là
   * 2 điều kiện ĐỘC LẬP trên mảng trong MongoDB — document khớp nếu tồn tại MỘT
   * phần tử có itemId đó VÀ tồn tại MỘT phần tử (có thể KHÁC) có lotId đó. Với
   * task multi-lot cùng item (VD [{itemId:A,lotId:L1},{itemId:A,lotId:L2}]),
   * $ có thể trỏ nhầm phần tử đầu thay vì phần tử đúng cả itemId+lotId. Dùng
   * $elemMatch buộc Mongo chỉ khớp document khi có 1 phần tử thỏa CẢ HAI điều
   * kiện cùng lúc — khi đó `$` chắc chắn trỏ đúng phần tử đó.
   */
  decrementRemainingQty(
    taskId: string,
    itemId: Types.ObjectId,
    lotId: Types.ObjectId | null,
    quantity: number,
    session: ClientSession,
  ): Promise<PutAwayTaskDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: taskId,
          status: PutAwayTaskStatus.PENDING,
          items: {
            $elemMatch: {
              itemId,
              lotId,
              remainingQty: { $gte: quantity },
            },
          },
        },
        {
          $inc: {
            'items.$.remainingQty': -quantity,
          },
        },
        { new: true, session },
      )
      .exec();
  }

  /** Gọi sau decrement — tránh set COMPLETED nhầm khi task đã COMPLETED từ trước. */
  async markCompletedIfAllDone(
    taskId: string,
    session: ClientSession,
  ): Promise<void> {
    const task = await this.model.findOne({ _id: taskId }, null, {
      session,
    });
    if (!task) return;
    const allDone = task.items.every((i) => i.remainingQty === 0);
    if (allDone && task.status !== PutAwayTaskStatus.COMPLETED) {
      task.status = PutAwayTaskStatus.COMPLETED;
      await task.save({ session });
    }
  }
}
