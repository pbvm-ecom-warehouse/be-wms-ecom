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

  describe('findSupplierItems', () => {
    it('lọc theo itemId khi có, trả về data + total', async () => {
      const fakeDocs = [{ itemId }, { itemId }];
      supplierItemModel.exec
        .mockResolvedValueOnce(fakeDocs)
        .mockResolvedValueOnce(fakeDocs.length);
      const result = await repo.findSupplierItems({ itemId });
      expect(supplierItemModel.find).toHaveBeenCalledWith({
        itemId: expect.any(Types.ObjectId),
      });
      expect(result).toEqual({ data: fakeDocs, total: fakeDocs.length });
    });

    it('lọc theo supplierId khi có', async () => {
      supplierItemModel.exec.mockResolvedValueOnce([]).mockResolvedValueOnce(0);
      await repo.findSupplierItems({ supplierId });
      expect(supplierItemModel.find).toHaveBeenCalledWith({
        supplierId: expect.any(Types.ObjectId),
      });
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

  describe('createSupplierItem', () => {
    it('set createdBy và updatedBy = actorId khi tạo báo giá mới', async () => {
      const fakeDoc = { itemId, supplierId, createdBy: actorId };
      supplierItemModel.create.mockResolvedValue(fakeDoc);
      const result = await repo.createSupplierItem(
        { itemId, supplierId, purchasePrice: 10000 },
        actorId,
      );
      expect(supplierItemModel.create).toHaveBeenCalledWith({
        itemId: expect.any(Types.ObjectId),
        supplierId: expect.any(Types.ObjectId),
        purchasePrice: 10000,
        createdBy: expect.any(Types.ObjectId),
        updatedBy: expect.any(Types.ObjectId),
      });
      expect(result).toEqual(fakeDoc);
    });
  });

  describe('updateSupplierItem', () => {
    it('set updatedBy = actorId khi sửa báo giá (truy vết ai sửa purchasePrice)', async () => {
      const fakeDoc = { itemId, supplierId, purchasePrice: 12000 };
      supplierItemModel.exec.mockResolvedValue(fakeDoc);
      const result = await repo.updateSupplierItem(
        'itemDocId',
        { purchasePrice: 12000 },
        actorId,
      );
      expect(supplierItemModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'itemDocId' },
        { purchasePrice: 12000, updatedBy: expect.any(Types.ObjectId) },
        { new: true },
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
