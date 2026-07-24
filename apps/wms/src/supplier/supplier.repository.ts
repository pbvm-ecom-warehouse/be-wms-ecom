// apps/wms/src/supplier/supplier.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '@app/common';
import {
  Supplier,
  SupplierDocument,
  SupplierStatus,
} from './schemas/supplier.schema';
import {
  SupplierItem,
  SupplierItemDocument,
} from './schemas/supplier-item.schema';
import type {
  CreateSupplierDto,
  UpdateSupplierDto,
  QuerySupplierDto,
} from './dto/supplier.dto';
import type {
  CreateSupplierItemDto,
  UpdateSupplierItemDto,
} from './dto/supplier-item.dto';

// Supplier là master data — soft-delete, luôn filter deletedAt: null
const SOFT_DELETE_FILTER = { deletedAt: null } as const;

@Injectable()
export class SupplierRepository {
  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(SupplierItem.name)
    private readonly supplierItemModel: Model<SupplierItemDocument>,
  ) {}

  // ─── Supplier ─────────────────────────────────────────────────────────────

  async createSupplier(
    dto: CreateSupplierDto,
    actorId: string,
  ): Promise<SupplierDocument> {
    return this.supplierModel.create({
      ...dto,
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findSupplierById(id: string): Promise<SupplierDocument | null> {
    return this.supplierModel
      .findOne({ _id: id, ...SOFT_DELETE_FILTER })
      .exec();
  }

  async findSupplierByCode(code: string): Promise<SupplierDocument | null> {
    return this.supplierModel.findOne({ code, ...SOFT_DELETE_FILTER }).exec();
  }

  async findSuppliers(
    query: QuerySupplierDto,
  ): Promise<{ data: SupplierDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { ...SOFT_DELETE_FILTER };

    if (query.status) filter['status'] = query.status;
    if (query.search) {
      filter['$or'] = [
        { name: { $regex: query.search, $options: 'i' } },
        { code: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.supplierModel
        .find(filter)
        .sort({ code: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.supplierModel.countDocuments(filter).exec(),
    ]);
    return { data, total };
  }

  async updateSupplier(
    id: string,
    dto: UpdateSupplierDto,
    actorId: string,
  ): Promise<SupplierDocument | null> {
    return this.supplierModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { ...dto, updatedBy: new Types.ObjectId(actorId) },
        { new: true },
      )
      .exec();
  }

  async changeSupplierStatus(
    id: string,
    status: SupplierStatus,
    actorId: string,
  ): Promise<SupplierDocument | null> {
    return this.supplierModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { status, updatedBy: new Types.ObjectId(actorId) },
        { new: true },
      )
      .exec();
  }

  async softDeleteSupplier(id: string, actorId: string): Promise<boolean> {
    const res = await this.supplierModel
      .updateOne(
        { _id: id, ...SOFT_DELETE_FILTER },
        { deletedAt: new Date(), updatedBy: new Types.ObjectId(actorId) },
      )
      .exec();
    return res.modifiedCount > 0;
  }

  // ─── SupplierItem ─────────────────────────────────────────────────────────
  // SupplierItem không soft-delete — dùng isActive để tắt báo giá hết hiệu lực

  async createSupplierItem(
    dto: CreateSupplierItemDto,
    actorId: string,
  ): Promise<SupplierItemDocument> {
    return this.supplierItemModel.create({
      ...dto,
      itemId: new Types.ObjectId(dto.itemId),
      supplierId: new Types.ObjectId(dto.supplierId),
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findSupplierItemById(id: string): Promise<SupplierItemDocument | null> {
    return this.supplierItemModel.findOne({ _id: id }).exec();
  }

  /** Mọi báo giá (mọi NCC) đã đăng ký cho 1 SKU — dùng để so sánh giá trước khi đặt PO. */
  async findSupplierItemsByItemId(
    itemId: string,
  ): Promise<SupplierItemDocument[]> {
    return this.supplierItemModel
      .find({ itemId: new Types.ObjectId(itemId) })
      .exec();
  }

  /** Tra đúng 1 báo giá theo cặp (SKU, NCC) — dùng khi upsert và khi PO auto-fill giá. */
  async findSupplierItemByItemAndSupplier(
    itemId: string,
    supplierId: string,
  ): Promise<SupplierItemDocument | null> {
    return this.supplierItemModel
      .findOne({
        itemId: new Types.ObjectId(itemId),
        supplierId: new Types.ObjectId(supplierId),
      })
      .exec();
  }

  async findSupplierItemsBySupplierId(
    supplierId: string,
  ): Promise<SupplierItemDocument[]> {
    return this.supplierItemModel
      .find({ supplierId: new Types.ObjectId(supplierId) })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async updateSupplierItem(
    id: string,
    dto: UpdateSupplierItemDto,
    actorId: string,
  ): Promise<SupplierItemDocument | null> {
    // Convert supplierId string thành ObjectId nếu có trong dto
    const update: Record<string, unknown> = {
      ...dto,
      updatedBy: new Types.ObjectId(actorId),
    };
    if (dto.supplierId)
      update['supplierId'] = new Types.ObjectId(dto.supplierId);
    try {
      return await this.supplierItemModel
        .findOneAndUpdate({ _id: id }, update, { new: true })
        .exec();
    } catch (err) {
      // Đổi supplierId trùng cặp (itemId, supplierId) đã có báo giá khác → 11000
      if ((err as { code?: number }).code === 11000) {
        throw new AppException('SUPPLIER_ITEM_PAIR_CONFLICT');
      }
      throw err;
    }
  }
}
