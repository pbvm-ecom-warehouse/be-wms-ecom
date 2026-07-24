// apps/wms/src/location/location.repository.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { LocationRepository } from './location.repository';
import { Zone } from './schemas/zone.schema';
import { Rack } from './schemas/rack.schema';
import { Shelf } from './schemas/shelf.schema';

const makeModel = (overrides: Record<string, jest.Mock> = {}) => ({
  findOne: jest.fn().mockReturnThis(),
  find: jest.fn().mockReturnThis(),
  create: jest.fn(),
  updateOne: jest.fn().mockReturnThis(),
  findOneAndUpdate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  ...overrides,
});

describe('LocationRepository', () => {
  let repo: LocationRepository;
  let zoneModel: ReturnType<typeof makeModel>;
  let rackModel: ReturnType<typeof makeModel>;
  let shelfModel: ReturnType<typeof makeModel>;
  const zoneId = new Types.ObjectId();
  const actorId = new Types.ObjectId().toString();

  beforeEach(async () => {
    zoneModel = makeModel();
    rackModel = makeModel();
    shelfModel = makeModel();
    const module = await Test.createTestingModule({
      providers: [
        LocationRepository,
        { provide: getModelToken(Zone.name), useValue: zoneModel },
        { provide: getModelToken(Rack.name), useValue: rackModel },
        { provide: getModelToken(Shelf.name), useValue: shelfModel },
      ],
    }).compile();
    repo = module.get(LocationRepository);
    jest.clearAllMocks();
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
          { rackId: rack._id.toString(), level: 2, code: 'S2', isStaging: true },
          actorId,
        ),
      ).rejects.toThrow();
    });
  });
});
