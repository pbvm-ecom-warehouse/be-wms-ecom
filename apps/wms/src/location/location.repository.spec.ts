// apps/wms/src/location/location.repository.spec.ts
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { LocationRepository } from './location.repository';
import { Zone } from './schemas/zone.schema';
import { Rack } from './schemas/rack.schema';
import { Shelf } from './schemas/shelf.schema';
import { RackTemplate } from './schemas/rack-template.schema';
import { Aisle } from './schemas/aisle.schema';
import { Gate } from './schemas/gate.schema';
import { WarehouseLayoutConfig } from './schemas/warehouse-layout-config.schema';

const makeModel = (overrides: Record<string, jest.Mock> = {}) => ({
  findOne: jest.fn().mockReturnThis(),
  find: jest.fn().mockReturnThis(),
  create: jest.fn(),
  updateOne: jest.fn().mockReturnThis(),
  findOneAndUpdate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  session: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  ...overrides,
});

describe('LocationRepository', () => {
  let repo: LocationRepository;
  let zoneModel: ReturnType<typeof makeModel>;
  let rackModel: ReturnType<typeof makeModel>;
  let shelfModel: ReturnType<typeof makeModel>;
  let rackTemplateModel: ReturnType<typeof makeModel>;
  let aisleModel: ReturnType<typeof makeModel>;
  let gateModel: ReturnType<typeof makeModel>;
  let layoutConfigModel: ReturnType<typeof makeModel>;
  let connection: { startSession: jest.Mock };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };
  const zoneId = new Types.ObjectId();
  const actorId = new Types.ObjectId().toString();

  beforeEach(async () => {
    zoneModel = makeModel();
    rackModel = makeModel();
    shelfModel = makeModel();
    rackTemplateModel = makeModel();
    aisleModel = makeModel();
    gateModel = makeModel();
    layoutConfigModel = makeModel();
    session = {
      withTransaction: jest.fn(async (work: () => Promise<void>) => work()),
      endSession: jest.fn(),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    const module = await Test.createTestingModule({
      providers: [
        LocationRepository,
        { provide: getConnectionToken(), useValue: connection },
        { provide: getModelToken(Zone.name), useValue: zoneModel },
        { provide: getModelToken(Rack.name), useValue: rackModel },
        { provide: getModelToken(Shelf.name), useValue: shelfModel },
        {
          provide: getModelToken(RackTemplate.name),
          useValue: rackTemplateModel,
        },
        { provide: getModelToken(Aisle.name), useValue: aisleModel },
        { provide: getModelToken(Gate.name), useValue: gateModel },
        {
          provide: getModelToken(WarehouseLayoutConfig.name),
          useValue: layoutConfigModel,
        },
      ],
    }).compile();
    repo = module.get(LocationRepository);
    jest.clearAllMocks();
  });

  describe('runInTransaction', () => {
    it('trả kết quả callback và luôn đóng Mongo session', async () => {
      await expect(
        repo.runInTransaction((activeSession) => {
          expect(activeSession).toBe(session);
          return Promise.resolve('saved');
        }),
      ).resolves.toBe('saved');

      expect(connection.startSession).toHaveBeenCalledTimes(1);
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    it('hỗ trợ transaction callback không trả payload', async () => {
      await expect(
        repo.runInTransaction(() => Promise.resolve(undefined)),
      ).resolves.toBe(undefined);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
    it('ném lại lỗi để Mongo rollback và vẫn đóng session', async () => {
      const failure = new Error('operation failed');

      await expect(
        repo.runInTransaction(() => Promise.reject(failure)),
      ).rejects.toBe(failure);

      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
  });
  describe('layout config', () => {
    it('lazy-init singleton canvas khi collection chưa có dữ liệu', async () => {
      layoutConfigModel.exec
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ key: 'SINGLETON', revision: 1 });

      const config = await repo.getLayoutConfig();

      expect(layoutConfigModel.findOneAndUpdate).toHaveBeenCalledWith(
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
        { new: true, upsert: true },
      );
      expect(config).toEqual({ key: 'SINGLETON', revision: 1 });
    });

    it('tăng revision và ghi actor sau mutation layout', async () => {
      layoutConfigModel.exec
        .mockResolvedValueOnce({ key: 'SINGLETON', revision: 3 })
        .mockResolvedValueOnce({ key: 'SINGLETON', revision: 4 });

      const config = await repo.incrementLayoutRevision(actorId);

      expect(layoutConfigModel.findOneAndUpdate).toHaveBeenLastCalledWith(
        { key: 'SINGLETON' },
        {
          $inc: { revision: 1 },
          $set: { updatedBy: new Types.ObjectId(actorId) },
        },
        { new: true },
      );
      expect(config.revision).toBe(4);
    });
  });
  describe('delete guard lookups', () => {
    it('hasRacksInZone chỉ xét rack chưa soft-delete', async () => {
      rackModel.exec.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(repo.hasRacksInZone(zoneId.toString())).resolves.toBe(true);
      expect(rackModel.findOne).toHaveBeenCalledWith({
        zoneId,
        deletedAt: null,
      });
    });

    it('hasShelvesInRack trả false khi rack không còn shelf active', async () => {
      const rackId = new Types.ObjectId();
      shelfModel.exec.mockResolvedValue(null);

      await expect(repo.hasShelvesInRack(rackId.toString())).resolves.toBe(
        false,
      );
      expect(shelfModel.findOne).toHaveBeenCalledWith({
        rackId,
        deletedAt: null,
      });
    });
  });
  describe('findStagingShelf', () => {
    it('lọc theo isStaging=true, chưa xóa — không còn scope theo warehouseId', async () => {
      shelfModel.exec.mockResolvedValue(null);
      await repo.findStagingShelf();
      expect(shelfModel.findOne).toHaveBeenCalledWith({
        isStaging: true,
        deletedAt: null,
      });
    });

    it('trả về shelf khi tìm thấy', async () => {
      const shelf = { _id: new Types.ObjectId(), isStaging: true };
      shelfModel.exec.mockResolvedValue(shelf);
      const result = await repo.findStagingShelf();
      expect(result).toEqual(shelf);
    });
  });

  describe('findShelves', () => {
    it('lọc isStaging=false, deletedAt=null, đã khai đủ 3 chiều — không còn scope theo warehouseId', async () => {
      shelfModel.exec.mockResolvedValue([]);

      await repo.findShelves();

      expect(shelfModel.find).toHaveBeenCalledWith({
        isStaging: false,
        deletedAt: null,
        innerDepth: { $exists: true, $ne: null },
        innerWidth: { $exists: true, $ne: null },
        innerHeight: { $exists: true, $ne: null },
      });
    });
  });

  describe('findShelfIdsByZone', () => {
    it('trả về shelfId của mọi shelf thuộc mọi rack trong zone', async () => {
      const zId = new Types.ObjectId().toString();
      const rackA = new Types.ObjectId();
      const rackB = new Types.ObjectId();
      const shelfA1 = new Types.ObjectId();
      const shelfB1 = new Types.ObjectId();

      rackModel.find = jest.fn().mockReturnThis();
      rackModel.sort = jest.fn().mockReturnThis();
      rackModel.exec = jest
        .fn()
        .mockResolvedValue([{ _id: rackA }, { _id: rackB }]);

      shelfModel.find = jest.fn().mockReturnThis();
      shelfModel.sort = jest.fn().mockReturnThis();
      shelfModel.exec = jest
        .fn()
        .mockResolvedValueOnce([{ _id: shelfA1 }])
        .mockResolvedValueOnce([{ _id: shelfB1 }]);

      const ids = await repo.findShelfIdsByZone(zId);

      expect(rackModel.find).toHaveBeenCalledWith({
        zoneId: new Types.ObjectId(zId),
        deletedAt: null,
      });
      expect(shelfModel.find).toHaveBeenNthCalledWith(1, {
        rackId: rackA,
        deletedAt: null,
      });
      expect(shelfModel.find).toHaveBeenNthCalledWith(2, {
        rackId: rackB,
        deletedAt: null,
      });
      expect(ids).toEqual([shelfA1, shelfB1]);
    });

    it('trả về mảng rỗng khi zone không có rack nào', async () => {
      const zId = new Types.ObjectId().toString();
      rackModel.find = jest.fn().mockReturnThis();
      rackModel.sort = jest.fn().mockReturnThis();
      rackModel.exec = jest.fn().mockResolvedValue([]);
      shelfModel.find = jest.fn().mockReturnThis();
      shelfModel.sort = jest.fn().mockReturnThis();
      shelfModel.exec = jest.fn().mockResolvedValue([]);

      const ids = await repo.findShelfIdsByZone(zId);

      expect(ids).toEqual([]);
    });
  });

  describe('findAllZones', () => {
    it('lọc chưa soft-delete, sort theo code asc', async () => {
      zoneModel.exec.mockResolvedValue([]);
      await repo.findAllZones();
      expect(zoneModel.find).toHaveBeenCalledWith({ deletedAt: null });
      expect(zoneModel.sort).toHaveBeenCalledWith({ code: 1 });
    });
  });

  describe('createZone', () => {
    it('gọi create với createdBy/updatedBy — không còn warehouseId', async () => {
      const dto = { name: 'Khu A', code: 'A' };
      const mockDoc = { _id: new Types.ObjectId(), ...dto };
      zoneModel.create.mockResolvedValue(mockDoc);

      const result = await repo.createZone(dto, actorId);

      expect(zoneModel.create).toHaveBeenCalledWith({
        ...dto,
        createdBy: new Types.ObjectId(actorId),
        updatedBy: new Types.ObjectId(actorId),
      });
      expect(result).toBe(mockDoc);
    });
  });

  describe('session propagation', () => {
    it('gắn session vào query snapshot', async () => {
      zoneModel.exec.mockResolvedValue([]);

      await repo.findAllZones(session as never);

      expect(zoneModel.session).toHaveBeenCalledWith(session);
    });

    it('tạo document bằng array form trong transaction', async () => {
      const dto = { name: 'Khu A', code: 'A' };
      const created = { _id: new Types.ObjectId(), ...dto };
      zoneModel.create.mockResolvedValue([created]);

      await expect(
        repo.createZone(dto, actorId, session as never),
      ).resolves.toBe(created);
      expect(zoneModel.create).toHaveBeenCalledWith(
        [
          {
            ...dto,
            createdBy: new Types.ObjectId(actorId),
            updatedBy: new Types.ObjectId(actorId),
          },
        ],
        { session },
      );
    });

    it('khóa shelf active bằng write trong transaction trước khi ghi inventory', async () => {
      const shelfId = new Types.ObjectId();
      const activeShelf = { _id: shelfId, isStaging: false };
      shelfModel.exec.mockResolvedValue(activeShelf);

      await expect(
        repo.lockActiveShelfForInventory(shelfId.toString(), session as never),
      ).resolves.toBe(activeShelf);

      expect(shelfModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: shelfId.toString(), deletedAt: null },
        { $set: { updatedAt: expect.any(Date) } },
        { new: true, session },
      );
    });
  });
  describe('findZoneByCode', () => {
    it('lọc theo code, không còn warehouseId', async () => {
      zoneModel.exec.mockResolvedValue(null);
      await repo.findZoneByCode('A');
      expect(zoneModel.findOne).toHaveBeenCalledWith({
        code: 'A',
        deletedAt: null,
      });
    });
  });

  describe('createRack', () => {
    it('gọi create với zoneId + createdBy/updatedBy', async () => {
      const dto = { zoneId: zoneId.toString(), name: 'Kệ A1', code: 'A1' };
      const mockDoc = { _id: new Types.ObjectId(), ...dto };
      rackModel.create.mockResolvedValue(mockDoc);

      const result = await repo.createRack(dto, actorId);

      expect(rackModel.create).toHaveBeenCalledWith({
        ...dto,
        zoneId: new Types.ObjectId(dto.zoneId),
        createdBy: new Types.ObjectId(actorId),
        updatedBy: new Types.ObjectId(actorId),
      });
      expect(result).toBe(mockDoc);
    });
  });

  describe('createShelf', () => {
    it('gọi create với rackId + createdBy/updatedBy — không nhận warehouseId (đã bỏ tham số thứ 3)', async () => {
      const rackId = new Types.ObjectId().toString();
      const dto = { rackId, level: 1, code: 'A1-T1' };
      const mockDoc = { _id: new Types.ObjectId(), ...dto };
      shelfModel.create.mockResolvedValue(mockDoc);

      const result = await repo.createShelf(dto, actorId);

      expect(shelfModel.create).toHaveBeenCalledWith({
        ...dto,
        rackId: new Types.ObjectId(rackId),
        createdBy: new Types.ObjectId(actorId),
        updatedBy: new Types.ObjectId(actorId),
      });
      expect(result).toBe(mockDoc);
    });
  });

  describe('createAisle', () => {
    it('gọi create với createdBy/updatedBy', async () => {
      const dto = { code: 'MAIN-01', type: 'MAIN' as const };
      const mockDoc = { _id: new Types.ObjectId(), ...dto };
      aisleModel.create.mockResolvedValue(mockDoc);

      const result = await repo.createAisle(dto, actorId);

      expect(aisleModel.create).toHaveBeenCalledWith({
        ...dto,
        createdBy: new Types.ObjectId(actorId),
        updatedBy: new Types.ObjectId(actorId),
      });
      expect(result).toBe(mockDoc);
    });
  });

  describe('findAllAisles', () => {
    it('lọc chưa soft-delete, sort theo code asc', async () => {
      aisleModel.exec.mockResolvedValue([]);
      await repo.findAllAisles();
      expect(aisleModel.find).toHaveBeenCalledWith({ deletedAt: null });
      expect(aisleModel.sort).toHaveBeenCalledWith({ code: 1 });
    });
  });

  describe('findAisleByCode', () => {
    it('lọc theo code, chưa soft-delete', async () => {
      aisleModel.exec.mockResolvedValue(null);
      await repo.findAisleByCode('MAIN-01');
      expect(aisleModel.findOne).toHaveBeenCalledWith({
        code: 'MAIN-01',
        deletedAt: null,
      });
    });
  });

  describe('softDeleteAisle', () => {
    it('trả về true khi modifiedCount > 0', async () => {
      aisleModel.exec.mockResolvedValue({ modifiedCount: 1 });
      const result = await repo.softDeleteAisle(
        new Types.ObjectId().toString(),
        actorId,
      );
      expect(result).toBe(true);
    });
  });

  describe('staging shelf uniqueness', () => {
    it('chặn tạo shelf staging thứ 2 — model.create phản ánh vi phạm partial unique index { isStaging: true, deletedAt: null } bằng lỗi duplicate-key', async () => {
      const rack = { _id: new Types.ObjectId() };
      const dupErr = Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
      });

      // Shelf staging đầu tiên tạo thành công
      shelfModel.create.mockResolvedValueOnce({
        _id: new Types.ObjectId(),
        rackId: rack._id,
        level: 1,
        code: 'S1',
        isStaging: true,
      });
      const first = await repo.createShelf(
        { rackId: rack._id.toString(), level: 1, code: 'S1', isStaging: true },
        actorId,
      );
      expect(first.isStaging).toBe(true);

      // Shelf staging thứ 2 — DB (index thật) sẽ reject bằng duplicate-key error
      shelfModel.create.mockRejectedValueOnce(dupErr);
      await expect(
        repo.createShelf(
          {
            rackId: rack._id.toString(),
            level: 2,
            code: 'S2',
            isStaging: true,
          },
          actorId,
        ),
      ).rejects.toThrow();
    });
  });
});
