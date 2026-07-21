// apps/wms/src/supplier/supplier.service.ts
import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common/errors/app.exception';
import { SupplierRepository } from './supplier.repository';
import { SupplierStatus } from './schemas/supplier.schema';
import type { SupplierDocument } from './schemas/supplier.schema';
import type { SupplierItemDocument } from './schemas/supplier-item.schema';
import type {
  CreateSupplierDto,
  UpdateSupplierDto,
  ChangeSupplierStatusDto,
  QuerySupplierDto,
} from './dto/supplier.dto';
import type {
  CreateSupplierItemDto,
  UpdateSupplierItemDto,
} from './dto/supplier-item.dto';

@Injectable()
export class SupplierService {
  constructor(private readonly repo: SupplierRepository) {}

  // ─── Supplier ─────────────────────────────────────────────────────────────

  async createSupplier(
    dto: CreateSupplierDto,
    actorId: string,
  ): Promise<SupplierDocument> {
    // Kiểm tra code trùng — code NCC là duy nhất và không đổi sau khi có PO
    const existing = await this.repo.findSupplierByCode(dto.code);
    if (existing) throw new AppException('SUPPLIER_CODE_EXISTS');
    return this.repo.createSupplier(dto, actorId);
  }

  async listSuppliers(
    query: QuerySupplierDto,
  ): Promise<{ data: SupplierDocument[]; total: number }> {
    return this.repo.findSuppliers(query);
  }

  async getSupplier(id: string): Promise<SupplierDocument> {
    const doc = await this.repo.findSupplierById(id);
    if (!doc) throw new AppException('SUPPLIER_NOT_FOUND');
    return doc;
  }

  async updateSupplier(
    id: string,
    dto: UpdateSupplierDto,
    actorId: string,
  ): Promise<SupplierDocument> {
    const doc = await this.repo.updateSupplier(id, dto, actorId);
    if (!doc) throw new AppException('SUPPLIER_NOT_FOUND');
    return doc;
  }

  /**
   * Đổi trạng thái NCC.
   * Quy tắc chuyển trạng thái: gỡ BLACKLIST → trạng thái khác chỉ ADMIN làm được.
   * role = role hiện tại của actor (lấy từ JWT payload).
   */
  async changeStatus(
    id: string,
    dto: ChangeSupplierStatusDto,
    actorId: string,
    role: string,
  ): Promise<SupplierDocument> {
    const supplier = await this.repo.findSupplierById(id);
    if (!supplier) throw new AppException('SUPPLIER_NOT_FOUND');

    // Gỡ BLACKLIST → trạng thái khác: chỉ ADMIN mới được phép
    if (
      supplier.status === SupplierStatus.BLACKLIST &&
      dto.status !== SupplierStatus.BLACKLIST &&
      role !== 'ADMIN'
    ) {
      throw new AppException('SUPPLIER_BLACKLISTED');
    }

    const doc = await this.repo.changeSupplierStatus(id, dto.status, actorId);
    if (!doc) throw new AppException('SUPPLIER_NOT_FOUND');
    return doc;
  }

  async deleteSupplier(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteSupplier(id, actorId);
    if (!deleted) throw new AppException('SUPPLIER_NOT_FOUND');
  }

  // ─── SupplierItem ─────────────────────────────────────────────────────────

  /**
   * Tạo nếu SKU chưa có NCC chính, cập nhật nếu đã có.
   * Ràng buộc: 1 SKU ↔ 1 dòng SupplierItem (unique itemId).
   */
  async upsertSupplierItem(
    dto: CreateSupplierItemDto,
  ): Promise<SupplierItemDocument> {
    const existing = await this.repo.findSupplierItemByItemId(dto.itemId);
    if (!existing) {
      return this.repo.createSupplierItem(dto);
    }
    // Không truyền itemId vào update — field này bất biến sau khi tạo
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { itemId: _itemId, ...updateFields } = dto;
    const updated = await this.repo.updateSupplierItem(
      existing._id.toString(),
      updateFields,
    );
    if (!updated) throw new AppException('SUPPLIER_ITEM_NOT_FOUND');
    return updated;
  }

  async getSupplierItem(id: string): Promise<SupplierItemDocument> {
    const doc = await this.repo.findSupplierItemById(id);
    if (!doc) throw new AppException('SUPPLIER_ITEM_NOT_FOUND');
    return doc;
  }

  async listSupplierItemsBySupplierId(
    supplierId: string,
  ): Promise<SupplierItemDocument[]> {
    return this.repo.findSupplierItemsBySupplierId(supplierId);
  }

  async getSupplierItemByItemId(itemId: string): Promise<SupplierItemDocument> {
    const doc = await this.repo.findSupplierItemByItemId(itemId);
    if (!doc) throw new AppException('SUPPLIER_ITEM_NOT_FOUND');
    return doc;
  }

  async updateSupplierItem(
    id: string,
    dto: UpdateSupplierItemDto,
  ): Promise<SupplierItemDocument> {
    const doc = await this.repo.updateSupplierItem(id, dto);
    if (!doc) throw new AppException('SUPPLIER_ITEM_NOT_FOUND');
    return doc;
  }

  /**
   * Guard cho module PO: chặn xác nhận PO khi NCC không ở trạng thái ACTIVE.
   * PO service gọi method này ở bước DRAFT → CONFIRMED.
   */
  async assertSupplierActive(supplierId: string): Promise<void> {
    const supplier = await this.repo.findSupplierById(supplierId);
    if (!supplier) throw new AppException('SUPPLIER_NOT_FOUND');
    if (supplier.status !== SupplierStatus.ACTIVE) {
      throw new AppException('SUPPLIER_NOT_ACTIVE');
    }
  }
}
