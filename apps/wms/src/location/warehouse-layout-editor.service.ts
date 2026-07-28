import { HttpStatus, Injectable } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ClientSession, Types } from 'mongoose';
import { AppException } from '@app/common/errors/app.exception';
import { StockRepository } from '../stock/stock.repository';
import {
  CanvasPatchDto,
  LayoutEntity,
  LayoutOperation,
  type SaveWarehouseLayoutDto,
  type WarehouseLayoutOperationDto,
} from './dto/layout-change.dto';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { CreateRackDto, UpdateRackDto } from './dto/rack.dto';
import { CreateShelfDto, UpdateShelfDto } from './dto/shelf.dto';
import { CreateAisleDto, UpdateAisleDto } from './dto/aisle.dto';
import { CreateGateDto, UpdateGateDto } from './dto/gate.dto';
import { UpdateRackTemplateDto } from './dto/rack-template.dto';
import type { ShelfDocument } from './schemas/shelf.schema';
import { LocationRepository } from './location.repository';
import {
  validateWarehouseLayoutGeometry,
  type WarehouseLayoutValidationIssue,
} from './warehouse-layout.validator';

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

export interface SavedWarehouseLayout {
  id: 'single-warehouse-layout';
  revision: number;
  updatedAt: Date;
  canvas: { widthM: number; heightM: number; gridM: number };
  rackTemplate: unknown;
  zones: unknown[];
  racks: unknown[];
  shelves: unknown[];
  aisles: unknown[];
  gates: unknown[];
}

export interface SaveWarehouseLayoutResult {
  revision: number;
  idMap: Record<string, string>;
  layout: SavedWarehouseLayout;
}

@Injectable()
export class WarehouseLayoutEditorService {
  constructor(
    private readonly repo: LocationRepository,
    private readonly stockRepo: StockRepository,
  ) {}

  async saveLayout(
    dto: SaveWarehouseLayoutDto,
    actorId: string,
  ): Promise<SaveWarehouseLayoutResult> {
    return this.repo.runInTransaction(async (session) => {
      const initialConfig = await this.repo.getLayoutConfig(session);
      if (initialConfig.revision !== dto.expectedRevision) {
        throw new AppException(
          'LAYOUT_REVISION_CONFLICT',
          undefined,
          HttpStatus.CONFLICT,
          {
            expectedRevision: dto.expectedRevision,
            currentRevision: initialConfig.revision,
          },
        );
      }

      const idMap: Record<string, string> = {};
      await this.assertNoInitiallyStagingShelfIsDeleted(
        dto.operations,
        session,
      );
      for (const operation of dto.operations) {
        await this.applyOperation(operation, actorId, session, idMap);
      }

      const snapshot = await this.loadSnapshot(session);
      const stagingRackIds = new Set(
        (snapshot.shelves as ShelfDocument[])
          .filter((shelf) => shelf.isStaging)
          .map((shelf) => shelf.rackId.toString()),
      );
      if (stagingRackIds.size > 1) {
        throw new AppException('STAGING_SHELVES_MUST_SHARE_RACK');
      }
      const issues = this.mapCreatedEntityIssuesToClientIds(
        validateWarehouseLayoutGeometry(snapshot),
        idMap,
      );
      if (issues.length > 0) {
        throw new AppException(
          'LAYOUT_VALIDATION_FAILED',
          undefined,
          HttpStatus.UNPROCESSABLE_ENTITY,
          { issues },
        );
      }

      const config = await this.repo.incrementLayoutRevision(actorId, session);
      const layout: SavedWarehouseLayout = {
        id: 'single-warehouse-layout',
        revision: config.revision,
        updatedAt: config.updatedAt,
        canvas: {
          widthM: config.widthM,
          heightM: config.heightM,
          gridM: config.gridM,
        },
        rackTemplate: snapshot.rackTemplate,
        zones: snapshot.zones,
        racks: snapshot.racks,
        shelves: snapshot.shelves,
        aisles: snapshot.aisles,
        gates: snapshot.gates,
      };
      return { revision: config.revision, idMap, layout };
    });
  }

  private async applyOperation(
    operation: WarehouseLayoutOperationDto,
    actorId: string,
    session: ClientSession,
    idMap: Record<string, string>,
  ) {
    if (operation.op === LayoutOperation.CREATE) {
      await this.applyCreate(operation, actorId, session, idMap);
      return;
    }
    if (operation.op === LayoutOperation.UPDATE) {
      await this.applyUpdate(operation, actorId, session, idMap);
      return;
    }
    if (operation.op === LayoutOperation.DELETE) {
      await this.applyDelete(operation, actorId, session);
      return;
    }
    throw new AppException('VALIDATION_FAILED');
  }

  private async applyCreate(
    operation: WarehouseLayoutOperationDto,
    actorId: string,
    session: ClientSession,
    idMap: Record<string, string>,
  ) {
    if (!operation.clientId || !operation.data) {
      throw new AppException('VALIDATION_FAILED');
    }
    if (idMap[operation.clientId]) {
      throw new AppException('LAYOUT_DUPLICATE_CLIENT_ID');
    }

    let created: { _id: Types.ObjectId };
    switch (operation.entity) {
      case LayoutEntity.ZONE: {
        const data = this.parseDto(
          CreateZoneDto,
          operation.data,
          LayoutEntity.ZONE,
        );
        if (await this.repo.findZoneByCode(data.code, session)) {
          throw new AppException('ZONE_CODE_EXISTS');
        }
        created = await this.repo.createZone(data, actorId, session);
        break;
      }
      case LayoutEntity.RACK: {
        const data = this.parseDto(
          CreateRackDto,
          {
            ...operation.data,
            zoneId: this.resolveReference(operation.data['zoneId'], idMap),
          },
          LayoutEntity.RACK,
        );
        if (!(await this.repo.findZoneById(data.zoneId, session))) {
          throw new AppException('ZONE_NOT_FOUND');
        }
        if (await this.repo.findRackByCode(data.zoneId, data.code, session)) {
          throw new AppException('RACK_CODE_EXISTS');
        }
        created = await this.repo.createRack(data, actorId, session);
        break;
      }
      case LayoutEntity.SHELF: {
        const data = this.parseDto(
          CreateShelfDto,
          {
            ...operation.data,
            rackId: this.resolveReference(operation.data['rackId'], idMap),
          },
          LayoutEntity.SHELF,
        );
        if (!(await this.repo.findRackById(data.rackId, session))) {
          throw new AppException('RACK_NOT_FOUND');
        }
        if (await this.repo.findShelfByCode(data.code, session)) {
          throw new AppException('SHELF_CODE_EXISTS');
        }
        created = await this.repo.createShelf(data, actorId, session);
        const template = await this.repo.getRackTemplate(session);
        await this.repo.createStorageCellsForShelf(
          created as ShelfDocument,
          template.bayCount,
          actorId,
          session,
        );
        break;
      }
      case LayoutEntity.AISLE: {
        const data = this.parseDto(
          CreateAisleDto,
          operation.data,
          LayoutEntity.AISLE,
        );
        if (await this.repo.findAisleByCode(data.code, session)) {
          throw new AppException('AISLE_CODE_EXISTS');
        }
        created = await this.repo.createAisle(data, actorId, session);
        break;
      }
      case LayoutEntity.GATE: {
        const data = this.parseDto(
          CreateGateDto,
          operation.data,
          LayoutEntity.GATE,
        );
        if (await this.repo.findGateByCode(data.code, session)) {
          throw new AppException('GATE_CODE_EXISTS');
        }
        created = await this.repo.createGate(data, actorId, session);
        break;
      }
      default:
        throw new AppException('LAYOUT_OPERATION_NOT_ALLOWED');
    }
    idMap[operation.clientId] = created._id.toString();
  }

  private async applyUpdate(
    operation: WarehouseLayoutOperationDto,
    actorId: string,
    session: ClientSession,
    idMap: Record<string, string>,
  ) {
    if (!operation.patch) throw new AppException('VALIDATION_FAILED');

    if (operation.entity === LayoutEntity.CANVAS) {
      const patch = this.parseDto(
        CanvasPatchDto,
        operation.patch,
        LayoutEntity.CANVAS,
      );
      await this.repo.updateLayoutConfig(patch, actorId, session);
      return;
    }
    if (operation.entity === LayoutEntity.RACK_TEMPLATE) {
      const current = await this.repo.getRackTemplate(session);
      const patch = this.parseDto(
        UpdateRackTemplateDto,
        {
          widthM: current.widthM,
          depthM: current.depthM,
          levelCount: current.levelCount,
          bayCount: current.bayCount,
          ...operation.patch,
        },
        LayoutEntity.RACK_TEMPLATE,
      );
      if (patch.bayCount < current.bayCount) {
        const removedCells = await this.repo.findCellsAboveBay(
          patch.bayCount,
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
      await this.repo.updateRackTemplate(patch, actorId, session);
      if (patch.bayCount !== current.bayCount) {
        await this.repo.reconcileStorageCellBayCount(
          patch.bayCount,
          actorId,
          session,
        );
      }
      return;
    }

    const id = this.requireObjectId(operation.id);
    switch (operation.entity) {
      case LayoutEntity.ZONE: {
        const patch = this.parseDto(
          UpdateZoneDto,
          operation.patch,
          LayoutEntity.ZONE,
        );
        if (patch.code) {
          const duplicate = await this.repo.findZoneByCode(patch.code, session);
          if (duplicate && duplicate._id.toString() !== id) {
            throw new AppException('ZONE_CODE_EXISTS');
          }
        }
        if (!(await this.repo.updateZone(id, patch, actorId, session))) {
          throw new AppException('ZONE_NOT_FOUND');
        }
        return;
      }
      case LayoutEntity.RACK: {
        const normalized = {
          ...operation.patch,
          ...(operation.patch['zoneId'] !== undefined
            ? {
                zoneId: this.resolveReference(operation.patch['zoneId'], idMap),
              }
            : {}),
        };
        const patch = this.parseDto(
          UpdateRackDto,
          normalized,
          LayoutEntity.RACK,
        );
        const current = await this.repo.findRackById(id, session);
        if (!current) throw new AppException('RACK_NOT_FOUND');
        const zoneId = patch.zoneId ?? current.zoneId.toString();
        if (!(await this.repo.findZoneById(zoneId, session))) {
          throw new AppException('ZONE_NOT_FOUND');
        }
        if (patch.zoneId !== undefined || patch.code !== undefined) {
          const duplicate = await this.repo.findRackByCode(
            zoneId,
            patch.code ?? current.code,
            session,
          );
          if (duplicate && duplicate._id.toString() !== id) {
            throw new AppException('RACK_CODE_EXISTS');
          }
        }
        let updated;
        try {
          updated = await this.repo.updateRack(id, patch, actorId, session);
        } catch (error) {
          if (isMongoDuplicateKeyError(error)) {
            throw new AppException('RACK_CODE_EXISTS');
          }
          throw error;
        }
        if (!updated) {
          throw new AppException('RACK_NOT_FOUND');
        }
        return;
      }
      case LayoutEntity.SHELF: {
        const normalized = {
          ...operation.patch,
          ...(operation.patch['rackId'] !== undefined
            ? {
                rackId: this.resolveReference(operation.patch['rackId'], idMap),
              }
            : {}),
        };
        const patch = this.parseDto(
          UpdateShelfDto,
          normalized,
          LayoutEntity.SHELF,
        );
        if (
          patch.rackId &&
          !(await this.repo.findRackById(patch.rackId, session))
        ) {
          throw new AppException('RACK_NOT_FOUND');
        }
        if (patch.code) {
          const duplicate = await this.repo.findShelfByCode(
            patch.code,
            session,
          );
          if (duplicate && duplicate._id.toString() !== id) {
            throw new AppException('SHELF_CODE_EXISTS');
          }
        }
        const current = await this.repo.findShelfById(id, session);
        if (!current) throw new AppException('SHELF_NOT_FOUND');
        const updated = await this.repo.updateShelf(
          id,
          patch,
          actorId,
          session,
        );
        if (!updated) throw new AppException('SHELF_NOT_FOUND');
        const template = await this.repo.getRackTemplate(session);
        if (!current.isStaging && updated.isStaging) {
          const cells = await this.repo.findCellsByShelfId(
            current._id,
            session,
          );
          if (
            await this.stockRepo.hasPositiveInventoryOnCells(
              cells.map((cell) => cell._id),
              session,
            )
          ) {
            throw new AppException('STORAGE_CELL_HAS_STOCK');
          }
          await this.repo.softDeleteStorageCellsForShelf(
            current._id,
            actorId,
            session,
          );
        } else if (current.isStaging && !updated.isStaging) {
          await this.repo.createStorageCellsForShelf(
            updated,
            template.bayCount,
            actorId,
            session,
          );
        } else {
          await this.repo.syncStorageCellsForShelf(
            updated,
            template.bayCount,
            actorId,
            session,
          );
        }
        return;
      }
      case LayoutEntity.AISLE: {
        const patch = this.parseDto(
          UpdateAisleDto,
          operation.patch,
          LayoutEntity.AISLE,
        );
        if (patch.code) {
          const duplicate = await this.repo.findAisleByCode(
            patch.code,
            session,
          );
          if (duplicate && duplicate._id.toString() !== id) {
            throw new AppException('AISLE_CODE_EXISTS');
          }
        }
        if (!(await this.repo.updateAisle(id, patch, actorId, session))) {
          throw new AppException('AISLE_NOT_FOUND');
        }
        return;
      }
      case LayoutEntity.GATE: {
        const patch = this.parseDto(
          UpdateGateDto,
          operation.patch,
          LayoutEntity.GATE,
        );
        if (patch.code) {
          const duplicate = await this.repo.findGateByCode(patch.code, session);
          if (duplicate && duplicate._id.toString() !== id) {
            throw new AppException('GATE_CODE_EXISTS');
          }
        }
        if (!(await this.repo.updateGate(id, patch, actorId, session))) {
          throw new AppException('GATE_NOT_FOUND');
        }
        return;
      }
      default:
        throw new AppException('LAYOUT_OPERATION_NOT_ALLOWED');
    }
  }

  private async applyDelete(
    operation: WarehouseLayoutOperationDto,
    actorId: string,
    session: ClientSession,
  ) {
    const id = this.requireObjectId(operation.id);
    switch (operation.entity) {
      case LayoutEntity.ZONE:
        if (await this.repo.hasRacksInZone(id, session)) {
          throw new AppException('ZONE_HAS_RACKS');
        }
        if (!(await this.repo.softDeleteZone(id, actorId, session))) {
          throw new AppException('ZONE_NOT_FOUND');
        }
        return;
      case LayoutEntity.RACK:
        if (await this.repo.hasShelvesInRack(id, session)) {
          throw new AppException('RACK_HAS_SHELVES');
        }
        if (!(await this.repo.softDeleteRack(id, actorId, session))) {
          throw new AppException('RACK_NOT_FOUND');
        }
        return;
      case LayoutEntity.SHELF: {
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
        if (!(await this.repo.softDeleteShelf(id, actorId, session))) {
          throw new AppException('SHELF_NOT_FOUND');
        }
        return;
      }
      case LayoutEntity.AISLE:
        if (!(await this.repo.softDeleteAisle(id, actorId, session))) {
          throw new AppException('AISLE_NOT_FOUND');
        }
        return;
      case LayoutEntity.GATE:
        if (!(await this.repo.softDeleteGate(id, actorId, session))) {
          throw new AppException('GATE_NOT_FOUND');
        }
        return;
      default:
        throw new AppException('LAYOUT_OPERATION_NOT_ALLOWED');
    }
  }

  private async loadSnapshot(session: ClientSession) {
    const config = await this.repo.getLayoutConfig(session);
    const rackTemplate = await this.repo.getRackTemplate(session);
    const zones = await this.repo.findAllZones(session);
    const racks = await this.repo.findAllRacks(session);
    const shelves = await this.repo.findAllShelves(session);
    const aisles = await this.repo.findAllAisles(session);
    const gates = await this.repo.findAllGates(session);
    return {
      canvas: {
        widthM: config.widthM,
        heightM: config.heightM,
        gridM: config.gridM,
      },
      rackTemplate,
      zones,
      racks,
      shelves,
      aisles,
      gates,
    };
  }

  private async assertNoInitiallyStagingShelfIsDeleted(
    operations: WarehouseLayoutOperationDto[],
    session: ClientSession,
  ): Promise<void> {
    const shelfIds = new Set(
      operations
        .filter(
          (operation) =>
            operation.op === LayoutOperation.DELETE &&
            operation.entity === LayoutEntity.SHELF,
        )
        .map((operation) => this.requireObjectId(operation.id)),
    );
    for (const shelfId of shelfIds) {
      const shelf = await this.repo.findShelfById(shelfId, session);
      if (shelf?.isStaging) {
        throw new AppException('STAGING_SHELF_CANNOT_DELETE');
      }
    }
  }

  private mapCreatedEntityIssuesToClientIds(
    issues: WarehouseLayoutValidationIssue[],
    idMap: Record<string, string>,
  ): WarehouseLayoutValidationIssue[] {
    const clientIdById = new Map(
      Object.entries(idMap).map(([clientId, id]) => [id, clientId]),
    );
    return issues.map((issue) => {
      const clientId = issue.id ? clientIdById.get(issue.id) : undefined;
      if (!clientId) return issue;
      const mappedIssue = { ...issue, clientId };
      delete mappedIssue.id;
      return mappedIssue;
    });
  }

  private parseDto<T extends object>(
    dtoClass: ClassConstructor<T>,
    payload: Record<string, unknown>,
    entity: WarehouseLayoutValidationIssue['entity'],
  ): T {
    const dto = plainToInstance(dtoClass, payload);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length > 0) {
      const issues: WarehouseLayoutValidationIssue[] = errors.map((error) => ({
        entity,
        field: error.property,
        code: Object.keys(error.constraints ?? {})[0] ?? 'INVALID_VALUE',
      }));
      throw new AppException(
        'VALIDATION_FAILED',
        undefined,
        HttpStatus.BAD_REQUEST,
        { issues },
      );
    }
    return dto;
  }

  private resolveReference(
    value: unknown,
    idMap: Record<string, string>,
  ): string {
    if (typeof value !== 'string') throw new AppException('VALIDATION_FAILED');
    if (value.startsWith('tmp:')) {
      const resolved = idMap[value];
      if (!resolved) throw new AppException('LAYOUT_INVALID_REFERENCE');
      return resolved;
    }
    return this.requireObjectId(value);
  }

  private requireObjectId(value: unknown): string {
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
      throw new AppException('VALIDATION_FAILED');
    }
    return value;
  }
}
