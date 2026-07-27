import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Zone, ZoneDocument } from './schemas/zone.schema';
import { Rack, RackDocument } from './schemas/rack.schema';
import { Shelf, ShelfDocument } from './schemas/shelf.schema';
import { Gate, GateDocument } from './schemas/gate.schema';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { CreateRackDto, UpdateRackDto } from './dto/rack.dto';
import { CreateShelfDto, UpdateShelfDto } from './dto/shelf.dto';
import { CreateGateDto, UpdateGateDto } from './dto/gate.dto';

const SOFT_DELETE_FILTER = { deletedAt: null } as const;

@Injectable()
export class LocationRepository {
  constructor(
    @InjectModel(Zone.name) private readonly zoneModel: Model<ZoneDocument>,
    @InjectModel(Rack.name) private readonly rackModel: Model<RackDocument>,
    @InjectModel(Shelf.name) private readonly shelfModel: Model<ShelfDocument>,
    @InjectModel(Gate.name) private readonly gateModel: Model<GateDocument>,
  ) {}

  // ─── Zone ─────────────────────────────────────────────────────────────────

  async createZone(dto: CreateZoneDto, actorId: string): Promise<ZoneDocument> {
    return this.zoneModel.create({
      ...dto,
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findAllZones(): Promise<ZoneDocument[]> {
    return this.zoneModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }).exec();
  }

  async findZoneById(id: string): Promise<ZoneDocument | null> {
    return this.zoneModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }).exec();
  }

  async findZoneByCode(code: string): Promise<ZoneDocument | null> {
    return this.zoneModel.findOne({ code, ...SOFT_DELETE_FILTER }).exec();
  }

  async updateZone(
    id: string,
    dto: UpdateZoneDto,
    actorId: string,
  ): Promise<ZoneDocument | null> {
    return this.zoneModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { ...dto, updatedBy: new Types.ObjectId(actorId) },
        { new: true },
      )
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

  /** Liệt kê shelf ứng viên cho gợi ý put-away: non-staging, chưa xoá, đã khai đủ 3 chiều. */
  async findShelves(): Promise<ShelfDocument[]> {
    return this.shelfModel
      .find({
        isStaging: false,
        deletedAt: null,
        innerDepth: { $exists: true, $ne: null },
        innerWidth: { $exists: true, $ne: null },
        innerHeight: { $exists: true, $ne: null },
      })
      .sort({ code: 1 })
      .exec();
  }

  async findShelfById(id: string): Promise<ShelfDocument | null> {
    return this.shelfModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }).exec();
  }

  async findShelfByCode(code: string): Promise<ShelfDocument | null> {
    return this.shelfModel.findOne({ code, ...SOFT_DELETE_FILTER }).exec();
  }

  /**
   * Danh sách shelfId thuộc 1 zone — join 2 tầng Shelf.rackId → Rack.zoneId
   * (Shelf không denormalize zoneId trực tiếp). Dùng khi StockCountService
   * tạo phiếu giới hạn theo zone (UC-06).
   */
  async findShelfIdsByZone(zoneId: string): Promise<Types.ObjectId[]> {
    const racks = await this.findRacksByZone(zoneId);
    const rackIds = racks.map((r) => r._id.toString());
    const shelvesByRack = await Promise.all(
      rackIds.map((rackId) => this.findShelvesByRack(rackId)),
    );
    return shelvesByRack.flat().map((s) => s._id);
  }

  /** Tìm shelf staging (khu nhận hàng tạm) duy nhất toàn hệ thống — dùng khi GRN CONFIRMED cộng tồn. */
  async findStagingShelf(): Promise<ShelfDocument | null> {
    return this.shelfModel.findOne({ isStaging: true, deletedAt: null }).exec();
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

  // ─── Gate ─────────────────────────────────────────────────────────────────

  async createGate(dto: CreateGateDto, actorId: string): Promise<GateDocument> {
    return this.gateModel.create({
      ...dto,
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findAllGates(): Promise<GateDocument[]> {
    return this.gateModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }).exec();
  }

  async findGateById(id: string): Promise<GateDocument | null> {
    return this.gateModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }).exec();
  }

  async findGateByCode(code: string): Promise<GateDocument | null> {
    return this.gateModel.findOne({ code, ...SOFT_DELETE_FILTER }).exec();
  }

  async updateGate(
    id: string,
    dto: UpdateGateDto,
    actorId: string,
  ): Promise<GateDocument | null> {
    return this.gateModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { ...dto, updatedBy: new Types.ObjectId(actorId) },
        { new: true },
      )
      .exec();
  }

  async softDeleteGate(id: string, actorId: string): Promise<boolean> {
    const res = await this.gateModel
      .updateOne(
        { _id: id, ...SOFT_DELETE_FILTER },
        { deletedAt: new Date(), updatedBy: new Types.ObjectId(actorId) },
      )
      .exec();
    return res.modifiedCount > 0;
  }
}
