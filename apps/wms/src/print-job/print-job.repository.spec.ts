import { Types } from 'mongoose';
import { PrintStage } from '@app/events';
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

  describe('findByOrderAndStage', () => {
    it('gọi findOne với đúng khóa idempotency orderId + stage', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      const result = await repo.findByOrderAndStage(orderId, PrintStage.SAMPLE);
      expect(model.findOne).toHaveBeenCalledWith({
        orderId,
        stage: PrintStage.SAMPLE,
      });
      expect(result).toBeNull();
    });
  });

  describe('createPrintJob', () => {
    it('tạo document với remainingQty = reservedQty khởi tạo, status PENDING, lineStatus PENDING', async () => {
      const session = {} as never;
      model.create.mockResolvedValue([{ _id: 'pj1' }]);
      await repo.createPrintJob(
        orderId,
        PrintStage.PRODUCTION,
        [
          {
            orderItemId: 'order-item-1',
            inputItemId,
            outputItemId,
            outputBarcode: '2000000000015',
            sku: 'CUP-PRINTED-1',
            quantity: 10,
            reservedQty: 8,
          },
        ],
        session,
        'PRN-20260730-0001',
        'ORD-20260730-0001',
      );
      expect(model.create).toHaveBeenCalledWith(
        [
          {
            printJobNumber: 'PRN-20260730-0001',
            orderId,
            orderCode: 'ORD-20260730-0001',
            stage: PrintStage.PRODUCTION,
            status: PrintJobStatus.PENDING,
            orderDetail: undefined,
            items: [
              {
                orderItemId: 'order-item-1',
                inputItemId,
                outputItemId,
                outputBarcode: '2000000000015',
                sku: 'CUP-PRINTED-1',
                designFile: undefined,
                quantity: 10,
                reservedQty: 8,
                remainingQty: 8,
                lineStatus: PrintJobLineStatus.PENDING,
                putawayRemainingQty: 0,
              },
            ],
          },
        ],
        { session },
      );
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

      const result = await repo.findAll({
        status: PrintJobStatus.PENDING,
        stage: PrintStage.SAMPLE,
      });

      expect(model.find).toHaveBeenCalledWith({
        status: PrintJobStatus.PENDING,
        stage: PrintStage.SAMPLE,
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

  describe('production output staging', () => {
    it('claim đúng một lần, set số lượng chờ cất và snapshot staging', async () => {
      const session = {} as never;
      const stagingShelfId = new Types.ObjectId();
      const doc = {
        _id: 'pj1',
        items: [
          {
            inputItemId,
            lineStatus: PrintJobLineStatus.CONSUMED,
            putawayRemainingQty: 0,
          },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);

      const result = await repo.markLineOutputStaged(
        'pj1',
        inputItemId,
        8,
        stagingShelfId,
        session,
      );

      expect(result).toEqual({ allPrinted: true });
      expect(doc.items[0]).toMatchObject({
        lineStatus: PrintJobLineStatus.COMPLETED,
        putawayRemainingQty: 8,
      });
      expect(doc).toMatchObject({ outputStagingShelfId: stagingShelfId });
      expect(doc.save).toHaveBeenCalledWith({ session });
    });

    it('không claim lại dòng đã COMPLETED', async () => {
      const session = {} as never;
      model.findOne.mockResolvedValue({
        items: [{ inputItemId, lineStatus: PrintJobLineStatus.COMPLETED }],
      });

      await expect(
        repo.markLineOutputStaged(
          'pj1',
          inputItemId,
          8,
          new Types.ObjectId(),
          session,
        ),
      ).resolves.toBeNull();
    });

    it('decrement putaway dùng status + elemMatch để chặn vượt số lượng/concurrent', async () => {
      const session = {} as never;
      const exec = jest.fn().mockResolvedValue({ _id: 'pj1' });
      model.findOneAndUpdate.mockReturnValue({ exec });

      await repo.decrementPutawayRemainingQty('pj1', inputItemId, 3, session);

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: 'pj1',
          status: PrintJobStatus.PUTAWAY_PENDING,
          items: {
            $elemMatch: {
              inputItemId,
              putawayRemainingQty: { $gte: 3 },
            },
          },
        },
        { $inc: { 'items.$.putawayRemainingQty': -3 } },
        { new: true, session },
      );
    });

    it('chỉ complete khi mọi dòng đã cất hết', async () => {
      const session = {} as never;
      const actorId = new Types.ObjectId();
      const doc = {
        status: PrintJobStatus.PUTAWAY_PENDING,
        items: [{ putawayRemainingQty: 0 }],
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockResolvedValue(doc);

      await expect(
        repo.markJobCompletedIfPutawayDone('pj1', actorId, session),
      ).resolves.toBe(true);
      expect(doc).toMatchObject({
        status: PrintJobStatus.COMPLETED,
        confirmedBy: actorId,
      });
    });
  });
});
