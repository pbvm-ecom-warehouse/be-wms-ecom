import { Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { AppException } from '@app/common/errors/app.exception';
import { LocationRepository } from './location.repository';
import { StockRepository } from '../stock/stock.repository';
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
import { validateWarehouseLayoutGeometry } from './warehouse-layout.validator';

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class LocationService {
  constructor(
    private readonly repo: LocationRepository,
    private readonly stockRepo: StockRepository,
  ) {}

  private async validateLayout(session: ClientSession): Promise<void> {
    const config = await this.repo.getLayoutConfig(session);
    const rackTemplate = await this.repo.getRackTemplate(session);
    const zones = await this.repo.findAllZones(session);
    const racks = await this.repo.findAllRacks(session);
    const aisles = await this.repo.findAllAisles(session);
    const gates = await this.repo.findAllGates(session);
    const issues = validateWarehouseLayoutGeometry({
      canvas: {
        widthM: config.widthM,
        heightM: config.heightM,
        gridM: config.gridM,
      },
      rackTemplate,
      zones,
      racks,
      aisles,
      gates,
    });
    if (issues.length > 0) {
      throw new AppException('LAYOUT_VALIDATION_FAILED', undefined, undefined, {
        issues,
      });
    }
  }

  private async mutateWithRevision<T>(
    actorId: string,
    mutation: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    return this.repo.runInTransaction(async (session) => {
      const result = await mutation(session);
      await this.validateLayout(session);
      await this.repo.incrementLayoutRevision(actorId, session);
      return result;
    });
  }

  // ─── Zone ─────────────────────────────────────────────────────────────────

  async createZone(dto: CreateZoneDto, actorId: string): Promise<ZoneDocument> {
    return this.mutateWithRevision(actorId, async (session) => {
      const existing = await this.repo.findZoneByCode(dto.code, session);
      if (existing) throw new AppException('ZONE_CODE_EXISTS');
      return this.repo.createZone(dto, actorId, session);
    });
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
    return this.mutateWithRevision(actorId, async (session) => {
      if (dto.code) {
        const existing = await this.repo.findZoneByCode(dto.code, session);
        if (existing && existing._id.toString() !== id)
          throw new AppException('ZONE_CODE_EXISTS');
      }
      const doc = await this.repo.updateZone(id, dto, actorId, session);
      if (!doc) throw new AppException('ZONE_NOT_FOUND');
      return doc;
    });
  }

  async deleteZone(id: string, actorId: string): Promise<void> {
    await this.mutateWithRevision(actorId, async (session) => {
      if (await this.repo.hasRacksInZone(id, session)) {
        throw new AppException('ZONE_HAS_RACKS');
      }
      const deleted = await this.repo.softDeleteZone(id, actorId, session);
      if (!deleted) throw new AppException('ZONE_NOT_FOUND');
      return true;
    });
  }

  // ─── Rack ─────────────────────────────────────────────────────────────────

  async createRack(dto: CreateRackDto, actorId: string): Promise<RackDocument> {
    return this.mutateWithRevision(actorId, async (session) => {
      const zone = await this.repo.findZoneById(dto.zoneId, session);
      if (!zone) throw new AppException('ZONE_NOT_FOUND');
      const existing = await this.repo.findRackByCode(
        dto.zoneId,
        dto.code,
        session,
      );
      if (existing) throw new AppException('RACK_CODE_EXISTS');
      return this.repo.createRack(dto, actorId, session);
    });
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
    return this.mutateWithRevision(actorId, async (session) => {
      const rack = await this.repo.findRackById(id, session);
      if (!rack) throw new AppException('RACK_NOT_FOUND');
      const zoneId = dto.zoneId ?? rack.zoneId.toString();
      if (dto.zoneId && !(await this.repo.findZoneById(dto.zoneId, session))) {
        throw new AppException('ZONE_NOT_FOUND');
      }
      if (dto.zoneId !== undefined || dto.code !== undefined) {
        const existing = await this.repo.findRackByCode(
          zoneId,
          dto.code ?? rack.code,
          session,
        );
        if (existing && existing._id.toString() !== id)
          throw new AppException('RACK_CODE_EXISTS');
      }
      let doc: RackDocument | null;
      try {
        doc = await this.repo.updateRack(id, dto, actorId, session);
      } catch (error) {
        if (isMongoDuplicateKeyError(error)) {
          throw new AppException('RACK_CODE_EXISTS');
        }
        throw error;
      }
      if (!doc) throw new AppException('RACK_NOT_FOUND');
      return doc;
    });
  }

  async deleteRack(id: string, actorId: string): Promise<void> {
    await this.mutateWithRevision(actorId, async (session) => {
      if (await this.repo.hasShelvesInRack(id, session)) {
        throw new AppException('RACK_HAS_SHELVES');
      }
      const deleted = await this.repo.softDeleteRack(id, actorId, session);
      if (!deleted) throw new AppException('RACK_NOT_FOUND');
      return true;
    });
  }

  // ─── Shelf ────────────────────────────────────────────────────────────────

  async createShelf(
    dto: CreateShelfDto,
    actorId: string,
  ): Promise<ShelfDocument> {
    return this.mutateWithRevision(actorId, async (session) => {
      const rack = await this.repo.findRackById(dto.rackId, session);
      if (!rack) throw new AppException('RACK_NOT_FOUND');
      const existing = await this.repo.findShelfByCode(dto.code, session);
      if (existing) throw new AppException('SHELF_CODE_EXISTS');
      const shelf = await this.repo.createShelf(dto, actorId, session);
      const template = await this.repo.getRackTemplate(session);
      await this.repo.createStorageCellsForShelf(
        shelf,
        template.bayCount,
        actorId,
        session,
      );
      return shelf;
    });
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
    return this.mutateWithRevision(actorId, async (session) => {
      if (dto.rackId && !(await this.repo.findRackById(dto.rackId, session))) {
        throw new AppException('RACK_NOT_FOUND');
      }
      if (dto.code) {
        const existing = await this.repo.findShelfByCode(dto.code, session);
        if (existing && existing._id.toString() !== id)
          throw new AppException('SHELF_CODE_EXISTS');
      }
      const doc = await this.repo.updateShelf(id, dto, actorId, session);
      if (!doc) throw new AppException('SHELF_NOT_FOUND');
      const template = await this.repo.getRackTemplate(session);
      await this.repo.syncStorageCellsForShelf(
        doc,
        template.bayCount,
        actorId,
        session,
      );
      return doc;
    });
  }

  async deleteShelf(id: string, actorId: string): Promise<void> {
    await this.mutateWithRevision(actorId, async (session) => {
      const shelf = await this.repo.findShelfById(id, session);
      if (!shelf) throw new AppException('SHELF_NOT_FOUND');
      if (shelf.isStaging) {
        throw new AppException('STAGING_SHELF_CANNOT_DELETE');
      }
      if (
        await this.stockRepo.hasPositiveInventoryOnShelf(
          new Types.ObjectId(id),
          session,
        )
      ) {
        throw new AppException('SHELF_HAS_STOCK');
      }
      await this.repo.softDeleteStorageCellsForShelf(
        shelf._id,
        actorId,
        session,
      );
      const deleted = await this.repo.softDeleteShelf(id, actorId, session);
      if (!deleted) throw new AppException('SHELF_NOT_FOUND');
      return true;
    });
  }

  /** GRN APPROVED cần shelf staging duy nhất — không có thì chặn approve. */
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
    return this.mutateWithRevision(actorId, async (session) => {
      const current = await this.repo.getRackTemplate(session);
      if (dto.bayCount !== undefined && dto.bayCount < current.bayCount) {
        const removedCells = await this.repo.findCellsAboveBay(
          dto.bayCount,
          session,
        );
        if (
          await this.stockRepo.hasPositiveInventoryOnCells(
            removedCells.map((cell) => cell._id),
            session,
          )
        ) {
          throw new AppException('STORAGE_CELL_HAS_STOCK');
        }
      }
      const updated = await this.repo.updateRackTemplate(dto, actorId, session);
      if (dto.bayCount !== undefined && dto.bayCount !== current.bayCount) {
        await this.repo.reconcileStorageCellBayCount(
          dto.bayCount,
          actorId,
          session,
        );
      }
      return updated;
    });
  }

  // ─── Aisle ────────────────────────────────────────────────────────────────

  async createAisle(
    dto: CreateAisleDto,
    actorId: string,
  ): Promise<AisleDocument> {
    return this.mutateWithRevision(actorId, async (session) => {
      const existing = await this.repo.findAisleByCode(dto.code, session);
      if (existing) throw new AppException('AISLE_CODE_EXISTS');
      return this.repo.createAisle(dto, actorId, session);
    });
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
    return this.mutateWithRevision(actorId, async (session) => {
      if (dto.code) {
        const existing = await this.repo.findAisleByCode(dto.code, session);
        if (existing && existing._id.toString() !== id)
          throw new AppException('AISLE_CODE_EXISTS');
      }
      const doc = await this.repo.updateAisle(id, dto, actorId, session);
      if (!doc) throw new AppException('AISLE_NOT_FOUND');
      return doc;
    });
  }

  async deleteAisle(id: string, actorId: string): Promise<void> {
    await this.mutateWithRevision(actorId, async (session) => {
      const deleted = await this.repo.softDeleteAisle(id, actorId, session);
      if (!deleted) throw new AppException('AISLE_NOT_FOUND');
      return true;
    });
  }

  // ─── Gate ─────────────────────────────────────────────────────────────────

  async createGate(dto: CreateGateDto, actorId: string): Promise<GateDocument> {
    return this.mutateWithRevision(actorId, async (session) => {
      const existing = await this.repo.findGateByCode(dto.code, session);
      if (existing) throw new AppException('GATE_CODE_EXISTS');
      return this.repo.createGate(dto, actorId, session);
    });
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
    return this.mutateWithRevision(actorId, async (session) => {
      if (dto.code) {
        const existing = await this.repo.findGateByCode(dto.code, session);
        if (existing && existing._id.toString() !== id)
          throw new AppException('GATE_CODE_EXISTS');
      }
      const doc = await this.repo.updateGate(id, dto, actorId, session);
      if (!doc) throw new AppException('GATE_NOT_FOUND');
      return doc;
    });
  }

  async deleteGate(id: string, actorId: string): Promise<void> {
    await this.mutateWithRevision(actorId, async (session) => {
      const deleted = await this.repo.softDeleteGate(id, actorId, session);
      if (!deleted) throw new AppException('GATE_NOT_FOUND');
      return true;
    });
  }

  async resetLayout(actorId: string) {
    await this.mutateWithRevision(actorId, async (session) => {
      const shelves = await this.repo.findAllShelves(session);
      const shelfIds = shelves.map((shelf) => shelf._id);
      if (
        await this.stockRepo.hasPositiveInventoryOnAnyShelf(shelfIds, session)
      ) {
        throw new AppException('LAYOUT_RESET_REQUIRES_EMPTY_STOCK');
      }
      await this.repo.softDeleteAllStorageCells(actorId, session);
      await this.repo.softDeleteAllShelves(actorId, session);
      await this.repo.softDeleteAllRacks(actorId, session);
      await this.repo.softDeleteAllZones(actorId, session);
      await this.repo.softDeleteAllAisles(actorId, session);
      await this.repo.softDeleteAllGates(actorId, session);
      return true;
    });

    return this.getLayout();
  }

  // ─── Layout tổng hợp ──────────────────────────────────────────────────────

  /** Snapshot đầy đủ của sơ đồ kho singleton cho editor 2D. */
  async getLayout(): Promise<{
    id: 'single-warehouse-layout';
    revision: number;
    updatedAt: Date;
    canvas: { widthM: number; heightM: number; gridM: number };
    zones: ZoneDocument[];
    racks: RackDocument[];
    shelves: ShelfDocument[];
    aisles: AisleDocument[];
    gates: GateDocument[];
    rackTemplate: RackTemplateDocument;
  }> {
    return this.repo.runInTransaction(async (session) => {
      const zones = await this.repo.findAllZones(session);
      const racks = await this.repo.findAllRacks(session);
      const shelves = await this.repo.findAllShelves(session);
      const aisles = await this.repo.findAllAisles(session);
      const gates = await this.repo.findAllGates(session);
      const rackTemplate = await this.repo.getRackTemplate(session);
      const config = await this.repo.getLayoutConfig(session);
      return {
        id: 'single-warehouse-layout',
        revision: config.revision,
        updatedAt: config.updatedAt,
        canvas: {
          widthM: config.widthM,
          heightM: config.heightM,
          gridM: config.gridM,
        },
        zones,
        racks,
        shelves,
        aisles,
        gates,
        rackTemplate,
      };
    });
  }

  // ─── Shelf contents (rack elevation) ─────────────────────────────────────

  /** Tồn kho thật trong 1 shelf — validate shelf tồn tại trước, dùng cho FE
   * vẽ rack elevation (không suy diễn, đọc thẳng InventoryStock). */
  async getShelfContents(shelfId: string) {
    await this.getShelf(shelfId);
    return this.stockRepo.findInventoryByShelfId(new Types.ObjectId(shelfId));
  }

  async getRackCells(rackId: string) {
    const rack = await this.repo.findRackById(rackId);
    if (!rack) throw new AppException('RACK_NOT_FOUND');
    const cells = await this.repo.findCellsByRackId(rackId);
    return Promise.all(
      cells.map(async (cell) => {
        const contents = await this.stockRepo.findInventoryByCellId(cell._id);
        const usableVolumeCm3 =
          cell.innerDepth *
          cell.innerWidth *
          cell.innerHeight *
          (cell.fillFactor ?? 0.75);
        const occupiedVolumeCm3 = contents.reduce(
          (sum, item) =>
            sum + item.quantity * (item.packageVolumeCm3Snapshot ?? 0),
          0,
        );
        return {
          id: cell._id.toString(),
          rackId: cell.rackId.toString(),
          shelfId: cell.shelfId.toString(),
          level: cell.level,
          bay: cell.bay,
          code: cell.code,
          barcode: cell.barcode,
          status: cell.status,
          innerDepth: cell.innerDepth,
          innerWidth: cell.innerWidth,
          innerHeight: cell.innerHeight,
          usableVolumeCm3,
          occupiedVolumeCm3,
          fillPercent: Math.min(
            100,
            Math.round((occupiedVolumeCm3 / usableVolumeCm3) * 100),
          ),
          contents,
        };
      }),
    );
  }
  async getCellContents(cellId: string) {
    const cell = await this.repo.findCellById(cellId);
    if (!cell) throw new AppException('STORAGE_CELL_NOT_FOUND');
    return this.stockRepo.findInventoryByCellId(new Types.ObjectId(cellId));
  }
}
