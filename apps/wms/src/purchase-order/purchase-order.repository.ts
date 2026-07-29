// apps/wms/src/purchase-order/purchase-order.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderStatus,
} from './schemas/purchase-order.schema';
import type {
  CreatePurchaseOrderDto,
  QueryPurchaseOrderDto,
} from './dto/purchase-order.dto';

export interface ResolvedPurchaseOrderItem {
  itemId: string;
  sku: string;
  expectedQty: number;
  unit: string;
  unitPrice: number;
}

@Injectable()
export class PurchaseOrderRepository {
  constructor(
    @InjectModel(PurchaseOrder.name)
    private readonly model: Model<PurchaseOrderDocument>,
  ) {}

  async createPurchaseOrder(
    dto: CreatePurchaseOrderDto,
    poNumber: string,
    resolvedItems: ResolvedPurchaseOrderItem[],
    actorId: string,
  ): Promise<PurchaseOrderDocument> {
    return this.model.create({
      poNumber,
      supplierId: new Types.ObjectId(dto.supplierId),
      status: PurchaseOrderStatus.CONFIRMED,
      expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
      note: dto.note,
      // itemId giữ string — Mongoose tự cast sang ObjectId theo schema khi lưu.
      // Cast tay vì overload của Model.create() yêu cầu ObjectId ở kiểu tĩnh.
      items: resolvedItems as unknown as PurchaseOrder['items'],
      createdBy: new Types.ObjectId(actorId),
    });
  }

  async findPurchaseOrderById(
    id: string,
  ): Promise<PurchaseOrderDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  /** Tra nhiều PO theo danh sách id cùng lúc — dùng gắn purchaseOrderNumber/supplierName vào GRN list, tránh N+1. */
  async findPurchaseOrdersByIds(
    ids: string[],
  ): Promise<PurchaseOrderDocument[]> {
    return this.model
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .exec();
  }

  /** Đọc PO trong transaction GRN — cần session để thấy đúng bản ghi đang lock. */
  async findPurchaseOrderByIdWithSession(
    id: string,
    session: ClientSession,
  ): Promise<PurchaseOrderDocument | null> {
    return this.model.findOne({ _id: id }, null, { session }).exec();
  }

  /**
   * Cộng dồn receivedQty cho đúng dòng item (positional $) và set lại status PO —
   * cùng 1 update để tránh race giữa nhiều GRN confirm song song trên cùng PO.
   */
  async applyReceivedQtyAndStatus(
    poId: string,
    itemId: string,
    deltaBaseQty: number,
    newStatus: PurchaseOrderStatus,
    session: ClientSession,
  ): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { _id: poId, 'items.itemId': new Types.ObjectId(itemId) },
        {
          $inc: { 'items.$.receivedQty': deltaBaseQty },
          $set: { status: newStatus },
        },
        { session },
      )
      .exec();
  }

  async findPurchaseOrders(
    query: QueryPurchaseOrderDto,
  ): Promise<{ data: PurchaseOrderDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;
    if (query.supplierId)
      filter['supplierId'] = new Types.ObjectId(query.supplierId);

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

  /** Đếm số PO đã tạo trong ngày (theo prefix poNumber) — dùng sinh số thứ tự. */
  async countByPoNumberPrefix(prefix: string): Promise<number> {
    return this.model
      .countDocuments({ poNumber: { $regex: `^${prefix}` } })
      .exec();
  }

  /** Item đã xuất hiện trong ≥1 PO (bất kỳ status) — dùng khóa sửa depth/width/height ở WarehouseItem. */
  async existsByItemId(itemId: string): Promise<boolean> {
    const doc = await this.model
      .exists({ 'items.itemId': new Types.ObjectId(itemId) })
      .exec();
    return doc !== null;
  }

  /**
   * PO còn có thể tạo GRN (chưa COMPLETED) — dùng cho màn hình RECEIVER
   * chọn đơn để nhận hàng. Không lọc theo dòng item còn thiếu ở query Mongo (tính
   * remainingQty ở service, đơn giản hơn và nhất quán với logic auto-fill GRN).
   */
  async findReceivablePurchaseOrders(
    page: number,
    limit: number,
  ): Promise<{ data: PurchaseOrderDocument[]; total: number }> {
    const filter = {
      status: { $ne: PurchaseOrderStatus.COMPLETED },
    };
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
}
