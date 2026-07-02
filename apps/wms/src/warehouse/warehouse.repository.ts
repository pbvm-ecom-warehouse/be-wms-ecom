import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Warehouse, WarehouseDocument } from './schemas/warehouse.schema';
import { Zone, ZoneDocument } from './schemas/zone.schema';
import { Rack, RackDocument } from './schemas/rack.schema';
import { Shelf, ShelfDocument } from './schemas/shelf.schema';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { CreateRackDto, UpdateRackDto } from './dto/rack.dto';
import { CreateShelfDto, UpdateShelfDto } from './dto/shelf.dto';

const SOFT_DELETE_FILTER = { deletedAt: null } as const;

@Injectable()
export class WarehouseRepository {
  constructor(
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(Zone.name) private readonly zoneModel: Model<ZoneDocument>,
    @InjectModel(Rack.name) private readonly rackModel: Model<RackDocument>,
    @InjectModel(Shelf.name) private readonly shelfModel: Model<ShelfDocument>,
  ) {}

  // ─── Warehouse ────────────────────────────────────────────────────────────

  async createWarehouse(
    dto: CreateWarehouseDto,
    actorId: string,
  ): Promise<WarehouseDocument> {
    return this.warehouseModel.create({
      ...dto,
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findAllWarehouses(): Promise<WarehouseDocument[]> {
    return this.warehouseModel
      .find(SOFT_DELETE_FILTER)
      .sort({ createdAt: 1 })
      .exec();
  }

  async findWarehouseById(id: string): Promise<WarehouseDocument | null> {
    return this.warehouseModel
      .findOne({ _id: id, ...SOFT_DELETE_FILTER })
      .exec();
  }

  async updateWarehouse(
    id: string,
    dto: UpdateWarehouseDto,
    actorId: string,
  ): Promise<WarehouseDocument | null> {
    return this.warehouseModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { ...dto, updatedBy: new Types.ObjectId(actorId) },
        { new: true },
      )
      .exec();
  }

  async softDeleteWarehouse(id: string, actorId: string): Promise<boolean> {
    const res = await this.warehouseModel
      .updateOne(
        { _id: id, ...SOFT_DELETE_FILTER },
        { deletedAt: new Date(), updatedBy: new Types.ObjectId(actorId) },
      )
      .exec();
    return res.modifiedCount > 0;
  }

  // ─── Zone ─────────────────────────────────────────────────────────────────

  async createZone(dto: CreateZoneDto, actorId: string): Promise<ZoneDocument> {
    return this.zoneModel.create({
      ...dto,
      warehouseId: new Types.ObjectId(dto.warehouseId),
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findZonesByWarehouse(warehouseId: string): Promise<ZoneDocument[]> {
    return this.zoneModel
      .find({
        warehouseId: new Types.ObjectId(warehouseId),
        ...SOFT_DELETE_FILTER,
      })
      .sort({ code: 1 })
      .exec();
  }

  async findZoneById(id: string): Promise<ZoneDocument | null> {
    return this.zoneModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }).exec();
  }

  async findZoneByCode(
    warehouseId: string,
    code: string,
  ): Promise<ZoneDocument | null> {
    return this.zoneModel
      .findOne({
        warehouseId: new Types.ObjectId(warehouseId),
        code,
        ...SOFT_DELETE_FILTER,
      })
      .exec();
  }

  async updateZone(
    id: string,
    dto: UpdateZoneDto,
    actorId: string,
  ): Promise<ZoneDocument | null> {
    const update: Record<string, unknown> = {
      ...dto,
      updatedBy: new Types.ObjectId(actorId),
    };
    if (dto.warehouseId)
      update['warehouseId'] = new Types.ObjectId(dto.warehouseId);
    return this.zoneModel
      .findOneAndUpdate({ _id: id, ...SOFT_DELETE_FILTER }, update, {
        new: true,
      })
      .exec();
  }

  async softDeleteZone(id: string, actorId: string): Promise<boolean> {
    const res = await this.zoneModel
      .updateOne(
        { _id: id, ...SOFT_DELETE_FILTER },
        { deletedAt: new Date(), updatedBy: new Types.ObjectId(actorId) },
      )
      .exec();
    return res.modifiedCount > 0;
  }

  // ─── Rack ─────────────────────────────────────────────────────────────────

  async createRack(dto: CreateRackDto, actorId: string): Promise<RackDocument> {
    return this.rackModel.create({
      ...dto,
      zoneId: new Types.ObjectId(dto.zoneId),
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findRacksByZone(zoneId: string): Promise<RackDocument[]> {
    return this.rackModel
      .find({ zoneId: new Types.ObjectId(zoneId), ...SOFT_DELETE_FILTER })
      .sort({ code: 1 })
      .exec();
  }

  async findRackById(id: string): Promise<RackDocument | null> {
    return this.rackModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }).exec();
  }

  async findRackByCode(
    zoneId: string,
    code: string,
  ): Promise<RackDocument | null> {
    return this.rackModel
      .findOne({
        zoneId: new Types.ObjectId(zoneId),
        code,
        ...SOFT_DELETE_FILTER,
      })
      .exec();
  }

  async updateRack(
    id: string,
    dto: UpdateRackDto,
    actorId: string,
  ): Promise<RackDocument | null> {
    const update: Record<string, unknown> = {
      ...dto,
      updatedBy: new Types.ObjectId(actorId),
    };
    if (dto.zoneId) update['zoneId'] = new Types.ObjectId(dto.zoneId);
    return this.rackModel
      .findOneAndUpdate({ _id: id, ...SOFT_DELETE_FILTER }, update, {
        new: true,
      })
      .exec();
  }

  async softDeleteRack(id: string, actorId: string): Promise<boolean> {
    const res = await this.rackModel
      .updateOne(
        { _id: id, ...SOFT_DELETE_FILTER },
        { deletedAt: new Date(), updatedBy: new Types.ObjectId(actorId) },
      )
      .exec();
    return res.modifiedCount > 0;
  }

  // ─── Shelf ────────────────────────────────────────────────────────────────

  async createShelf(
    dto: CreateShelfDto,
    actorId: string,
  ): Promise<ShelfDocument> {
    return this.shelfModel.create({
      ...dto,
      rackId: new Types.ObjectId(dto.rackId),
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findShelvesByRack(rackId: string): Promise<ShelfDocument[]> {
    return this.shelfModel
      .find({ rackId: new Types.ObjectId(rackId), ...SOFT_DELETE_FILTER })
      .sort({ level: 1 })
      .exec();
  }

  async findShelfById(id: string): Promise<ShelfDocument | null> {
    return this.shelfModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }).exec();
  }

  async findShelfByCode(code: string): Promise<ShelfDocument | null> {
    return this.shelfModel.findOne({ code, ...SOFT_DELETE_FILTER }).exec();
  }

  async updateShelf(
    id: string,
    dto: UpdateShelfDto,
    actorId: string,
  ): Promise<ShelfDocument | null> {
    const update: Record<string, unknown> = {
      ...dto,
      updatedBy: new Types.ObjectId(actorId),
    };
    if (dto.rackId) update['rackId'] = new Types.ObjectId(dto.rackId);
    return this.shelfModel
      .findOneAndUpdate({ _id: id, ...SOFT_DELETE_FILTER }, update, {
        new: true,
      })
      .exec();
  }

  async softDeleteShelf(id: string, actorId: string): Promise<boolean> {
    const res = await this.shelfModel
      .updateOne(
        { _id: id, ...SOFT_DELETE_FILTER },
        { deletedAt: new Date(), updatedBy: new Types.ObjectId(actorId) },
      )
      .exec();
    return res.modifiedCount > 0;
  }
}
