import { Types } from 'mongoose';
import { GoodsReturnRepository } from './goods-return.repository';
import {
  GoodsReturnItemCondition,
  GoodsReturnStatus,
} from './schemas/goods-return.schema';

describe('GoodsReturnRepository', () => {
  let repo: GoodsReturnRepository;
  let model: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();
  const createdBy = new Types.ObjectId();

  beforeEach(() => {
    model = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    repo = new GoodsReturnRepository(model as never);
  });

  describe('findById', () => {
    it('gọi findOne với đúng id', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      const result = await repo.findById('gr1');
      expect(model.findOne).toHaveBeenCalledWith({ _id: 'gr1' });
      expect(result).toBeNull();
    });
  });

  describe('findByOrderId', () => {
    it('gọi findOne với đúng orderId', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await repo.findByOrderId('order-1');
      expect(model.findOne).toHaveBeenCalledWith({ orderId: 'order-1' });
    });
  });

  describe('createGoodsReturn', () => {
    it('tạo document DRAFT, dòng chưa phân loại', async () => {
      model.create.mockResolvedValue([{ _id: 'gr1' }]);
      await repo.createGoodsReturn(
        'order-1',
        null,
        undefined,
        [{ itemId, sku: 'SKU-1', quantity: 5 }],
        'RET-20260730-0001',
        'ORD-20260730-0001',
      );
      expect(model.create).toHaveBeenCalledWith([
        {
          goodsReturnNumber: 'RET-20260730-0001',
          orderId: 'order-1',
          orderCode: 'ORD-20260730-0001',
          note: undefined,
          status: GoodsReturnStatus.DRAFT,
          createdBy: null,
          items: [
            {
              itemId,
              sku: 'SKU-1',
              quantity: 5,
              condition: null,
              shelfId: null,
              lotId: null,
              scrapNoteId: null,
            },
          ],
        },
      ]);
    });
  });

  describe('findAll', () => {
    it('lọc theo status + orderId, phân trang mặc định', async () => {
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      model.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
      await repo.findAll({
        status: GoodsReturnStatus.DRAFT,
        orderId: 'order-1',
      });
      expect(model.find).toHaveBeenCalledWith({
        status: GoodsReturnStatus.DRAFT,
        orderId: 'order-1',
      });
    });
  });

  describe('setInspected', () => {
    it('không làm gì nếu không tìm thấy phiếu', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await repo.setInspected('gr1', createdBy, []);
      expect(model.findOne).toHaveBeenCalledWith({ _id: 'gr1' });
    });

    it('set createdBy, status=INSPECTED, cập nhật từng dòng', async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const doc = {
        createdBy: null,
        status: GoodsReturnStatus.DRAFT,
        items: [
          { itemId, condition: null, shelfId: null, lotId: null, images: [] },
        ],
        save,
      };
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) });

      await repo.setInspected('gr1', createdBy, [
        {
          itemId,
          condition: GoodsReturnItemCondition.GOOD,
          shelfId,
          lotId: null,
          images: [],
        },
      ]);

      expect(doc.createdBy).toBe(createdBy);
      expect(doc.status).toBe(GoodsReturnStatus.INSPECTED);
      expect(doc.items[0].condition).toBe(GoodsReturnItemCondition.GOOD);
      expect(doc.items[0].shelfId).toBe(shelfId);
      expect(save).toHaveBeenCalled();
    });

    it('lưu images vào đúng dòng khi DAMAGED có ảnh minh chứng', async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const doc = {
        createdBy: null,
        status: GoodsReturnStatus.DRAFT,
        items: [
          { itemId, condition: null, shelfId: null, lotId: null, images: [] },
        ],
        save,
      };
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) });

      await repo.setInspected('gr1', createdBy, [
        {
          itemId,
          condition: GoodsReturnItemCondition.DAMAGED,
          shelfId,
          lotId: null,
          images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'],
        },
      ]);

      expect(doc.items[0].images).toEqual([
        'https://res.cloudinary.com/demo/image/upload/x.jpg',
      ]);
    });
  });

  describe('setRestocked', () => {
    it('set status=RESTOCKED, gắn scrapNoteId đúng dòng, trong session', async () => {
      const session = {} as never;
      const save = jest.fn().mockResolvedValue(undefined);
      const scrapNoteId = new Types.ObjectId();
      const doc = {
        status: GoodsReturnStatus.INSPECTED,
        items: [{ itemId, scrapNoteId: null }],
        save,
      };
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) });

      const map = new Map([[itemId.toString(), scrapNoteId]]);
      await repo.setRestocked('gr1', map, new Map(), session);

      expect(model.findOne).toHaveBeenCalledWith({ _id: 'gr1' }, null, {
        session,
      });
      expect(doc.status).toBe(GoodsReturnStatus.RESTOCKED);
      expect(doc.items[0].scrapNoteId).toBe(scrapNoteId);
      expect(save).toHaveBeenCalledWith({ session });
    });
  });

  describe('setCancelled', () => {
    it('set status=CANCELLED', async () => {
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await repo.setCancelled('gr1');
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'gr1' },
        { $set: { status: GoodsReturnStatus.CANCELLED } },
      );
    });
  });
});
