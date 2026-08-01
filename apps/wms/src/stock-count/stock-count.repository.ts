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
  cellId: Types.ObjectId;
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
    stockCountNumber: string,
  ): Promise<StockCountDocument> {
    const [doc] = await this.model.create([
      {
        stockCountNumber,
        zoneId,
        note,
        status: StockCountStatus.DRAFT,
        createdBy,
        items: lines.map((l) => ({
          itemId: l.itemId,
          sku: l.sku,
          shelfId: l.shelfId,
          cellId: l.cellId,
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
   * Set snapshot mới + actualQty/delta cho đúng dòng (itemId, shelfId, cellId, lotId).
   * Không dùng transaction — chỉ sửa mảng items của chính StockCount, chưa
   * đụng InventoryStock/StockBalance thật (việc đó chỉ xảy ra lúc approve).
   */
  countItem(
    id: string,
    itemId: Types.ObjectId,
    shelfId: Types.ObjectId,
    cellId: Types.ObjectId,
    lotId: Types.ObjectId | null,
    systemQty: number,
    actualQty: number,
    reason: string | null,
    images: string[],
  ): Promise<StockCountDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: {
            $in: [StockCountStatus.DRAFT, StockCountStatus.IN_PROGRESS],
          },
          items: { $elemMatch: { itemId, shelfId, cellId, lotId } },
        },
        {
          $set: {
            'items.$.systemQty': systemQty,
            'items.$.actualQty': actualQty,
            'items.$.delta': actualQty - systemQty,
            'items.$.reason': reason,
            'items.$.images': images,
          },
        },
        { new: true },
      )
      .exec();
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
    if (allCounted && doc.status === StockCountStatus.IN_PROGRESS) {
      await this.model
        .updateOne(
          { _id: id, status: StockCountStatus.IN_PROGRESS },
          { $set: { status: StockCountStatus.COMPLETED } },
        )
        .exec();
    }
  }

  async reopenLineForRecount(
    id: string,
    itemId: Types.ObjectId,
    shelfId: Types.ObjectId,
    cellId: Types.ObjectId,
    lotId: Types.ObjectId | null,
  ): Promise<void> {
    await this.model
      .updateOne(
        {
          _id: id,
          status: StockCountStatus.COMPLETED,
          items: { $elemMatch: { itemId, shelfId, cellId, lotId } },
        },
        {
          $set: {
            status: StockCountStatus.IN_PROGRESS,
            'items.$.actualQty': null,
            'items.$.delta': null,
          },
        },
      )
      .exec();
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

  async claimApprovedIfCompleted(
    id: string,
    approvedBy: Types.ObjectId,
    approveReason: string | undefined,
    session: ClientSession,
  ): Promise<boolean> {
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, status: StockCountStatus.COMPLETED },
        {
          $set: {
            status: StockCountStatus.APPROVED,
            approvedBy,
            approveReason,
          },
        },
        { new: true, session },
      )
      .exec();
    return updated !== null;
  }
}
