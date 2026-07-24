import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  StockCount,
  StockCountDocument,
  StockCountStatus,
} from './schemas/stock-count.schema';

export interface CreateStockCountLineInput {
  itemId: Types.ObjectId;
  sku: string;
  shelfId: Types.ObjectId;
  lotId: Types.ObjectId | null;
  systemQty: number;
}

export interface QueryStockCountInput {
  status?: StockCountStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class StockCountRepository {
  constructor(
    @InjectModel(StockCount.name)
    private readonly model: Model<StockCount>,
  ) {}

  findById(id: string): Promise<StockCountDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  async createStockCount(
    zoneId: Types.ObjectId | null,
    note: string | undefined,
    createdBy: Types.ObjectId,
    lines: CreateStockCountLineInput[],
  ): Promise<StockCountDocument> {
    const [doc] = await this.model.create([
      {
        zoneId,
        note,
        status: StockCountStatus.DRAFT,
        createdBy,
        items: lines.map((l) => ({
          itemId: l.itemId,
          sku: l.sku,
          shelfId: l.shelfId,
          lotId: l.lotId,
          systemQty: l.systemQty,
          actualQty: null,
          delta: null,
          reason: null,
        })),
      },
    ]);
    return doc;
  }

  async findAll(
    query: QueryStockCountInput,
  ): Promise<{ data: StockCountDocument[]; total: number }> {
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
   * Set actualQty/delta/reason cho đúng dòng khớp (itemId, shelfId, lotId).
   * Không dùng transaction — chỉ sửa mảng items của chính StockCount, chưa
   * đụng InventoryStock/StockBalance thật (việc đó chỉ xảy ra lúc approve).
   */
  countItem(
    id: string,
    itemId: Types.ObjectId,
    shelfId: Types.ObjectId,
    lotId: Types.ObjectId | null,
    actualQty: number,
    reason: string | null,
    images: string[],
  ): Promise<StockCountDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          items: { $elemMatch: { itemId, shelfId, lotId } },
        },
        {
          $set: {
            'items.$.actualQty': actualQty,
            'items.$.reason': reason,
            'items.$.images': images,
          },
        },
        { new: true },
      )
      .exec()
      .then(async (doc) => {
        if (!doc) return null;
        // delta cần systemQty của đúng dòng vừa update — tính lại sau khi có doc mới
        const line = doc.items.find(
          (i) =>
            i.itemId.toString() === itemId.toString() &&
            i.shelfId.toString() === shelfId.toString() &&
            (i.lotId?.toString() ?? null) === (lotId?.toString() ?? null),
        );
        if (line) {
          line.delta = actualQty - line.systemQty;
          await doc.save();
        }
        return doc;
      });
  }

  /** Gọi khi đây là lần nhập đầu tiên (status đang DRAFT) — chuyển IN_PROGRESS + set countedBy. */
  async setCountedByIfDraft(
    id: string,
    countedBy: Types.ObjectId,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id, status: StockCountStatus.DRAFT },
        { $set: { status: StockCountStatus.IN_PROGRESS, countedBy } },
      )
      .exec();
  }

  /** Nếu mọi dòng đã có actualQty !== null → chuyển COMPLETED. */
  async markCompletedIfAllCounted(id: string): Promise<void> {
    const doc = await this.model.findOne({ _id: id });
    if (!doc) return;
    const allCounted = doc.items.every((i) => i.actualQty !== null);
    if (allCounted && doc.status !== StockCountStatus.COMPLETED) {
      doc.status = StockCountStatus.COMPLETED;
      await doc.save();
    }
  }

  async setApproved(
    id: string,
    approvedBy: Types.ObjectId,
    approveReason: string | undefined,
    session: ClientSession,
  ): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { _id: id },
        {
          $set: {
            status: StockCountStatus.APPROVED,
            approvedBy,
            approveReason,
          },
        },
        { session },
      )
      .exec();
  }
}
