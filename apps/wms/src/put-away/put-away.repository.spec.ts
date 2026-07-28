import { Types } from 'mongoose';
import { PutAwayRepository } from './put-away.repository';
import { PutAwayTaskStatus } from './schemas/put-away-task.schema';

const packageSpec = {
  unit: 'thùng',
  factor: 10,
  depthCm: 40,
  widthCm: 30,
  heightCm: 20,
  volumeCm3: 24000,
};

describe('PutAwayRepository', () => {
  const model = {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const repo = new PutAwayRepository(model as never);

  beforeEach(() => jest.clearAllMocks());

  it('snapshot số thùng và quy cách khi tạo task', async () => {
    const grnId = new Types.ObjectId();
    const itemId = new Types.ObjectId();
    const sourceShelfId = new Types.ObjectId();
    const actorId = new Types.ObjectId().toString();
    const session = {} as never;
    model.create.mockResolvedValue([{ _id: 'task1' }]);

    await repo.createTask(
      grnId,
      [{ itemId, lotId: null, quantity: 20, packageCount: 2, packageSpec }],
      actorId,
      session,
      sourceShelfId,
    );

    expect(model.create).toHaveBeenCalledWith(
      [
        {
          grnId,
          sourceShelfId,
          status: PutAwayTaskStatus.PENDING,
          items: [
            {
              itemId,
              lotId: null,
              quantity: 20,
              remainingQty: 20,
              packageCount: 2,
              remainingPackageCount: 2,
              packageSpec,
            },
          ],
          createdBy: new Types.ObjectId(actorId),
        },
      ],
      { session },
    );
  });

  it('giảm đúng item+lô và chặn vượt cả baseQty lẫn packageCount trong một query', async () => {
    const taskId = new Types.ObjectId().toString();
    const itemId = new Types.ObjectId();
    const lotId = new Types.ObjectId();
    const session = {} as never;
    const exec = jest.fn().mockResolvedValue({ _id: taskId });
    model.findOneAndUpdate.mockReturnValue({ exec });

    await repo.decrementRemainingQty(taskId, itemId, lotId, 20, session, 2);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: taskId,
        status: PutAwayTaskStatus.PENDING,
        items: {
          $elemMatch: {
            itemId,
            lotId,
            remainingQty: { $gte: 20 },
            remainingPackageCount: { $gte: 2 },
          },
        },
      },
      {
        $inc: {
          'items.$.remainingQty': -20,
          'items.$.remainingPackageCount': -2,
        },
      },
      { new: true, session },
    );
  });

  it('chỉ COMPLETED khi cả số lượng cơ sở và số thùng đều về 0', async () => {
    const session = {} as never;
    const doc = {
      status: PutAwayTaskStatus.PENDING,
      items: [
        { remainingQty: 0, remainingPackageCount: 0 },
        { remainingQty: 0, remainingPackageCount: 0 },
      ],
      save: jest.fn(),
    };
    model.findOne.mockResolvedValue(doc);

    await repo.markCompletedIfAllDone('task-1', session);

    expect(doc.status).toBe(PutAwayTaskStatus.COMPLETED);
    expect(doc.save).toHaveBeenCalledWith({ session });
  });

  it('không COMPLETED nếu vẫn còn thùng dù remainingQty đã 0', async () => {
    const doc = {
      status: PutAwayTaskStatus.PENDING,
      items: [{ remainingQty: 0, remainingPackageCount: 1 }],
      save: jest.fn(),
    };
    model.findOne.mockResolvedValue(doc);

    await repo.markCompletedIfAllDone('task-1', {} as never);

    expect(doc.status).toBe(PutAwayTaskStatus.PENDING);
    expect(doc.save).not.toHaveBeenCalled();
  });
});
