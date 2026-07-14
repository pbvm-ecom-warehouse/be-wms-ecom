import { Types } from 'mongoose';
import { StockCountRepository } from './stock-count.repository';
import { StockCountStatus } from './schemas/stock-count.schema';

describe('StockCountRepository', () => {
  let repo: StockCountRepository;
  let model: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
  };

  const warehouseId = new Types.ObjectId();
  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();
  const lotId: Types.ObjectId | null = null;
  const createdBy = new Types.ObjectId();

  beforeEach(() => {
    model = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
    };
    repo = new StockCountRepository(model as never);
  });

  describe('findById', () => {
    it('gọi findOne với đúng _id', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      const result = await repo.findById('sc1');
      expect(model.findOne).toHaveBeenCalledWith({ _id: 'sc1' });
      expect(result).toBeNull();
    });
  });

  describe('createStockCount', () => {
    it('tạo document với status DRAFT, actualQty/delta/reason null cho từng dòng', async () => {
      model.create.mockResolvedValue([
        { _id: 'sc1', status: StockCountStatus.DRAFT },
      ]);
      await repo.createStockCount(warehouseId, null, undefined, createdBy, [
        { itemId, sku: 'SKU-1', shelfId, lotId: null, systemQty: 50 },
      ]);
      expect(model.create).toHaveBeenCalledWith([
        {
          warehouseId,
          zoneId: null,
          note: undefined,
          status: StockCountStatus.DRAFT,
          createdBy,
          items: [
            {
              itemId,
              sku: 'SKU-1',
              shelfId,
              lotId: null,
              systemQty: 50,
              actualQty: null,
              delta: null,
              reason: null,
            },
          ],
        },
      ]);
    });
  });

  describe('findAll', () => {
    it('áp filter status + warehouseId, phân trang mặc định page=1 limit=20', async () => {
      const execMock = jest.fn().mockResolvedValue([{ _id: 'sc1' }]);
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: execMock,
      });
      model.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const result = await repo.findAll({
        status: StockCountStatus.DRAFT,
        warehouseId,
      });

      expect(model.find).toHaveBeenCalledWith({
        status: StockCountStatus.DRAFT,
        warehouseId,
      });
      expect(result).toEqual({ data: [{ _id: 'sc1' }], total: 1 });
    });
  });

  describe('countItem', () => {
    it('set actualQty + tính delta đúng cho dòng khớp, không đụng dòng khác', async () => {
      const otherItemId = new Types.ObjectId();
      const doc = {
        _id: 'sc1',
        items: [
          {
            itemId,
            shelfId,
            lotId,
            systemQty: 50,
            actualQty: 45,
            delta: null,
            reason: null,
          },
          {
            itemId: otherItemId,
            shelfId,
            lotId,
            systemQty: 20,
            actualQty: null,
            delta: null,
            reason: null,
          },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      });

      const result = await repo.countItem(
        'sc1',
        itemId,
        shelfId,
        lotId,
        45,
        'Hao hụt',
      );

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: 'sc1',
          items: { $elemMatch: { itemId, shelfId, lotId } },
        },
        {
          $set: {
            'items.$.actualQty': 45,
            'items.$.reason': 'Hao hụt',
          },
        },
        { new: true },
      );
      expect(doc.items[0].delta).toBe(-5);
      expect(doc.items[1].actualQty).toBeNull();
      expect(doc.items[1].delta).toBeNull();
      expect(doc.save).toHaveBeenCalled();
      expect(result).toBe(doc);
    });

    it('trả null nếu không tìm thấy document khớp', async () => {
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      const result = await repo.countItem(
        'sc1',
        itemId,
        shelfId,
        lotId,
        45,
        null,
      );
      expect(result).toBeNull();
    });
  });

  describe('setCountedByIfDraft', () => {
    it('gọi updateOne để chuyển DRAFT sang IN_PROGRESS và set countedBy', async () => {
      const counter = new Types.ObjectId();
      model.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ acknowledged: true }),
      });
      await repo.setCountedByIfDraft('sc1', counter);
      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: 'sc1', status: StockCountStatus.DRAFT },
        {
          $set: { status: StockCountStatus.IN_PROGRESS, countedBy: counter },
        },
      );
    });
  });

  describe('markCompletedIfAllCounted', () => {
    it('chuyển COMPLETED khi mọi dòng đã có actualQty', async () => {
      const doc = {
        _id: 'sc1',
        status: StockCountStatus.IN_PROGRESS,
        items: [
          { itemId, actualQty: 50 },
          { itemId: new Types.ObjectId(), actualQty: 20 },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);
      await repo.markCompletedIfAllCounted('sc1');
      expect(doc.status).toBe(StockCountStatus.COMPLETED);
      expect(doc.save).toHaveBeenCalled();
    });

    it('không đổi status nếu còn dòng chưa đếm (actualQty null)', async () => {
      const doc = {
        _id: 'sc1',
        status: StockCountStatus.IN_PROGRESS,
        items: [
          { itemId, actualQty: 50 },
          { itemId: new Types.ObjectId(), actualQty: null },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);
      await repo.markCompletedIfAllCounted('sc1');
      expect(doc.status).toBe(StockCountStatus.IN_PROGRESS);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('không làm gì nếu document không tồn tại', async () => {
      model.findOne.mockResolvedValue(null);
      await expect(
        repo.markCompletedIfAllCounted('sc-not-found'),
      ).resolves.toBeUndefined();
    });
  });

  describe('setApproved', () => {
    it('gọi findOneAndUpdate với status APPROVED, approvedBy, approveReason trong session', async () => {
      const approvedBy = new Types.ObjectId();
      const session = {} as never;
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'sc1' }),
      });
      await repo.setApproved(
        'sc1',
        approvedBy,
        'Duyệt do sai lệch nhỏ',
        session,
      );
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'sc1' },
        {
          $set: {
            status: StockCountStatus.APPROVED,
            approvedBy,
            approveReason: 'Duyệt do sai lệch nhỏ',
          },
        },
        { session },
      );
    });
  });
});
