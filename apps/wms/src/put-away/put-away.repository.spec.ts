import { Types } from 'mongoose';
import { PutAwayRepository } from './put-away.repository';
import { PutAwayTaskStatus } from './schemas/put-away-task.schema';

describe('PutAwayRepository', () => {
  let repo: PutAwayRepository;
  let modelMock: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  beforeEach(() => {
    modelMock = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    repo = new PutAwayRepository(modelMock as never);
  });

  describe('createTask', () => {
    it('tạo PutAwayTask với status PENDING và items truyền vào', async () => {
      const grnId = new Types.ObjectId();
      const warehouseId = new Types.ObjectId();
      const itemId = new Types.ObjectId();
      const actorId = new Types.ObjectId().toString();
      const session = {} as never;
      modelMock.create.mockResolvedValue([{ _id: 'task1' }]);

      await repo.createTask(
        grnId,
        warehouseId,
        [{ itemId, lotId: null, quantity: 20 }],
        actorId,
        session,
      );

      expect(modelMock.create).toHaveBeenCalledWith(
        [
          {
            grnId,
            warehouseId,
            status: PutAwayTaskStatus.PENDING,
            items: [{ itemId, lotId: null, quantity: 20, remainingQty: 20 }],
            createdBy: new Types.ObjectId(actorId),
          },
        ],
        { session },
      );
    });
  });

  describe('decrementRemainingQty', () => {
    it('filter đúng cả _id, items.itemId VÀ items.lotId; $inc âm để giảm remainingQty', async () => {
      const taskId = new Types.ObjectId().toString();
      const itemId = new Types.ObjectId();
      const lotId = new Types.ObjectId();
      const session = {} as never;
      const execMock = jest.fn().mockResolvedValue({ _id: taskId });
      modelMock.findOneAndUpdate.mockReturnValue({ exec: execMock });

      await repo.decrementRemainingQty(taskId, itemId, lotId, 5, session);

      expect(modelMock.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: taskId,
          'items.itemId': itemId,
          'items.lotId': lotId,
        },
        { $inc: { 'items.$.remainingQty': -5 } },
        { new: true, session },
      );
      expect(execMock).toHaveBeenCalled();
    });

    it('lotId null vẫn được đưa vào filter (item không thuộc lô cụ thể)', async () => {
      const taskId = new Types.ObjectId().toString();
      const itemId = new Types.ObjectId();
      const session = {} as never;
      const execMock = jest.fn().mockResolvedValue({ _id: taskId });
      modelMock.findOneAndUpdate.mockReturnValue({ exec: execMock });

      await repo.decrementRemainingQty(taskId, itemId, null, 3, session);

      expect(modelMock.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: taskId,
          'items.itemId': itemId,
          'items.lotId': null,
        },
        { $inc: { 'items.$.remainingQty': -3 } },
        { new: true, session },
      );
    });
  });

  describe('markCompletedIfAllDone', () => {
    it('set status COMPLETED và save khi mọi items[].remainingQty === 0', async () => {
      const taskId = new Types.ObjectId().toString();
      const session = {} as never;
      const saveMock = jest.fn().mockResolvedValue(undefined);
      const task = {
        status: PutAwayTaskStatus.PENDING,
        items: [{ remainingQty: 0 }, { remainingQty: 0 }],
        save: saveMock,
      };
      modelMock.findOne.mockResolvedValue(task);

      await repo.markCompletedIfAllDone(taskId, session);

      expect(task.status).toBe(PutAwayTaskStatus.COMPLETED);
      expect(saveMock).toHaveBeenCalledWith({ session });
    });

    it('KHÔNG set COMPLETED và KHÔNG save khi còn dòng chưa xong', async () => {
      const taskId = new Types.ObjectId().toString();
      const session = {} as never;
      const saveMock = jest.fn().mockResolvedValue(undefined);
      const task = {
        status: PutAwayTaskStatus.PENDING,
        items: [{ remainingQty: 0 }, { remainingQty: 4 }],
        save: saveMock,
      };
      modelMock.findOne.mockResolvedValue(task);

      await repo.markCompletedIfAllDone(taskId, session);

      expect(task.status).toBe(PutAwayTaskStatus.PENDING);
      expect(saveMock).not.toHaveBeenCalled();
    });

    it('không làm gì khi không tìm thấy task', async () => {
      const taskId = new Types.ObjectId().toString();
      const session = {} as never;
      modelMock.findOne.mockResolvedValue(null);

      await expect(
        repo.markCompletedIfAllDone(taskId, session),
      ).resolves.toBeUndefined();
    });
  });
});
