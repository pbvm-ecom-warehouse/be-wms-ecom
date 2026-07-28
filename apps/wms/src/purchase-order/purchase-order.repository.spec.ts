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
  exists: jest.fn().mockReturnThis(),
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

  describe('existsByItemId', () => {
    it('trả về true khi tồn tại PO có dòng item khớp', async () => {
      model.exec.mockResolvedValue({ _id: new Types.ObjectId() });
      const result = await repo.existsByItemId(itemId);
      expect(model.exists).toHaveBeenCalledWith({
        'items.itemId': new Types.ObjectId(itemId),
      });
      expect(result).toBe(true);
    });

    it('trả về false khi không có PO nào tham chiếu item', async () => {
      model.exec.mockResolvedValue(null);
      const result = await repo.existsByItemId(itemId);
      expect(result).toBe(false);
    });
  });

  describe('findPurchaseOrderByIdWithSession', () => {
    it('gọi findOne với _id và session truyền vào', async () => {
      const session = {} as never;
      model.exec.mockResolvedValue(null);
      await repo.findPurchaseOrderByIdWithSession('po1', session);
      expect(model.findOne).toHaveBeenCalledWith({ _id: 'po1' }, null, {
        session,
      });
    });
  });

  describe('applyReceivedQtyAndStatus', () => {
    it('$inc receivedQty đúng item (arrayFilters) và set status mới', async () => {
      const session = {} as never;
      model.findOneAndUpdate = jest.fn().mockReturnThis();
      await repo.applyReceivedQtyAndStatus(
        'po1',
        itemId,
        20,
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
        session,
      );
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'po1', 'items.itemId': new Types.ObjectId(itemId) },
        {
          $inc: { 'items.$.receivedQty': 20 },
          $set: { status: PurchaseOrderStatus.PARTIALLY_RECEIVED },
        },
        { session },
      );
    });
  });
});
