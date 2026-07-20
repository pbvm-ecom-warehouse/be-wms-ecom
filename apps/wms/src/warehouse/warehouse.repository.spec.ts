// apps/wms/src/warehouse/warehouse.repository.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { WarehouseRepository } from './warehouse.repository';
import { Warehouse } from './schemas/warehouse.schema';
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

describe('WarehouseRepository', () => {
  let repo: WarehouseRepository;
  let warehouseModel: ReturnType<typeof makeModel>;
  let rackModel: ReturnType<typeof makeModel>;
  let shelfModel: ReturnType<typeof makeModel>;
  const warehouseId = new Types.ObjectId().toString();

  beforeEach(async () => {
    warehouseModel = makeModel();
    rackModel = makeModel();
    shelfModel = makeModel();
    const module = await Test.createTestingModule({
      providers: [
        WarehouseRepository,
        { provide: getModelToken(Warehouse.name), useValue: warehouseModel },
        { provide: getModelToken(Zone.name), useValue: makeModel() },
        { provide: getModelToken(Rack.name), useValue: rackModel },
        { provide: getModelToken(Shelf.name), useValue: shelfModel },
      ],
    }).compile();
    repo = module.get(WarehouseRepository);
    jest.clearAllMocks();
  });

  describe('findStagingShelfByWarehouse', () => {
    it('lọc theo warehouseId, isStaging=true, chưa xóa', async () => {
      shelfModel.exec.mockResolvedValue(null);
      await repo.findStagingShelfByWarehouse(warehouseId);
      expect(shelfModel.findOne).toHaveBeenCalledWith({
        warehouseId: new Types.ObjectId(warehouseId),
        isStaging: true,
        deletedAt: null,
      });
    });

    it('trả về shelf khi tìm thấy', async () => {
      const shelf = { _id: new Types.ObjectId(), isStaging: true };
      shelfModel.exec.mockResolvedValue(shelf);
      const result = await repo.findStagingShelfByWarehouse(warehouseId);
      expect(result).toEqual(shelf);
    });
  });

  describe('findShelvesByWarehouse', () => {
    it('lọc đúng warehouseId, isStaging=false, deletedAt=null, đã khai đủ 3 chiều', async () => {
      shelfModel.exec.mockResolvedValue([]);

      await repo.findShelvesByWarehouse(warehouseId);

      expect(shelfModel.find).toHaveBeenCalledWith({
        warehouseId: new Types.ObjectId(warehouseId),
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
      const zoneId = new Types.ObjectId().toString();
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

      const ids = await repo.findShelfIdsByZone(zoneId);

      expect(rackModel.find).toHaveBeenCalledWith({
        zoneId: new Types.ObjectId(zoneId),
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
      const zoneId = new Types.ObjectId().toString();
      rackModel.find = jest.fn().mockReturnThis();
      rackModel.sort = jest.fn().mockReturnThis();
      rackModel.exec = jest.fn().mockResolvedValue([]);
      shelfModel.find = jest.fn().mockReturnThis();
      shelfModel.sort = jest.fn().mockReturnThis();
      shelfModel.exec = jest.fn().mockResolvedValue([]);

      const ids = await repo.findShelfIdsByZone(zoneId);

      expect(ids).toEqual([]);
    });
  });

  describe('findAllActiveWarehouseIds', () => {
    it('lọc isActive=true, chưa soft-delete, sort theo createdAt asc, chỉ lấy _id', async () => {
      const ids = [new Types.ObjectId(), new Types.ObjectId()];
      warehouseModel.select = jest.fn().mockReturnThis();
      warehouseModel.lean = jest.fn().mockReturnThis();
      warehouseModel.exec.mockResolvedValueOnce([
        { _id: ids[0] },
        { _id: ids[1] },
      ]);

      const result = await repo.findAllActiveWarehouseIds();

      expect(result).toEqual(ids);
      expect(warehouseModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        isActive: true,
      });
      expect(warehouseModel.sort).toHaveBeenCalledWith({ createdAt: 1 });
    });
  });
});
