import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  ScrapNote,
  ScrapNoteDocument,
  ScrapNoteStatus,
} from './schemas/scrap-note.schema';

export interface CreateScrapNoteLineInput {
  itemId: Types.ObjectId;
  sku: string;
  shelfId: Types.ObjectId;
  lotId: Types.ObjectId | null;
  quantity: number;
  reason: string;
  images?: string[];
  skipAvailableSync?: boolean;
}

export interface QueryScrapNoteInput {
  status?: ScrapNoteStatus;
  warehouseId?: Types.ObjectId;
  page?: number;
  limit?: number;
}

@Injectable()
export class ScrapNoteRepository {
  constructor(
    @InjectModel(ScrapNote.name)
    private readonly model: Model<ScrapNote>,
  ) {}

  findById(id: string): Promise<ScrapNoteDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  async createScrapNote(
    warehouseId: Types.ObjectId,
    note: string | undefined,
    createdBy: Types.ObjectId,
    lines: CreateScrapNoteLineInput[],
  ): Promise<ScrapNoteDocument> {
    const [doc] = await this.model.create([
      {
        warehouseId,
        note,
        status: ScrapNoteStatus.DRAFT,
        createdBy,
        items: lines.map((l) => ({
          itemId: l.itemId,
          sku: l.sku,
          shelfId: l.shelfId,
          lotId: l.lotId,
          quantity: l.quantity,
          reason: l.reason,
          images: l.images ?? [],
        })),
      },
    ]);
    return doc;
  }

  /**
   * Tạo ScrapNote đã APPROVED sẵn (bỏ qua DRAFT) — dùng cho UC-09: hàng
   * DAMAGED từ GoodsReturn đã được RECEIVER xác nhận lúc inspect, không cần
   * MANAGER duyệt lại lần nữa. Nhận session để chạy trong transaction của
   * GoodsReturnService.confirmGoodsReturn.
   */
  async createApprovedScrapNote(
    warehouseId: Types.ObjectId,
    createdBy: Types.ObjectId,
    lines: CreateScrapNoteLineInput[],
    session: ClientSession,
  ): Promise<ScrapNoteDocument> {
    const [doc] = await this.model.create(
      [
        {
          warehouseId,
          status: ScrapNoteStatus.APPROVED,
          createdBy,
          approvedBy: createdBy,
          items: lines.map((l) => ({
            itemId: l.itemId,
            sku: l.sku,
            shelfId: l.shelfId,
            lotId: l.lotId,
            quantity: l.quantity,
            reason: l.reason,
            skipAvailableSync: l.skipAvailableSync ?? false,
          })),
        },
      ],
      { session },
    );
    return doc;
  }

  async findAll(
    query: QueryScrapNoteInput,
  ): Promise<{ data: ScrapNoteDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;
    if (query.warehouseId) filter['warehouseId'] = query.warehouseId;

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

  async setApproved(
    id: string,
    approvedBy: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { _id: id },
        { $set: { status: ScrapNoteStatus.APPROVED, approvedBy } },
        { session },
      )
      .exec();
  }

  async setRejected(
    id: string,
    approvedBy: Types.ObjectId,
    rejectReason: string,
  ): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { _id: id },
        {
          $set: {
            status: ScrapNoteStatus.REJECTED,
            approvedBy,
            rejectReason,
          },
        },
      )
      .exec();
  }
}
