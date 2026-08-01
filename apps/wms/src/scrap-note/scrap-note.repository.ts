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
  sourceCellId?: Types.ObjectId | null;
  lockedQuantity?: number;
  scrapCellId?: Types.ObjectId | null;
  excludedByExpired?: boolean;
  lotId: Types.ObjectId | null;
  quantity: number;
  reason: string;
  images?: string[];
}

export interface QueryScrapNoteInput {
  status?: ScrapNoteStatus;
  page?: number;
  limit?: number;
}

export interface UpsertStockCountScrapInput {
  sourceStockCountId: Types.ObjectId;
  scrapNoteNumber: string;
  createdBy: Types.ObjectId;
  line: CreateScrapNoteLineInput;
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

  findBySourceStockCountId(
    sourceStockCountId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<ScrapNoteDocument | null> {
    return this.model.findOne({ sourceStockCountId }, null, { session }).exec();
  }

  /**
   * Gom đề xuất hủy của cùng một Stock Count vào đúng một phiếu DRAFT.
   * Hai request đồng thời không thể append trùng cùng (item, shelf, lot), và
   * unique index sourceStockCountId ngăn tạo hai phiếu nguồn giống nhau.
   */
  async upsertFromStockCount(
    input: UpsertStockCountScrapInput,
    session?: ClientSession,
  ): Promise<ScrapNoteDocument | null> {
    const key = {
      itemId: input.line.itemId,
      shelfId: input.line.shelfId,
      sourceCellId: input.line.sourceCellId,
      lotId: input.line.lotId,
    };
    const line = {
      ...key,
      sku: input.line.sku,
      quantity: input.line.quantity,
      reason: input.line.reason,
      images: input.line.images ?? [],
      lockedQuantity: input.line.lockedQuantity ?? input.line.quantity,
      scrapCellId: input.line.scrapCellId ?? null,
      excludedByExpired: input.line.excludedByExpired ?? false,
    };

    const updateExisting = () =>
      this.model
        .findOneAndUpdate(
          {
            sourceStockCountId: input.sourceStockCountId,
            status: ScrapNoteStatus.DRAFT,
            items: { $elemMatch: key },
          },
          {
            $set: {
              'items.$.quantity': input.line.quantity,
              'items.$.reason': input.line.reason,
              ...(input.line.images
                ? { 'items.$.images': input.line.images }
                : {}),
            },
          },
          { new: true, session },
        )
        .exec();

    const appendNew = () =>
      this.model
        .findOneAndUpdate(
          {
            sourceStockCountId: input.sourceStockCountId,
            status: ScrapNoteStatus.DRAFT,
            items: { $not: { $elemMatch: key } },
          },
          { $push: { items: line } },
          { new: true, session },
        )
        .exec();

    const existing = await updateExisting();
    if (existing) return existing;
    const appended = await appendNew();
    if (appended) return appended;

    try {
      const [created] = await this.model.create(
        [
          {
            sourceStockCountId: input.sourceStockCountId,
            scrapNoteNumber: input.scrapNoteNumber,
            status: ScrapNoteStatus.DRAFT,
            createdBy: input.createdBy,
            items: [line],
          },
        ],
        session ? { session } : undefined,
      );
      return created;
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        (error as { code?: unknown }).code !== 11000
      ) {
        throw error;
      }
      return (await updateExisting()) ?? (await appendNew());
    }
  }

  /**
   * Tạo ScrapNote đã APPROVED sẵn (bỏ qua DRAFT) — dùng cho UC-09: hàng
   * DAMAGED từ GoodsReturn đã được RECEIVER xác nhận lúc inspect, không cần
   * MANAGER duyệt lại lần nữa. Nhận session để chạy trong transaction của
   * GoodsReturnService.confirmGoodsReturn.
   */
  async createApprovedScrapNote(
    createdBy: Types.ObjectId,
    lines: CreateScrapNoteLineInput[],
    session: ClientSession,
    scrapNoteNumber: string,
  ): Promise<ScrapNoteDocument> {
    const [doc] = await this.model.create(
      [
        {
          scrapNoteNumber,
          status: ScrapNoteStatus.APPROVED,
          createdBy,
          approvedBy: createdBy,
          items: lines.map((l) => ({
            itemId: l.itemId,
            sku: l.sku,
            shelfId: l.shelfId,
            sourceCellId: l.sourceCellId ?? null,
            lockedQuantity: l.lockedQuantity ?? l.quantity,
            scrapCellId: l.scrapCellId ?? null,
            excludedByExpired: l.excludedByExpired ?? false,
            lotId: l.lotId,
            quantity: l.quantity,
            reason: l.reason,
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

  async claimApprovedIfDraft(
    id: string,
    approvedBy: Types.ObjectId,
    session: ClientSession,
  ): Promise<boolean> {
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, status: ScrapNoteStatus.DRAFT },
        { $set: { status: ScrapNoteStatus.APPROVED, approvedBy } },
        { new: true, session },
      )
      .exec();
    return updated !== null;
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

  async claimRejectedIfDraft(
    id: string,
    approvedBy: Types.ObjectId,
    rejectReason: string,
    session: ClientSession,
  ): Promise<boolean> {
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, status: ScrapNoteStatus.DRAFT },
        {
          $set: {
            status: ScrapNoteStatus.REJECTED,
            approvedBy,
            rejectReason,
          },
        },
        { new: true, session },
      )
      .exec();
    return updated !== null;
  }

  async markItemMovedToScrap(
    id: string,
    itemId: Types.ObjectId,
    sourceCellId: Types.ObjectId | null,
    scrapCellId: Types.ObjectId,
    session: ClientSession,
  ): Promise<ScrapNoteDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: ScrapNoteStatus.APPROVED,
          items: {
            $elemMatch: {
              itemId,
              sourceCellId,
              scrapCellId: null,
            },
          },
        },
        { $set: { 'items.$.scrapCellId': scrapCellId } },
        { new: true, session },
      )
      .exec();
  }

  async markQuarantinedIfAllMoved(
    id: string,
    session: ClientSession,
  ): Promise<void> {
    const doc = await this.model.findOne({ _id: id }).session(session).exec();
    if (
      doc?.status === ScrapNoteStatus.APPROVED &&
      doc.items.every((item) => item.scrapCellId)
    ) {
      await this.model
        .updateOne(
          { _id: id, status: ScrapNoteStatus.APPROVED },
          { $set: { status: ScrapNoteStatus.QUARANTINED } },
          { session },
        )
        .exec();
    }
  }

  async claimDisposedIfQuarantined(
    id: string,
    disposedBy: Types.ObjectId,
    session: ClientSession,
  ): Promise<boolean> {
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, status: ScrapNoteStatus.QUARANTINED },
        {
          $set: {
            status: ScrapNoteStatus.DISPOSED,
            disposedBy,
            disposedAt: new Date(),
          },
        },
        { new: true, session },
      )
      .exec();
    return updated !== null;
  }
}
