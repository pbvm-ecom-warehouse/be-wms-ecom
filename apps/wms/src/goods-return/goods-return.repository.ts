import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  GoodsReturn,
  GoodsReturnDocument,
  GoodsReturnItemCondition,
  GoodsReturnStatus,
} from './schemas/goods-return.schema';

export interface CreateGoodsReturnLineInput {
  itemId: Types.ObjectId;
  sku: string;
  quantity: number;
}

export interface QueryGoodsReturnInput {
  status?: GoodsReturnStatus;
  warehouseId?: Types.ObjectId;
  orderId?: string;
  page?: number;
  limit?: number;
}

export interface InspectLineInput {
  itemId: Types.ObjectId;
  condition: GoodsReturnItemCondition;
  shelfId: Types.ObjectId;
  lotId: Types.ObjectId | null;
  images: string[];
}

@Injectable()
export class GoodsReturnRepository {
  constructor(
    @InjectModel(GoodsReturn.name)
    private readonly model: Model<GoodsReturn>,
  ) {}

  findById(id: string): Promise<GoodsReturnDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  findByOrderId(orderId: string): Promise<GoodsReturnDocument | null> {
    return this.model.findOne({ orderId }).exec();
  }

  async createGoodsReturn(
    orderId: string | undefined,
    createdBy: Types.ObjectId | null,
    note: string | undefined,
    lines: CreateGoodsReturnLineInput[],
  ): Promise<GoodsReturnDocument> {
    const [doc] = await this.model.create([
      {
        orderId,
        note,
        warehouseId: null,
        status: GoodsReturnStatus.DRAFT,
        createdBy,
        items: lines.map((l) => ({
          itemId: l.itemId,
          sku: l.sku,
          quantity: l.quantity,
          condition: null,
          shelfId: null,
          lotId: null,
          scrapNoteId: null,
        })),
      },
    ]);
    return doc;
  }

  async findAll(
    query: QueryGoodsReturnInput,
  ): Promise<{ data: GoodsReturnDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;
    if (query.warehouseId) filter['warehouseId'] = query.warehouseId;
    if (query.orderId) filter['orderId'] = query.orderId;

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
   * Gán warehouseId + phân loại từng dòng, chuyển INSPECTED. createdBy chỉ
   * ghi đè nếu phiếu chưa có actor (tự sinh từ event) — $setOnInsert không
   * áp dụng cho update nên dùng aggregation pipeline update để điều kiện hoá;
   * đơn giản hơn: luôn set lại createdBy vì actor gọi inspect() luôn là
   * người "nhận việc" hợp lệ dù phiếu đã có createdBy từ trước (tạo tay).
   */
  async setInspected(
    id: string,
    warehouseId: Types.ObjectId,
    createdBy: Types.ObjectId,
    lines: InspectLineInput[],
  ): Promise<void> {
    const doc = await this.model.findOne({ _id: id }).exec();
    if (!doc) return;
    doc.warehouseId = warehouseId;
    doc.createdBy = createdBy;
    doc.status = GoodsReturnStatus.INSPECTED;
    for (const line of lines) {
      const item = doc.items.find(
        (i) => i.itemId.toString() === line.itemId.toString(),
      );
      if (!item) continue;
      item.condition = line.condition;
      item.shelfId = line.shelfId;
      item.lotId = line.lotId;
      item.images = line.images;
    }
    await doc.save();
  }

  /**
   * Set status=RESTOCKED + gắn scrapNoteId cho từng dòng DAMAGED. Chạy trong
   * session của confirmGoodsReturn (cùng transaction với các thao tác tồn kho).
   */
  async setRestocked(
    id: string,
    scrapNoteIdByItemId: Map<string, Types.ObjectId>,
    session: ClientSession,
  ): Promise<void> {
    const doc = await this.model.findOne({ _id: id }, null, { session }).exec();
    if (!doc) return;
    doc.status = GoodsReturnStatus.RESTOCKED;
    for (const item of doc.items) {
      const scrapNoteId = scrapNoteIdByItemId.get(item.itemId.toString());
      if (scrapNoteId) item.scrapNoteId = scrapNoteId;
    }
    await doc.save({ session });
  }

  async setCancelled(id: string): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { _id: id },
        { $set: { status: GoodsReturnStatus.CANCELLED } },
      )
      .exec();
  }
}
