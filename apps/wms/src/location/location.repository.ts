import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Zone, ZoneDocument } from './schemas/zone.schema';
import { Rack, RackDocument } from './schemas/rack.schema';
import { Shelf, ShelfDocument } from './schemas/shelf.schema';
import {
  RackTemplate,
  RackTemplateDocument,
} from './schemas/rack-template.schema';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { CreateRackDto, UpdateRackDto } from './dto/rack.dto';
import { CreateShelfDto, UpdateShelfDto } from './dto/shelf.dto';
import { UpdateRackTemplateDto } from './dto/rack-template.dto';
import { Aisle, AisleDocument } from './schemas/aisle.schema';
import { CreateAisleDto, UpdateAisleDto } from './dto/aisle.dto';
import { Gate, GateDocument } from './schemas/gate.schema';
import { CreateGateDto, UpdateGateDto } from './dto/gate.dto';
import {
  WarehouseLayoutConfig,
  WarehouseLayoutConfigDocument,
} from './schemas/warehouse-layout-config.schema';

const SOFT_DELETE_FILTER = { deletedAt: null } as const;

@Injectable()
export class LocationRepository {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Zone.name) private readonly zoneModel: Model<ZoneDocument>,
    @InjectModel(Rack.name) private readonly rackModel: Model<RackDocument>,
    @InjectModel(Shelf.name) private readonly shelfModel: Model<ShelfDocument>,
    @InjectModel(RackTemplate.name)
    private readonly rackTemplateModel: Model<RackTemplateDocument>,
    @InjectModel(Aisle.name) private readonly aisleModel: Model<AisleDocument>,
    @InjectModel(Gate.name) private readonly gateModel: Model<GateDocument>,
    @InjectModel(WarehouseLayoutConfig.name)
    private readonly layoutConfigModel: Model<WarehouseLayoutConfigDocument>,
  ) {}

  private withSession<T>(query: T, session?: ClientSession): T {
    if (session) {
      (query as T & { session(activeSession: ClientSession): T }).session(
        session,
      );
    }
    return query;
  }

  async runInTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    let completed = false;
    let result!: T;
    try {
      await session.withTransaction(async () => {
        result = await work(session);
        completed = true;
      });
      if (!completed) throw new Error('LOCATION_TRANSACTION_NOT_COMPLETED');
      return result;
    } finally {
      await session.endSession();
    }
  }

  // ─── WarehouseLayoutConfig (singleton) ───────────────────────────────────

  async getLayoutConfig(
    session?: ClientSession,
  ): Promise<WarehouseLayoutConfigDocument> {
    const query = this.layoutConfigModel.findOne({ key: 'SINGLETON' });
    if (session) query.session(session);
    const existing = await query.exec();
    if (existing) return existing;

    const options = session
      ? { new: true, upsert: true, session }
      : { new: true, upsert: true };
    const created = await this.layoutConfigModel
      .findOneAndUpdate(
        { key: 'SINGLETON' },
        {
          $setOnInsert: {
            key: 'SINGLETON',
            widthM: 40,
            heightM: 24,
            gridM: 0.5,
            revision: 1,
          },
        },
        options,
      )
      .exec();
    if (!created) throw new Error('WAREHOUSE_LAYOUT_CONFIG_INIT_FAILED');
    return created;
  }

  async updateLayoutConfig(
    patch: { widthM?: number; heightM?: number; gridM?: number },
    actorId: string,
    session?: ClientSession,
  ): Promise<WarehouseLayoutConfigDocument> {
    await this.getLayoutConfig(session);
    const updated = await this.layoutConfigModel
      .findOneAndUpdate(
        { key: 'SINGLETON' },
        {
          $set: {
            ...patch,
            updatedBy: new Types.ObjectId(actorId),
          },
        },
        { new: true, ...(session ? { session } : {}) },
      )
      .exec();
    if (!updated) throw new Error('WAREHOUSE_LAYOUT_CONFIG_NOT_FOUND');
    return updated;
  }
  async incrementLayoutRevision(
    actorId: string,
    session?: ClientSession,
  ): Promise<WarehouseLayoutConfigDocument> {
    await this.getLayoutConfig(session);
    const options = session ? { new: true, session } : { new: true };
    const updated = await this.layoutConfigModel
      .findOneAndUpdate(
        { key: 'SINGLETON' },
        {
          $inc: { revision: 1 },
          $set: { updatedBy: new Types.ObjectId(actorId) },
        },
        options,
      )
      .exec();
    if (!updated) throw new Error('WAREHOUSE_LAYOUT_CONFIG_NOT_FOUND');
    return updated;
  }

  // ─── Zone ─────────────────────────────────────────────────────────────────

  async createZone(
    dto: CreateZoneDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<ZoneDocument> {
    const data = {
      ...dto,
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    };
    if (!session) return this.zoneModel.create(data);
    const [doc] = await this.zoneModel.create([data], { session });
    return doc;
  }

  async findAllZones(session?: ClientSession): Promise<ZoneDocument[]> {
    return this.withSession(
      this.zoneModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }),
      session,
    ).exec();
  }

  async findZoneById(
    id: string,
    session?: ClientSession,
  ): Promise<ZoneDocument | null> {
    return this.withSession(
      this.zoneModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }),
      session,
    ).exec();
  }

  async findZoneByCode(
    code: string,
    session?: ClientSession,
  ): Promise<ZoneDocument | null> {
    return this.withSession(
      this.zoneModel.findOne({ code, ...SOFT_DELETE_FILTER }),
      session,
    ).exec();
  }

  async updateZone(
    id: string,
    dto: UpdateZoneDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<ZoneDocument | null> {
    return this.zoneModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { ...dto, updatedBy: new Types.ObjectId(actorId) },
        { new: true, ...(session ? { session } : {}) },
      )
      .exec();
  }

  async softDeleteZone(
    id: string,
    actorId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const filter = { _id: id, ...SOFT_DELETE_FILTER };
    const update = {
      deletedAt: new Date(),
      updatedBy: new Types.ObjectId(actorId),
    };
    const query = session
      ? this.zoneModel.updateOne(filter, update, { session })
      : this.zoneModel.updateOne(filter, update);
    const res = await query.exec();
    return res.modifiedCount > 0;
  }

  // ─── Rack ─────────────────────────────────────────────────────────────────

  async createRack(
    dto: CreateRackDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<RackDocument> {
    const data = {
      ...dto,
      zoneId: new Types.ObjectId(dto.zoneId),
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    };
    if (!session) return this.rackModel.create(data);
    const [doc] = await this.rackModel.create([data], { session });
    return doc;
  }

  async findRacksByZone(
    zoneId: string,
    session?: ClientSession,
  ): Promise<RackDocument[]> {
    return this.withSession(
      this.rackModel
        .find({ zoneId: new Types.ObjectId(zoneId), ...SOFT_DELETE_FILTER })
        .sort({ code: 1 }),
      session,
    ).exec();
  }

  /** Toàn bộ rack chưa xoá, không lọc theo zone — dùng ráp layout tổng thể. */

  async findAllRacks(session?: ClientSession): Promise<RackDocument[]> {
    return this.withSession(
      this.rackModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }),
      session,
    ).exec();
  }

  async hasRacksInZone(
    zoneId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const rack = await this.withSession(
      this.rackModel
        .findOne({ zoneId: new Types.ObjectId(zoneId), ...SOFT_DELETE_FILTER })
        .select('_id')
        .lean(),
      session,
    ).exec();
    return rack !== null;
  }

  async findRackById(
    id: string,
    session?: ClientSession,
  ): Promise<RackDocument | null> {
    return this.withSession(
      this.rackModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }),
      session,
    ).exec();
  }

  async findRackByCode(
    zoneId: string,
    code: string,
    session?: ClientSession,
  ): Promise<RackDocument | null> {
    return this.withSession(
      this.rackModel.findOne({
        zoneId: new Types.ObjectId(zoneId),
        code,
        ...SOFT_DELETE_FILTER,
      }),
      session,
    ).exec();
  }

  async updateRack(
    id: string,
    dto: UpdateRackDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<RackDocument | null> {
    const update: Record<string, unknown> = {
      ...dto,
      updatedBy: new Types.ObjectId(actorId),
    };
    if (dto.zoneId) update['zoneId'] = new Types.ObjectId(dto.zoneId);
    return this.rackModel
      .findOneAndUpdate({ _id: id, ...SOFT_DELETE_FILTER }, update, {
        new: true,
        ...(session ? { session } : {}),
      })
      .exec();
  }

  async softDeleteRack(
    id: string,
    actorId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const filter = { _id: id, ...SOFT_DELETE_FILTER };
    const update = {
      deletedAt: new Date(),
      updatedBy: new Types.ObjectId(actorId),
    };
    const query = session
      ? this.rackModel.updateOne(filter, update, { session })
      : this.rackModel.updateOne(filter, update);
    const res = await query.exec();
    return res.modifiedCount > 0;
  }

  // ─── Shelf ────────────────────────────────────────────────────────────────

  async createShelf(
    dto: CreateShelfDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<ShelfDocument> {
    const data = {
      ...dto,
      rackId: new Types.ObjectId(dto.rackId),
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    };
    if (!session) return this.shelfModel.create(data);
    const [doc] = await this.shelfModel.create([data], { session });
    return doc;
  }

  async findShelvesByRack(
    rackId: string,
    session?: ClientSession,
  ): Promise<ShelfDocument[]> {
    return this.withSession(
      this.shelfModel
        .find({ rackId: new Types.ObjectId(rackId), ...SOFT_DELETE_FILTER })
        .sort({ level: 1 }),
      session,
    ).exec();
  }

  async findAllShelves(session?: ClientSession): Promise<ShelfDocument[]> {
    return this.withSession(
      this.shelfModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }),
      session,
    ).exec();
  }

  async hasShelvesInRack(
    rackId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const shelf = await this.withSession(
      this.shelfModel
        .findOne({ rackId: new Types.ObjectId(rackId), ...SOFT_DELETE_FILTER })
        .select('_id')
        .lean(),
      session,
    ).exec();
    return shelf !== null;
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

  /**
   * Map shelfId → toạ độ tâm rack chứa nó (mét) — dùng tính khoảng cách
   * trong weighted put-away suggestion. Kích thước rack lấy từ RackTemplate
   * dùng chung (mọi rack cùng kích thước) — không đọc trên từng Rack nữa.
   * Rack chưa từng set toạ độ (xM/yM=0 mặc định) vẫn trả về entry hợp lệ —
   * caller không cần phân biệt, chấp nhận được vì MANAGER sẽ set toạ độ
   * thật qua UI map trước khi dùng suggestion.
   */
  async findRackCentersByShelfId(
    shelfIds: Types.ObjectId[],
  ): Promise<Map<string, { xM: number; yM: number }>> {
    const shelves = await this.shelfModel
      .find({ _id: { $in: shelfIds }, ...SOFT_DELETE_FILTER })
      .select('_id rackId')
      .lean()
      .exec();
    const rackIds = [...new Set(shelves.map((s) => s.rackId.toString()))].map(
      (id) => new Types.ObjectId(id),
    );
    const [racks, template] = await Promise.all([
      this.rackModel
        .find({ _id: { $in: rackIds }, ...SOFT_DELETE_FILTER })
        .select('_id xM yM')
        .lean()
        .exec(),
      this.getRackTemplate(),
    ]);
    const rackCenterById = new Map(
      racks.map((r) => [
        r._id.toString(),
        { xM: r.xM + template.widthM / 2, yM: r.yM + template.depthM / 2 },
      ]),
    );
    const result = new Map<string, { xM: number; yM: number }>();
    for (const shelf of shelves) {
      const center = rackCenterById.get(shelf.rackId.toString());
      if (center) result.set(shelf._id.toString(), center);
    }
    return result;
  }

  async findShelfById(
    id: string,
    session?: ClientSession,
  ): Promise<ShelfDocument | null> {
    return this.withSession(
      this.shelfModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }),
      session,
    ).exec();
  }

  /**
   * Serialize inventory placement with shelf soft-delete by writing the same
   * active shelf document inside the caller's transaction.
   */
  async lockActiveShelfForInventory(
    id: string,
    session: ClientSession,
  ): Promise<ShelfDocument | null> {
    return this.shelfModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { $set: { updatedAt: new Date() } },
        { new: true, session },
      )
      .exec();
  }

  async findShelfByCode(
    code: string,
    session?: ClientSession,
  ): Promise<ShelfDocument | null> {
    return this.withSession(
      this.shelfModel.findOne({ code, ...SOFT_DELETE_FILTER }),
      session,
    ).exec();
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
    session?: ClientSession,
  ): Promise<ShelfDocument | null> {
    const update: Record<string, unknown> = {
      ...dto,
      updatedBy: new Types.ObjectId(actorId),
    };
    if (dto.rackId) update['rackId'] = new Types.ObjectId(dto.rackId);
    return this.shelfModel
      .findOneAndUpdate({ _id: id, ...SOFT_DELETE_FILTER }, update, {
        new: true,
        ...(session ? { session } : {}),
      })
      .exec();
  }

  async softDeleteShelf(
    id: string,
    actorId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const filter = { _id: id, ...SOFT_DELETE_FILTER };
    const update = {
      deletedAt: new Date(),
      updatedBy: new Types.ObjectId(actorId),
    };
    const query = session
      ? this.shelfModel.updateOne(filter, update, { session })
      : this.shelfModel.updateOne(filter, update);
    const res = await query.exec();
    return res.modifiedCount > 0;
  }

  // ─── RackTemplate (singleton) ────────────────────────────────────────────

  /** Lazy init: tạo bản ghi mặc định nếu collection rỗng — tránh cần seed script riêng. */
  async getRackTemplate(
    session?: ClientSession,
  ): Promise<RackTemplateDocument> {
    const query = this.rackTemplateModel.findOne();
    if (session) query.session(session);
    const existing = await query.exec();
    if (existing) return existing;
    if (!session) return this.rackTemplateModel.create({});
    const [created] = await this.rackTemplateModel.create([{}], { session });
    return created;
  }

  async updateRackTemplate(
    dto: UpdateRackTemplateDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<RackTemplateDocument> {
    const current = await this.getRackTemplate(session);
    current.set({ ...dto, updatedBy: new Types.ObjectId(actorId) });
    await current.save(session ? { session } : undefined);
    return current;
  }

  // ─── Aisle ────────────────────────────────────────────────────────────────

  async createAisle(
    dto: CreateAisleDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<AisleDocument> {
    const data = {
      ...dto,
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    };
    if (!session) return this.aisleModel.create(data);
    const [doc] = await this.aisleModel.create([data], { session });
    return doc;
  }

  async findAllAisles(session?: ClientSession): Promise<AisleDocument[]> {
    return this.withSession(
      this.aisleModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }),
      session,
    ).exec();
  }

  async findAisleById(
    id: string,
    session?: ClientSession,
  ): Promise<AisleDocument | null> {
    return this.withSession(
      this.aisleModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }),
      session,
    ).exec();
  }

  async findAisleByCode(
    code: string,
    session?: ClientSession,
  ): Promise<AisleDocument | null> {
    return this.withSession(
      this.aisleModel.findOne({ code, ...SOFT_DELETE_FILTER }),
      session,
    ).exec();
  }

  async updateAisle(
    id: string,
    dto: UpdateAisleDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<AisleDocument | null> {
    return this.aisleModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { ...dto, updatedBy: new Types.ObjectId(actorId) },
        { new: true, ...(session ? { session } : {}) },
      )
      .exec();
  }

  async softDeleteAisle(
    id: string,
    actorId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const filter = { _id: id, ...SOFT_DELETE_FILTER };
    const update = {
      deletedAt: new Date(),
      updatedBy: new Types.ObjectId(actorId),
    };
    const query = session
      ? this.aisleModel.updateOne(filter, update, { session })
      : this.aisleModel.updateOne(filter, update);
    const res = await query.exec();
    return res.modifiedCount > 0;
  }

  // ─── Gate ─────────────────────────────────────────────────────────────────

  async createGate(
    dto: CreateGateDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<GateDocument> {
    const data = {
      ...dto,
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    };
    if (!session) return this.gateModel.create(data);
    const [doc] = await this.gateModel.create([data], { session });
    return doc;
  }

  async findAllGates(session?: ClientSession): Promise<GateDocument[]> {
    return this.withSession(
      this.gateModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }),
      session,
    ).exec();
  }

  async findGateById(
    id: string,
    session?: ClientSession,
  ): Promise<GateDocument | null> {
    return this.withSession(
      this.gateModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }),
      session,
    ).exec();
  }

  async findGateByCode(
    code: string,
    session?: ClientSession,
  ): Promise<GateDocument | null> {
    return this.withSession(
      this.gateModel.findOne({ code, ...SOFT_DELETE_FILTER }),
      session,
    ).exec();
  }

  async updateGate(
    id: string,
    dto: UpdateGateDto,
    actorId: string,
    session?: ClientSession,
  ): Promise<GateDocument | null> {
    return this.gateModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { ...dto, updatedBy: new Types.ObjectId(actorId) },
        { new: true, ...(session ? { session } : {}) },
      )
      .exec();
  }

  async softDeleteGate(
    id: string,
    actorId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const filter = { _id: id, ...SOFT_DELETE_FILTER };
    const update = {
      deletedAt: new Date(),
      updatedBy: new Types.ObjectId(actorId),
    };
    const query = session
      ? this.gateModel.updateOne(filter, update, { session })
      : this.gateModel.updateOne(filter, update);
    const res = await query.exec();
    return res.modifiedCount > 0;
  }
}
