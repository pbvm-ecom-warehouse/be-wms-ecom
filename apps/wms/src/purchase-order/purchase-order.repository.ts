// apps/wms/src/purchase-order/purchase-order.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
      warehouseId: new Types.ObjectId(dto.warehouseId),
      status: PurchaseOrderStatus.CONFIRMED,
      expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
      note: dto.note,
      // itemId giữ nguyên string — Mongoose tự cast sang ObjectId theo schema khi lưu
      items: resolvedItems,
      createdBy: new Types.ObjectId(actorId),
    });
  }

  async findPurchaseOrderById(
    id: string,
  ): Promise<PurchaseOrderDocument | null> {
    return this.model.findOne({ _id: id }).exec();
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
}
