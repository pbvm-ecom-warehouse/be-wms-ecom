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
  let shelfModel: ReturnType<typeof makeModel>;
  const warehouseId = new Types.ObjectId().toString();

  beforeEach(async () => {
    shelfModel = makeModel();
    const module = await Test.createTestingModule({
      providers: [
        WarehouseRepository,
        { provide: getModelToken(Warehouse.name), useValue: makeModel() },
        { provide: getModelToken(Zone.name), useValue: makeModel() },
        { provide: getModelToken(Rack.name), useValue: makeModel() },
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
});
