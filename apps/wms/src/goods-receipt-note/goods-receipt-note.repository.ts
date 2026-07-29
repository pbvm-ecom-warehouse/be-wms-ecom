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
  lotNumber?: string;
  manufacturedDate: Date;
  expiryDate?: Date;
  note?: string;
  wholePackageOnly: boolean;
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
    images: string[],
  ): Promise<GoodsReceiptNoteDocument> {
    return this.model.create({
      grnNumber,
      purchaseOrderId: new Types.ObjectId(purchaseOrderId),
      status: GoodsReceiptNoteStatus.DRAFT,
      // itemId giữ string — Mongoose tự cast theo schema; cast tay vì Model.create() đòi ObjectId ở kiểu tĩnh
      items: resolvedItems as unknown as GoodsReceiptNote['items'],
      images,
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

  /** PO có GRN đang DRAFT/PENDING_APPROVAL — chặn tạo GRN mới trùng lặp cho cùng PO. */
  async existsOpenGrnForPurchaseOrder(
    purchaseOrderId: string,
  ): Promise<boolean> {
    const doc = await this.model
      .exists({
        purchaseOrderId: new Types.ObjectId(purchaseOrderId),
        status: {
          $in: [
            GoodsReceiptNoteStatus.DRAFT,
            GoodsReceiptNoteStatus.PENDING_APPROVAL,
          ],
        },
      })
      .exec();
    return doc !== null;
  }

  /** DRAFT/REJECTED → PENDING_APPROVAL: Receiver đã gửi ảnh và số thùng để duyệt. */
  async updateStatusSubmitted(
    id: string,
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: {
            $in: [
              GoodsReceiptNoteStatus.DRAFT,
              GoodsReceiptNoteStatus.REJECTED,
            ],
          },
        },
        {
          status: GoodsReceiptNoteStatus.PENDING_APPROVAL,
          submittedBy: new Types.ObjectId(actorId),
          submittedAt: new Date(),
          rejectedBy: undefined,
          rejectedAt: undefined,
          rejectionReason: undefined,
        },
        { new: true },
      )
      .exec();
  }

  /** PENDING_APPROVAL → APPROVED trong transaction cộng tồn — session bắt buộc để atomic với stock. */
  async updateStatusApproved(
    id: string,
    actorId: string,
    session: ClientSession,
  ): Promise<GoodsReceiptNoteDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: GoodsReceiptNoteStatus.PENDING_APPROVAL },
        {
          status: GoodsReceiptNoteStatus.APPROVED,
          approvedBy: new Types.ObjectId(actorId),
          approvedAt: new Date(),
        },
        { new: true, session },
      )
      .exec();
  }

  async updateStatusRejected(
    id: string,
    actorId: string,
    reason: string,
  ): Promise<GoodsReceiptNoteDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: GoodsReceiptNoteStatus.PENDING_APPROVAL },
        {
          status: GoodsReceiptNoteStatus.REJECTED,
          rejectedBy: new Types.ObjectId(actorId),
          rejectedAt: new Date(),
          rejectionReason: reason,
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

  /** Thay thế toàn bộ items của GRN còn DRAFT — service đã validate trước khi gọi.
   * GRN không có updatedBy (chứng từ giao dịch, không audit field này — xem
   * data-and-mongoose.md), timestamps:true đã tự cập nhật updatedAt. */
  async replaceItems(
    id: string,
    resolvedItems: ResolvedGoodsReceiptNoteItem[],
  ): Promise<GoodsReceiptNoteDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: {
            $in: [
              GoodsReceiptNoteStatus.DRAFT,
              GoodsReceiptNoteStatus.REJECTED,
            ],
          },
        },
        // itemId giữ string — Mongoose tự cast theo schema, cùng cách createGoodsReceiptNote làm.
        { items: resolvedItems as unknown as GoodsReceiptNote['items'] },
        { new: true },
      )
      .exec();
  }

  /** Xóa vật lý GRN còn DRAFT — service đã kiểm tra status trước khi gọi. */
  async deleteGoodsReceiptNote(id: string): Promise<void> {
    await this.model
      .deleteOne({ _id: id, status: GoodsReceiptNoteStatus.DRAFT })
      .exec();
  }
}
