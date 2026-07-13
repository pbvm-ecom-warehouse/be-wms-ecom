import { Types } from 'mongoose';
import { PrintJobRepository } from './print-job.repository';
import { PrintJobLineStatus, PrintJobStatus } from './schemas/print-job.schema';

describe('PrintJobRepository', () => {
  let repo: PrintJobRepository;
  let model: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  const orderId = 'order-123';
  const warehouseId = new Types.ObjectId();
  const inputItemId = new Types.ObjectId();
  const outputItemId = new Types.ObjectId();

  beforeEach(() => {
    model = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    repo = new PrintJobRepository(model as never);
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

  describe('createPrintJob', () => {
    it('tạo document với remainingQty = reservedQty khởi tạo, status PENDING, lineStatus PENDING', async () => {
      model.create.mockResolvedValue([{ _id: 'pj1' }]);
      await repo.createPrintJob(orderId, warehouseId, [
        {
          inputItemId,
          outputItemId,
          sku: 'CUP-PRINTED-1',
          quantity: 10,
          reservedQty: 8,
        },
      ]);
      expect(model.create).toHaveBeenCalledWith([
        {
          orderId,
          warehouseId,
          status: PrintJobStatus.PENDING,
          items: [
            {
              inputItemId,
              outputItemId,
              sku: 'CUP-PRINTED-1',
              designFile: undefined,
              quantity: 10,
              reservedQty: 8,
              remainingQty: 8,
              lineStatus: PrintJobLineStatus.PENDING,
            },
          ],
        },
      ]);
    });
  });

  describe('findAll', () => {
    it('áp filter status, phân trang mặc định page=1 limit=20', async () => {
      const execMock = jest.fn().mockResolvedValue([{ _id: 'pj1' }]);
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: execMock,
      });
      model.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const result = await repo.findAll({ status: PrintJobStatus.PENDING });

      expect(model.find).toHaveBeenCalledWith({
        status: PrintJobStatus.PENDING,
      });
      expect(result).toEqual({ data: [{ _id: 'pj1' }], total: 1 });
    });
  });

  describe('decrementRemainingQty', () => {
    it('dùng $elemMatch theo inputItemId để tránh sửa nhầm phần tử mảng', async () => {
      const session = {} as never;
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'pj1' }),
      });
      await repo.decrementRemainingQty('pj1', inputItemId, 5, session);
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'pj1', items: { $elemMatch: { inputItemId } } },
        { $inc: { 'items.$.remainingQty': -5 } },
        { new: true, session },
      );
    });
  });

  describe('markLineConsumedIfDone', () => {
    it('set lineStatus=CONSUMED khi remainingQty=0, chuyển job PENDING→IN_PROGRESS', async () => {
      const session = {} as never;
      const doc = {
        _id: 'pj1',
        status: PrintJobStatus.PENDING,
        items: [
          {
            inputItemId,
            remainingQty: 0,
            lineStatus: PrintJobLineStatus.PENDING,
          },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);
      await repo.markLineConsumedIfDone('pj1', inputItemId, session);
      expect(doc.items[0].lineStatus).toBe(PrintJobLineStatus.CONSUMED);
      expect(doc.status).toBe(PrintJobStatus.IN_PROGRESS);
      expect(doc.save).toHaveBeenCalledWith({ session });
    });

    it('không đổi lineStatus khi remainingQty > 0', async () => {
      const session = {} as never;
      const doc = {
        _id: 'pj1',
        status: PrintJobStatus.PENDING,
        items: [
          {
            inputItemId,
            remainingQty: 3,
            lineStatus: PrintJobLineStatus.PENDING,
          },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);
      await repo.markLineConsumedIfDone('pj1', inputItemId, session);
      expect(doc.items[0].lineStatus).toBe(PrintJobLineStatus.PENDING);
    });

    it('không đổi job status nếu job đã IN_PROGRESS từ trước', async () => {
      const session = {} as never;
      const doc = {
        _id: 'pj1',
        status: PrintJobStatus.IN_PROGRESS,
        items: [
          {
            inputItemId,
            remainingQty: 0,
            lineStatus: PrintJobLineStatus.PENDING,
          },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);
      await repo.markLineConsumedIfDone('pj1', inputItemId, session);
      expect(doc.status).toBe(PrintJobStatus.IN_PROGRESS);
    });
  });

  describe('markLineCompleted', () => {
    it('set lineStatus=COMPLETED cho đúng dòng, trả allDone=true khi mọi dòng COMPLETED', async () => {
      const session = {} as never;
      const doc = {
        _id: 'pj1',
        items: [
          { inputItemId, lineStatus: PrintJobLineStatus.CONSUMED },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);
      const result = await repo.markLineCompleted('pj1', inputItemId, session);
      expect(doc.items[0].lineStatus).toBe(PrintJobLineStatus.COMPLETED);
      expect(result).toEqual({ allDone: true });
    });

    it('trả allDone=false khi còn dòng khác chưa COMPLETED', async () => {
      const session = {} as never;
      const otherItemId = new Types.ObjectId();
      const doc = {
        _id: 'pj1',
        items: [
          { inputItemId, lineStatus: PrintJobLineStatus.CONSUMED },
          { inputItemId: otherItemId, lineStatus: PrintJobLineStatus.PENDING },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);
      const result = await repo.markLineCompleted('pj1', inputItemId, session);
      expect(result).toEqual({ allDone: false });
    });
  });
});
