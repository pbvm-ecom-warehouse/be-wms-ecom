import { Types } from 'mongoose';
import { GoodsIssueRepository } from './goods-issue.repository';
import { GoodsIssueStatus } from './schemas/goods-issue.schema';

describe('GoodsIssueRepository', () => {
  let repo: GoodsIssueRepository;
  let model: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  const orderId = 'order-123';
  const itemId = new Types.ObjectId();

  beforeEach(() => {
    model = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    repo = new GoodsIssueRepository(model as never);
  });

  describe('findByOrderId', () => {
    it('gọi findOne với đúng orderId', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      const result = await repo.findByOrderId(orderId);
      expect(model.findOne).toHaveBeenCalledWith({ orderId });
      expect(result).toBeNull();
    });
  });

  describe('createGoodsIssue', () => {
    it('upsert theo orderId để retry không đổi mã hoặc tạo phiếu trùng', async () => {
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'gi1' }),
      });
      const shippingAddress = { street: '123 Le Loi' };
      const recipient = { name: 'Nguyen Van A', phone: '0900000000' };
      await repo.createGoodsIssue({
        orderId,
        orderCode: 'ORD-20260730-0001',
        goodsIssueNumber: 'GI-20260730-0001',
        lines: [{ itemId, sku: 'SKU-1', quantity: 10 }],
        shippingAddress,
        recipient,
        paymentMethod: 'COD',
        codAmount: 0,
      });
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { orderId },
        {
          $setOnInsert: {
            orderId,
            orderCode: 'ORD-20260730-0001',
            goodsIssueNumber: 'GI-20260730-0001',
            status: GoodsIssueStatus.PENDING,
            shippingAddress,
            recipient,
            paymentMethod: 'COD',
            codAmount: 0,
            items: [{ itemId, sku: 'SKU-1', quantity: 10, remainingQty: 10 }],
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    });
  });

  describe('findAll', () => {
    it('áp filter status, phân trang mặc định page=1 limit=20', async () => {
      const execMock = jest.fn().mockResolvedValue([{ _id: 'gi1' }]);
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: execMock,
      });
      model.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const result = await repo.findAll({ status: GoodsIssueStatus.PENDING });

      expect(model.find).toHaveBeenCalledWith({
        status: GoodsIssueStatus.PENDING,
      });
      expect(result).toEqual({ data: [{ _id: 'gi1' }], total: 1 });
    });
  });

  describe('decrementRemainingQty', () => {
    it('dùng $elemMatch theo itemId để tránh sửa nhầm phần tử mảng', async () => {
      const session = {} as never;
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'gi1' }),
      });
      await repo.decrementRemainingQty('gi1', itemId, 5, session);
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: 'gi1',
          status: GoodsIssueStatus.PENDING,
          items: { $elemMatch: { itemId, remainingQty: { $gte: 5 } } },
        },
        { $inc: { 'items.$.remainingQty': -5 } },
        { new: true, session },
      );
    });
  });

  describe('markConfirmedIfAllDone', () => {
    it('trả true và set CONFIRMED khi mọi remainingQty = 0 và chưa CONFIRMED', async () => {
      const session = {} as never;
      const doc = {
        _id: 'gi1',
        status: GoodsIssueStatus.PENDING,
        items: [{ remainingQty: 0 }, { remainingQty: 0 }],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);
      const result = await repo.markConfirmedIfAllDone('gi1', session);
      expect(result).toBe(true);
      expect(doc.status).toBe(GoodsIssueStatus.CONFIRMED);
      expect(doc.save).toHaveBeenCalledWith({ session });
    });

    it('trả false khi còn dòng remainingQty > 0', async () => {
      const session = {} as never;
      const doc = {
        _id: 'gi1',
        status: GoodsIssueStatus.PENDING,
        items: [{ remainingQty: 3 }],
        save: jest.fn(),
      };
      model.findOne.mockResolvedValue(doc);
      const result = await repo.markConfirmedIfAllDone('gi1', session);
      expect(result).toBe(false);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('trả false khi đã CONFIRMED từ trước (không set/save lại)', async () => {
      const session = {} as never;
      const doc = {
        _id: 'gi1',
        status: GoodsIssueStatus.CONFIRMED,
        items: [{ remainingQty: 0 }],
        save: jest.fn(),
      };
      model.findOne.mockResolvedValue(doc);
      const result = await repo.markConfirmedIfAllDone('gi1', session);
      expect(result).toBe(false);
      expect(doc.save).not.toHaveBeenCalled();
    });
  });
});
