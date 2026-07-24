// apps/wms/src/goods-receipt-note/goods-receipt-note.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  GoodsReceiptNote,
  GoodsReceiptNoteDocument,
  GoodsReceiptNoteStatus,
} from './schemas/goods-receipt-note.schema';
import type { QueryGoodsReceiptNoteDto } from './dto/goods-receipt-note.dto';

export interface ResolvedGoodsReceiptNoteItem {
  itemId: string;
  sku: string;
  expectedQty: number;
  actualQty: number;
  unit: string;
  lotNumber?: string;
  expiryDate?: Date;
  note?: string;
}

@Injectable()
export class GoodsReceiptNoteRepository {
  constructor(
    @InjectModel(GoodsReceiptNote.name)
    private readonly model: Model<GoodsReceiptNoteDocument>,
  ) {}

  async createGoodsReceiptNote(
    purchaseOrderId: string,
    grnNumber: string,
    resolvedItems: ResolvedGoodsReceiptNoteItem[],
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument> {
    return this.model.create({
      grnNumber,
      purchaseOrderId: new Types.ObjectId(purchaseOrderId),
      status: GoodsReceiptNoteStatus.DRAFT,
      // itemId giữ string — Mongoose tự cast theo schema; cast tay vì Model.create() đòi ObjectId ở kiểu tĩnh
      items: resolvedItems as unknown as GoodsReceiptNote['items'],
      createdBy: new Types.ObjectId(actorId),
    });
  }

  async findGoodsReceiptNoteById(
    id: string,
  ): Promise<GoodsReceiptNoteDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  async findGoodsReceiptNotes(
    query: QueryGoodsReceiptNoteDto,
  ): Promise<{ data: GoodsReceiptNoteDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;
    if (query.purchaseOrderId)
      filter['purchaseOrderId'] = new Types.ObjectId(query.purchaseOrderId);

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

  /** Đếm số GRN đã tạo trong ngày (theo prefix grnNumber) — hỗ trợ sinh số thứ tự. */
  async countByGrnNumberPrefix(prefix: string): Promise<number> {
    return this.model
      .countDocuments({ grnNumber: { $regex: `^${prefix}` } })
      .exec();
  }

  /** DRAFT → CONFIRMED trong transaction cộng tồn — session bắt buộc để atomic với stock. */
  async updateStatusConfirmed(
    id: string,
    actorId: string,
    session: ClientSession,
  ): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { _id: id },
        {
          status: GoodsReceiptNoteStatus.CONFIRMED,
          confirmedBy: new Types.ObjectId(actorId),
        },
        { session },
      )
      .exec();
  }

  /** CONFIRMED → APPROVED — thuần audit, không cần transaction Mongo. */
  async updateStatusApproved(
    id: string,
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id },
        {
          status: GoodsReceiptNoteStatus.APPROVED,
          approvedBy: new Types.ObjectId(actorId),
        },
        { new: true },
      )
      .exec();
  }

  /** Thêm 1 URL ảnh minh chứng vào GRN (cấp phiếu) — không giới hạn ở đây, service kiểm tra status. */
  async pushImage(
    id: string,
    url: string,
  ): Promise<GoodsReceiptNoteDocument | null> {
    return this.model
      .findOneAndUpdate({ _id: id }, { $push: { images: url } }, { new: true })
      .exec();
  }
}
