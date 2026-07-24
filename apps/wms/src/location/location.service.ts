import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { LocationRepository } from './location.repository';
import type { ZoneDocument } from './schemas/zone.schema';
import type { RackDocument } from './schemas/rack.schema';
import type { ShelfDocument } from './schemas/shelf.schema';
import type { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import type { CreateRackDto, UpdateRackDto } from './dto/rack.dto';
import type { CreateShelfDto, UpdateShelfDto } from './dto/shelf.dto';

@Injectable()
export class LocationService {
  constructor(private readonly repo: LocationRepository) {}

  // ─── Zone ─────────────────────────────────────────────────────────────────

  async createZone(dto: CreateZoneDto, actorId: string): Promise<ZoneDocument> {
    const existing = await this.repo.findZoneByCode(dto.code);
    if (existing) throw new AppException('ZONE_CODE_EXISTS');
    return this.repo.createZone(dto, actorId);
  }

  async listZones(): Promise<ZoneDocument[]> {
    return this.repo.findAllZones();
  }

  async getZone(id: string): Promise<ZoneDocument> {
    const doc = await this.repo.findZoneById(id);
    if (!doc) throw new AppException('ZONE_NOT_FOUND');
    return doc;
  }

  async updateZone(
    id: string,
    dto: UpdateZoneDto,
    actorId: string,
  ): Promise<ZoneDocument> {
    if (dto.code) {
      const existing = await this.repo.findZoneByCode(dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('ZONE_CODE_EXISTS');
    }
    const doc = await this.repo.updateZone(id, dto, actorId);
    if (!doc) throw new AppException('ZONE_NOT_FOUND');
    return doc;
  }

  async deleteZone(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteZone(id, actorId);
    if (!deleted) throw new AppException('ZONE_NOT_FOUND');
  }

  // ─── Rack ─────────────────────────────────────────────────────────────────

  async createRack(dto: CreateRackDto, actorId: string): Promise<RackDocument> {
    const zone = await this.repo.findZoneById(dto.zoneId);
    if (!zone) throw new AppException('ZONE_NOT_FOUND');
    const existing = await this.repo.findRackByCode(dto.zoneId, dto.code);
    if (existing) throw new AppException('RACK_CODE_EXISTS');
    return this.repo.createRack(dto, actorId);
  }

  async listRacks(zoneId: string): Promise<RackDocument[]> {
    return this.repo.findRacksByZone(zoneId);
  }

  async getRack(id: string): Promise<RackDocument> {
    const doc = await this.repo.findRackById(id);
    if (!doc) throw new AppException('RACK_NOT_FOUND');
    return doc;
  }

  async updateRack(
    id: string,
    dto: UpdateRackDto,
    actorId: string,
  ): Promise<RackDocument> {
    if (dto.code) {
      const rack = await this.repo.findRackById(id);
      if (!rack) throw new AppException('RACK_NOT_FOUND');
      const zoneId = dto.zoneId ?? rack.zoneId.toString();
      const existing = await this.repo.findRackByCode(zoneId, dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('RACK_CODE_EXISTS');
    }
    const doc = await this.repo.updateRack(id, dto, actorId);
    if (!doc) throw new AppException('RACK_NOT_FOUND');
    return doc;
  }

  async deleteRack(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteRack(id, actorId);
    if (!deleted) throw new AppException('RACK_NOT_FOUND');
  }

  // ─── Shelf ────────────────────────────────────────────────────────────────

  async createShelf(
    dto: CreateShelfDto,
    actorId: string,
  ): Promise<ShelfDocument> {
    const rack = await this.repo.findRackById(dto.rackId);
    if (!rack) throw new AppException('RACK_NOT_FOUND');
    const existing = await this.repo.findShelfByCode(dto.code);
    if (existing) throw new AppException('SHELF_CODE_EXISTS');
    return this.repo.createShelf(dto, actorId);
  }

  async listShelves(rackId: string): Promise<ShelfDocument[]> {
    return this.repo.findShelvesByRack(rackId);
  }

  async getShelf(id: string): Promise<ShelfDocument> {
    const doc = await this.repo.findShelfById(id);
    if (!doc) throw new AppException('SHELF_NOT_FOUND');
    return doc;
  }

  async updateShelf(
    id: string,
    dto: UpdateShelfDto,
    actorId: string,
  ): Promise<ShelfDocument> {
    if (dto.code) {
      const existing = await this.repo.findShelfByCode(dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('SHELF_CODE_EXISTS');
    }
    const doc = await this.repo.updateShelf(id, dto, actorId);
    if (!doc) throw new AppException('SHELF_NOT_FOUND');
    return doc;
  }

  async deleteShelf(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteShelf(id, actorId);
    if (!deleted) throw new AppException('SHELF_NOT_FOUND');
  }

  /** GRN CONFIRMED cần shelf staging duy nhất — không có thì chặn confirm. */
  async findStagingShelf(): Promise<ShelfDocument> {
    const shelf = await this.repo.findStagingShelf();
    if (!shelf) throw new AppException('GRN_STAGING_SHELF_NOT_FOUND');
    return shelf;
  }
}
