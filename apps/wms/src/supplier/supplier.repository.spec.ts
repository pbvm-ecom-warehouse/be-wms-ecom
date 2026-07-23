// apps/wms/src/supplier/supplier.repository.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { SupplierRepository } from './supplier.repository';
import { Supplier, SupplierStatus } from './schemas/supplier.schema';
import { SupplierItem } from './schemas/supplier-item.schema';

const makeModel = (overrides: Record<string, jest.Mock> = {}) => ({
  findOne: jest.fn().mockReturnThis(),
  find: jest.fn().mockReturnThis(),
  findOneAndUpdate: jest.fn().mockReturnThis(),
  countDocuments: jest.fn().mockReturnThis(),
  create: jest.fn(),
  updateOne: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  ...overrides,
});

describe('SupplierRepository', () => {
  let repo: SupplierRepository;
  let supplierModel: ReturnType<typeof makeModel>;
  let supplierItemModel: ReturnType<typeof makeModel>;
  const actorId = new Types.ObjectId().toString();
  const supplierId = new Types.ObjectId().toString();
  const itemId = new Types.ObjectId().toString();

  beforeEach(async () => {
    supplierModel = makeModel();
    supplierItemModel = makeModel();

    const module = await Test.createTestingModule({
      providers: [
        SupplierRepository,
        { provide: getModelToken(Supplier.name), useValue: supplierModel },
        {
          provide: getModelToken(SupplierItem.name),
          useValue: supplierItemModel,
        },
      ],
    }).compile();

    repo = module.get(SupplierRepository);
    jest.clearAllMocks();
  });

  describe('findSupplierByCode', () => {
    it('gọi findOne với code và deletedAt:null', async () => {
      supplierModel.exec.mockResolvedValue(null);
      await repo.findSupplierByCode('NCC-001');
      expect(supplierModel.findOne).toHaveBeenCalledWith({
        code: 'NCC-001',
        deletedAt: null,
      });
    });
  });

  describe('changeSupplierStatus', () => {
    it('gọi findOneAndUpdate với status mới và updatedBy', async () => {
      const fakeDoc = { status: SupplierStatus.INACTIVE };
      supplierModel.exec.mockResolvedValue(fakeDoc);
      const result = await repo.changeSupplierStatus(
        supplierId,
        SupplierStatus.INACTIVE,
        actorId,
      );
      expect(supplierModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: supplierId, deletedAt: null },
        {
          status: SupplierStatus.INACTIVE,
          updatedBy: expect.any(Types.ObjectId),
        },
        { new: true },
      );
      expect(result).toEqual(fakeDoc);
    });
  });

  describe('findSupplierItemsByItemId', () => {
    it('gọi find với itemId ObjectId, trả về mảng mọi NCC báo giá SKU đó', async () => {
      const fakeDocs = [{ itemId }, { itemId }];
      supplierItemModel.exec.mockResolvedValue(fakeDocs);
      const result = await repo.findSupplierItemsByItemId(itemId);
      expect(supplierItemModel.find).toHaveBeenCalledWith({
        itemId: expect.any(Types.ObjectId),
      });
      expect(result).toEqual(fakeDocs);
    });
  });

  describe('findSupplierItemByItemAndSupplier', () => {
    it('gọi findOne với đúng cặp itemId + supplierId ObjectId', async () => {
      supplierItemModel.exec.mockResolvedValue(null);
      await repo.findSupplierItemByItemAndSupplier(itemId, supplierId);
      expect(supplierItemModel.findOne).toHaveBeenCalledWith({
        itemId: expect.any(Types.ObjectId),
        supplierId: expect.any(Types.ObjectId),
      });
    });

    it('trả về document khi tìm thấy', async () => {
      const fakeDoc = { itemId, supplierId };
      supplierItemModel.exec.mockResolvedValue(fakeDoc);
      const result = await repo.findSupplierItemByItemAndSupplier(
        itemId,
        supplierId,
      );
      expect(result).toEqual(fakeDoc);
    });
  });

  describe('softDeleteSupplier', () => {
    it('trả về true khi modifiedCount > 0', async () => {
      supplierModel.exec.mockResolvedValue({ modifiedCount: 1 });
      const result = await repo.softDeleteSupplier(supplierId, actorId);
      expect(result).toBe(true);
    });

    it('trả về false khi không tìm thấy', async () => {
      supplierModel.exec.mockResolvedValue({ modifiedCount: 0 });
      const result = await repo.softDeleteSupplier(supplierId, actorId);
      expect(result).toBe(false);
    });
  });
});
