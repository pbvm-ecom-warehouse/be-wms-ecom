// apps/wms/src/purchase-order/purchase-order.repository.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { PurchaseOrderRepository } from './purchase-order.repository';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from './schemas/purchase-order.schema';

const makeModel = (overrides: Record<string, jest.Mock> = {}) => ({
  findOne: jest.fn().mockReturnThis(),
  find: jest.fn().mockReturnThis(),
  countDocuments: jest.fn().mockReturnThis(),
  create: jest.fn(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  ...overrides,
});

describe('PurchaseOrderRepository', () => {
  let repo: PurchaseOrderRepository;
  let model: ReturnType<typeof makeModel>;
  const actorId = new Types.ObjectId().toString();
  const supplierId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId().toString();
  const itemId = new Types.ObjectId().toString();

  beforeEach(async () => {
    model = makeModel();
    const module = await Test.createTestingModule({
      providers: [
        PurchaseOrderRepository,
        { provide: getModelToken(PurchaseOrder.name), useValue: model },
      ],
    }).compile();
    repo = module.get(PurchaseOrderRepository);
    jest.clearAllMocks();
  });

  describe('createPurchaseOrder', () => {
    it('tạo PO với poNumber, status CONFIRMED, items đã resolve giá', async () => {
      model.create.mockResolvedValue({ poNumber: 'PO-20260702-0001' });
      const dto = {
        supplierId,
        warehouseId,
        items: [{ itemId, sku: 'SKU-1', expectedQty: 10, unit: 'cái' }],
      };
      const resolvedItems = [
        { itemId, sku: 'SKU-1', expectedQty: 10, unit: 'cái', unitPrice: 5000 },
      ];
      await repo.createPurchaseOrder(
        dto,
        'PO-20260702-0001',
        resolvedItems,
        actorId,
      );
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          poNumber: 'PO-20260702-0001',
          status: PurchaseOrderStatus.CONFIRMED,
          items: resolvedItems,
        }),
      );
    });
  });

  describe('findPurchaseOrderById', () => {
    it('gọi findOne với _id', async () => {
      model.exec.mockResolvedValue(null);
      await repo.findPurchaseOrderById('po1');
      expect(model.findOne).toHaveBeenCalledWith({ _id: 'po1' });
    });
  });

  describe('findPurchaseOrders', () => {
    it('lọc theo status và supplierId, phân trang mặc định page=1 limit=20', async () => {
      model.exec.mockResolvedValueOnce([]).mockResolvedValueOnce(0);
      await repo.findPurchaseOrders({
        status: PurchaseOrderStatus.CONFIRMED,
        supplierId,
      });
      expect(model.find).toHaveBeenCalledWith({
        status: PurchaseOrderStatus.CONFIRMED,
        supplierId: new Types.ObjectId(supplierId),
      });
      expect(model.skip).toHaveBeenCalledWith(0);
      expect(model.limit).toHaveBeenCalledWith(20);
    });
  });

  describe('countByPoNumberPrefix', () => {
    it('đếm PO theo prefix ngày', async () => {
      model.exec.mockResolvedValue(3);
      const count = await repo.countByPoNumberPrefix('PO-20260702');
      expect(model.countDocuments).toHaveBeenCalledWith({
        poNumber: { $regex: '^PO-20260702' },
      });
      expect(count).toBe(3);
    });
  });
});
