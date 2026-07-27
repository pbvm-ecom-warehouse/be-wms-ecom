import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { LocationRepository } from './location.repository';
import type { ZoneDocument } from './schemas/zone.schema';
import type { RackDocument } from './schemas/rack.schema';
import type { ShelfDocument } from './schemas/shelf.schema';
import type { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import type { CreateRackDto, UpdateRackDto } from './dto/rack.dto';
import type { CreateShelfDto, UpdateShelfDto } from './dto/shelf.dto';
import type { RackTemplateDocument } from './schemas/rack-template.schema';
import type { UpdateRackTemplateDto } from './dto/rack-template.dto';
import type { AisleDocument } from './schemas/aisle.schema';
import type { CreateAisleDto, UpdateAisleDto } from './dto/aisle.dto';
import type { GateDocument } from './schemas/gate.schema';
import type { CreateGateDto, UpdateGateDto } from './dto/gate.dto';

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

  // ─── RackTemplate ─────────────────────────────────────────────────────────

  async getRackTemplate(): Promise<RackTemplateDocument> {
    return this.repo.getRackTemplate();
  }

  async updateRackTemplate(
    dto: UpdateRackTemplateDto,
    actorId: string,
  ): Promise<RackTemplateDocument> {
    return this.repo.updateRackTemplate(dto, actorId);
  }

  // ─── Aisle ────────────────────────────────────────────────────────────────

  async createAisle(
    dto: CreateAisleDto,
    actorId: string,
  ): Promise<AisleDocument> {
    const existing = await this.repo.findAisleByCode(dto.code);
    if (existing) throw new AppException('AISLE_CODE_EXISTS');
    return this.repo.createAisle(dto, actorId);
  }

  async listAisles(): Promise<AisleDocument[]> {
    return this.repo.findAllAisles();
  }

  async getAisle(id: string): Promise<AisleDocument> {
    const doc = await this.repo.findAisleById(id);
    if (!doc) throw new AppException('AISLE_NOT_FOUND');
    return doc;
  }

  async updateAisle(
    id: string,
    dto: UpdateAisleDto,
    actorId: string,
  ): Promise<AisleDocument> {
    if (dto.code) {
      const existing = await this.repo.findAisleByCode(dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('AISLE_CODE_EXISTS');
    }
    const doc = await this.repo.updateAisle(id, dto, actorId);
    if (!doc) throw new AppException('AISLE_NOT_FOUND');
    return doc;
  }

  async deleteAisle(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteAisle(id, actorId);
    if (!deleted) throw new AppException('AISLE_NOT_FOUND');
  }

  // ─── Gate ─────────────────────────────────────────────────────────────────

  async createGate(dto: CreateGateDto, actorId: string): Promise<GateDocument> {
    const existing = await this.repo.findGateByCode(dto.code);
    if (existing) throw new AppException('GATE_CODE_EXISTS');
    return this.repo.createGate(dto, actorId);
  }

  async listGates(): Promise<GateDocument[]> {
    return this.repo.findAllGates();
  }

  async getGate(id: string): Promise<GateDocument> {
    const doc = await this.repo.findGateById(id);
    if (!doc) throw new AppException('GATE_NOT_FOUND');
    return doc;
  }

  async updateGate(
    id: string,
    dto: UpdateGateDto,
    actorId: string,
  ): Promise<GateDocument> {
    if (dto.code) {
      const existing = await this.repo.findGateByCode(dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('GATE_CODE_EXISTS');
    }
    const doc = await this.repo.updateGate(id, dto, actorId);
    if (!doc) throw new AppException('GATE_NOT_FOUND');
    return doc;
  }

  async deleteGate(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteGate(id, actorId);
    if (!deleted) throw new AppException('GATE_NOT_FOUND');
  }
}
