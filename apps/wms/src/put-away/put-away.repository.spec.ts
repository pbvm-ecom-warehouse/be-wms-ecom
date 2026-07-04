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
    it('filter dùng $elemMatch(itemId, lotId) trên cùng 1 phần tử; $inc âm để giảm remainingQty', async () => {
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
          items: { $elemMatch: { itemId, lotId } },
        },
        { $inc: { 'items.$.remainingQty': -5 } },
        { new: true, session },
      );
      expect(execMock).toHaveBeenCalled();
    });

    it('lotId null vẫn được đưa vào $elemMatch (item không thuộc lô cụ thể)', async () => {
      const taskId = new Types.ObjectId().toString();
      const itemId = new Types.ObjectId();
      const session = {} as never;
      const execMock = jest.fn().mockResolvedValue({ _id: taskId });
      modelMock.findOneAndUpdate.mockReturnValue({ exec: execMock });

      await repo.decrementRemainingQty(taskId, itemId, null, 3, session);

      expect(modelMock.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: taskId,
          items: { $elemMatch: { itemId, lotId: null } },
        },
        { $inc: { 'items.$.remainingQty': -3 } },
        { new: true, session },
      );
    });

    // Bug tìm thấy ở final review: filter cũ dùng 2 field rời 'items.itemId'/'items.lotId'
    // là 2 điều kiện ĐỘC LẬP trên mảng — Mongo khớp document nếu có bất kỳ phần tử nào có
    // itemId đó VÀ bất kỳ phần tử nào (có thể KHÁC) có lotId đó. Với task có 2 dòng cùng
    // itemId khác lotId (multi-lot cùng item — kịch bản chính của feature), xác nhận lô L2
    // dễ bị $ trỏ nhầm về phần tử L1. Test này khoá lại: filter gửi đi phải là $elemMatch
    // để đảm bảo match đúng 1 phần tử có ĐỦ CẢ HAI điều kiện.
    it('task có 2 items cùng itemId khác lotId — filter phải $elemMatch đúng lotId thứ 2, không lẫn 2 field rời', async () => {
      const taskId = new Types.ObjectId().toString();
      const itemId = new Types.ObjectId();
      const lotId1 = new Types.ObjectId();
      const lotId2 = new Types.ObjectId();
      const session = {} as never;
      const execMock = jest.fn().mockResolvedValue({ _id: taskId });
      modelMock.findOneAndUpdate.mockReturnValue({ exec: execMock });

      // Xác nhận dòng THỨ HAI (lotId2) của task đa lô cùng item
      await repo.decrementRemainingQty(taskId, itemId, lotId2, 7, session);

      const [filterArg] = modelMock.findOneAndUpdate.mock.calls[0] as [
        Record<string, unknown>,
      ];

      // Filter đúng phải gộp itemId + lotId2 trong cùng 1 $elemMatch
      expect(filterArg).toEqual({
        _id: taskId,
        items: { $elemMatch: { itemId, lotId: lotId2 } },
      });
      // Không được là filter kiểu 2-field-rời (lỗi cũ) — dù có lotId1 hay lotId2 thì
      // dạng field rời không phân biệt được item nào khớp cả 2 điều kiện cùng lúc.
      expect(filterArg).not.toEqual({
        _id: taskId,
        'items.itemId': itemId,
        'items.lotId': lotId1,
      });
      expect(filterArg).not.toEqual({
        _id: taskId,
        'items.itemId': itemId,
        'items.lotId': lotId2,
      });
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
