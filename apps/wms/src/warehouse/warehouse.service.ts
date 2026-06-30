// apps/wms/src/warehouse/warehouse.service.ts
import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { WarehouseRepository } from './warehouse.repository';
import type { WarehouseDocument } from './schemas/warehouse.schema';
import type { ZoneDocument } from './schemas/zone.schema';
import type { RackDocument } from './schemas/rack.schema';
import type { ShelfDocument } from './schemas/shelf.schema';
import type { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import type { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import type { CreateRackDto, UpdateRackDto } from './dto/rack.dto';
import type { CreateShelfDto, UpdateShelfDto } from './dto/shelf.dto';
import { WMS_ERRORS } from '../common/error-codes';

@Injectable()
export class WarehouseService {
  constructor(private readonly repo: WarehouseRepository) {}

  // ─── Warehouse ────────────────────────────────────────────────────────────

  async createWarehouse(dto: CreateWarehouseDto, actorId: string): Promise<WarehouseDocument> {
    // Warehouse chỉ có name + address, không có code → bỏ qua kiểm tra WAREHOUSE_CODE_EXISTS
    return this.repo.createWarehouse(dto, actorId);
  }

  async listWarehouses(): Promise<WarehouseDocument[]> {
    return this.repo.findAllWarehouses();
  }

  async getWarehouse(id: string): Promise<WarehouseDocument> {
    const doc = await this.repo.findWarehouseById(id);
    if (!doc) throw new AppException('WAREHOUSE_NOT_FOUND', WMS_ERRORS.WAREHOUSE_NOT_FOUND.message, WMS_ERRORS.WAREHOUSE_NOT_FOUND.status);
    return doc;
  }

  async updateWarehouse(
    id: string,
    dto: UpdateWarehouseDto,
    actorId: string,
  ): Promise<WarehouseDocument> {
    const doc = await this.repo.updateWarehouse(id, dto, actorId);
    if (!doc) throw new AppException('WAREHOUSE_NOT_FOUND', WMS_ERRORS.WAREHOUSE_NOT_FOUND.message, WMS_ERRORS.WAREHOUSE_NOT_FOUND.status);
    return doc;
  }

  async deleteWarehouse(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteWarehouse(id, actorId);
    if (!deleted) throw new AppException('WAREHOUSE_NOT_FOUND', WMS_ERRORS.WAREHOUSE_NOT_FOUND.message, WMS_ERRORS.WAREHOUSE_NOT_FOUND.status);
  }

  // ─── Zone ─────────────────────────────────────────────────────────────────

  async createZone(dto: CreateZoneDto, actorId: string): Promise<ZoneDocument> {
    // kiểm tra warehouse tồn tại trước khi tạo zone con
    const warehouse = await this.repo.findWarehouseById(dto.warehouseId);
    if (!warehouse) throw new AppException('WAREHOUSE_NOT_FOUND', WMS_ERRORS.WAREHOUSE_NOT_FOUND.message, WMS_ERRORS.WAREHOUSE_NOT_FOUND.status);
    // kiểm tra code unique trong warehouse
    const existing = await this.repo.findZoneByCode(dto.warehouseId, dto.code);
    if (existing) throw new AppException('ZONE_CODE_EXISTS', WMS_ERRORS.ZONE_CODE_EXISTS.message, WMS_ERRORS.ZONE_CODE_EXISTS.status);
    return this.repo.createZone(dto, actorId);
  }

  async listZones(warehouseId: string): Promise<ZoneDocument[]> {
    return this.repo.findZonesByWarehouse(warehouseId);
  }

  async getZone(id: string): Promise<ZoneDocument> {
    const doc = await this.repo.findZoneById(id);
    if (!doc) throw new AppException('ZONE_NOT_FOUND', WMS_ERRORS.ZONE_NOT_FOUND.message, WMS_ERRORS.ZONE_NOT_FOUND.status);
    return doc;
  }

  async updateZone(id: string, dto: UpdateZoneDto, actorId: string): Promise<ZoneDocument> {
    // nếu đổi code → kiểm tra unique trong warehouse (loại trừ chính nó bằng id)
    if (dto.code) {
      const zone = await this.repo.findZoneById(id);
      if (!zone) throw new AppException('ZONE_NOT_FOUND', WMS_ERRORS.ZONE_NOT_FOUND.message, WMS_ERRORS.ZONE_NOT_FOUND.status);
      const warehouseId = dto.warehouseId ?? zone.warehouseId.toString();
      const existing = await this.repo.findZoneByCode(warehouseId, dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('ZONE_CODE_EXISTS', WMS_ERRORS.ZONE_CODE_EXISTS.message, WMS_ERRORS.ZONE_CODE_EXISTS.status);
    }
    const doc = await this.repo.updateZone(id, dto, actorId);
    if (!doc) throw new AppException('ZONE_NOT_FOUND', WMS_ERRORS.ZONE_NOT_FOUND.message, WMS_ERRORS.ZONE_NOT_FOUND.status);
    return doc;
  }

  async deleteZone(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteZone(id, actorId);
    if (!deleted) throw new AppException('ZONE_NOT_FOUND', WMS_ERRORS.ZONE_NOT_FOUND.message, WMS_ERRORS.ZONE_NOT_FOUND.status);
  }

  // ─── Rack ─────────────────────────────────────────────────────────────────

  async createRack(dto: CreateRackDto, actorId: string): Promise<RackDocument> {
    // kiểm tra zone cha tồn tại trước khi tạo rack con
    const zone = await this.repo.findZoneById(dto.zoneId);
    if (!zone) throw new AppException('ZONE_NOT_FOUND', WMS_ERRORS.ZONE_NOT_FOUND.message, WMS_ERRORS.ZONE_NOT_FOUND.status);
    // kiểm tra code unique trong zone
    const existing = await this.repo.findRackByCode(dto.zoneId, dto.code);
    if (existing) throw new AppException('RACK_CODE_EXISTS', WMS_ERRORS.RACK_CODE_EXISTS.message, WMS_ERRORS.RACK_CODE_EXISTS.status);
    return this.repo.createRack(dto, actorId);
  }

  async listRacks(zoneId: string): Promise<RackDocument[]> {
    return this.repo.findRacksByZone(zoneId);
  }

  async getRack(id: string): Promise<RackDocument> {
    const doc = await this.repo.findRackById(id);
    if (!doc) throw new AppException('RACK_NOT_FOUND', WMS_ERRORS.RACK_NOT_FOUND.message, WMS_ERRORS.RACK_NOT_FOUND.status);
    return doc;
  }

  async updateRack(id: string, dto: UpdateRackDto, actorId: string): Promise<RackDocument> {
    // nếu đổi code → kiểm tra unique trong zone (loại trừ chính nó bằng id)
    if (dto.code) {
      const rack = await this.repo.findRackById(id);
      if (!rack) throw new AppException('RACK_NOT_FOUND', WMS_ERRORS.RACK_NOT_FOUND.message, WMS_ERRORS.RACK_NOT_FOUND.status);
      const zoneId = dto.zoneId ?? rack.zoneId.toString();
      const existing = await this.repo.findRackByCode(zoneId, dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('RACK_CODE_EXISTS', WMS_ERRORS.RACK_CODE_EXISTS.message, WMS_ERRORS.RACK_CODE_EXISTS.status);
    }
    const doc = await this.repo.updateRack(id, dto, actorId);
    if (!doc) throw new AppException('RACK_NOT_FOUND', WMS_ERRORS.RACK_NOT_FOUND.message, WMS_ERRORS.RACK_NOT_FOUND.status);
    return doc;
  }

  async deleteRack(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteRack(id, actorId);
    if (!deleted) throw new AppException('RACK_NOT_FOUND', WMS_ERRORS.RACK_NOT_FOUND.message, WMS_ERRORS.RACK_NOT_FOUND.status);
  }

  // ─── Shelf ────────────────────────────────────────────────────────────────

  async createShelf(dto: CreateShelfDto, actorId: string): Promise<ShelfDocument> {
    // kiểm tra rack cha tồn tại trước khi tạo shelf con
    const rack = await this.repo.findRackById(dto.rackId);
    if (!rack) throw new AppException('RACK_NOT_FOUND', WMS_ERRORS.RACK_NOT_FOUND.message, WMS_ERRORS.RACK_NOT_FOUND.status);
    // kiểm tra code unique toàn cục (shelf code là barcode dùng trên toàn hệ thống)
    const existing = await this.repo.findShelfByCode(dto.code);
    if (existing) throw new AppException('SHELF_CODE_EXISTS', WMS_ERRORS.SHELF_CODE_EXISTS.message, WMS_ERRORS.SHELF_CODE_EXISTS.status);
    return this.repo.createShelf(dto, actorId);
  }

  async listShelves(rackId: string): Promise<ShelfDocument[]> {
    return this.repo.findShelvesByRack(rackId);
  }

  async getShelf(id: string): Promise<ShelfDocument> {
    const doc = await this.repo.findShelfById(id);
    if (!doc) throw new AppException('SHELF_NOT_FOUND', WMS_ERRORS.SHELF_NOT_FOUND.message, WMS_ERRORS.SHELF_NOT_FOUND.status);
    return doc;
  }

  async updateShelf(id: string, dto: UpdateShelfDto, actorId: string): Promise<ShelfDocument> {
    // nếu đổi code → kiểm tra unique toàn cục (loại trừ chính nó bằng id)
    if (dto.code) {
      const existing = await this.repo.findShelfByCode(dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('SHELF_CODE_EXISTS', WMS_ERRORS.SHELF_CODE_EXISTS.message, WMS_ERRORS.SHELF_CODE_EXISTS.status);
    }
    const doc = await this.repo.updateShelf(id, dto, actorId);
    if (!doc) throw new AppException('SHELF_NOT_FOUND', WMS_ERRORS.SHELF_NOT_FOUND.message, WMS_ERRORS.SHELF_NOT_FOUND.status);
    return doc;
  }

  async deleteShelf(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteShelf(id, actorId);
    if (!deleted) throw new AppException('SHELF_NOT_FOUND', WMS_ERRORS.SHELF_NOT_FOUND.message, WMS_ERRORS.SHELF_NOT_FOUND.status);
  }
}
