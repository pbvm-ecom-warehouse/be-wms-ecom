import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  GoodsIssue,
  GoodsIssueDocument,
  GoodsIssueStatus,
} from './schemas/goods-issue.schema';

export interface CreateGoodsIssueLineInput {
  itemId: Types.ObjectId;
  sku: string;
  quantity: number;
}

export interface CreateGoodsIssueInput {
  orderId: string;
  orderCode: string;
  goodsIssueNumber: string;
  lines: CreateGoodsIssueLineInput[];
  shippingAddress: Record<string, unknown>;
  recipient: { name: string; phone: string };
  paymentMethod: 'COD' | 'ONLINE';
  codAmount: number;
}

export interface QueryGoodsIssueInput {
  status?: GoodsIssueStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class GoodsIssueRepository {
  constructor(
    @InjectModel(GoodsIssue.name)
    private readonly model: Model<GoodsIssue>,
  ) {}

  findByOrderId(orderId: string): Promise<GoodsIssueDocument | null> {
    return this.model.findOne({ orderId }).exec();
  }

  findById(id: string): Promise<GoodsIssueDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  // remainingQty = quantity lúc khởi tạo — chưa xuất gì nên còn lại đúng bằng số lượng cần xuất
  async createGoodsIssue(
    input: CreateGoodsIssueInput,
  ): Promise<GoodsIssueDocument> {
    return this.model
      .findOneAndUpdate(
        { orderId: input.orderId },
        {
          $setOnInsert: {
            orderId: input.orderId,
            orderCode: input.orderCode,
            goodsIssueNumber: input.goodsIssueNumber,
            status: GoodsIssueStatus.PENDING,
            shippingAddress: input.shippingAddress,
            recipient: input.recipient,
            paymentMethod: input.paymentMethod,
            codAmount: input.codAmount,
            items: input.lines.map((l) => ({
              itemId: l.itemId,
              sku: l.sku,
              quantity: l.quantity,
              remainingQty: l.quantity,
            })),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  async findAll(
    query: QueryGoodsIssueInput,
  ): Promise<{ data: GoodsIssueDocument[]; total: number }> {
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

  /** $elemMatch theo itemId để tránh sửa nhầm phần tử mảng khi có nhiều dòng (xem PutAwayRepository.decrementRemainingQty) — GoodsIssueItem không phân biệt theo lot nên chỉ cần match itemId. */
  decrementRemainingQty(
    id: string,
    itemId: Types.ObjectId,
    quantity: number,
    session: ClientSession,
  ): Promise<GoodsIssueDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: GoodsIssueStatus.PENDING,
          items: { $elemMatch: { itemId, remainingQty: { $gte: quantity } } },
        },
        { $inc: { 'items.$.remainingQty': -quantity } },
        { new: true, session },
      )
      .exec();
  }

  /** Gọi sau decrement — trả true nếu VỪA chuyển sang CONFIRMED (để service biết có nên emit goods.issued hay không). */
  async markConfirmedIfAllDone(
    id: string,
    session: ClientSession,
  ): Promise<boolean> {
    const doc = await this.model.findOne({ _id: id }, null, { session });
    if (!doc) return false;
    const allDone = doc.items.every((i) => i.remainingQty === 0);
    if (allDone && doc.status !== GoodsIssueStatus.CONFIRMED) {
      doc.status = GoodsIssueStatus.CONFIRMED;
      await doc.save({ session });
      return true;
    }
    return false;
  }
}
