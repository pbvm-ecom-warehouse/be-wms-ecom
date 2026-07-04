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
});
