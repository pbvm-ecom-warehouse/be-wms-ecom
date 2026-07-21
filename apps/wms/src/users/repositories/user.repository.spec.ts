import { UserRepository } from './user.repository';
import { UserStatus } from '../schemas/user.schema';

const makeModel = () => {
  const exec = jest.fn();
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec,
  };
  return {
    find: jest.fn().mockReturnValue(chain),
    countDocuments: jest.fn().mockReturnValue({ exec: jest.fn() }),
    updateOne: jest.fn().mockReturnValue({ exec: jest.fn() }),
    __chain: chain,
  };
};

describe('UserRepository', () => {
  describe('findAll', () => {
    it('build $or filter khi có search', async () => {
      const model = makeModel();
      model.__chain.exec.mockResolvedValue([]);
      (model.countDocuments({}).exec as jest.Mock).mockResolvedValue(0);
      const repo = new UserRepository(model as never);

      await repo.findAll({ page: 1, limit: 20, search: 'phuong' });

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: null,
          $or: [
            { username: { $regex: 'phuong', $options: 'i' } },
            { name: { $regex: 'phuong', $options: 'i' } },
            { email: { $regex: 'phuong', $options: 'i' } },
          ],
        }),
      );
    });

    it('escape regex đặc biệt trong search trước khi đưa vào $regex', async () => {
      const model = makeModel();
      model.__chain.exec.mockResolvedValue([]);
      (model.countDocuments({}).exec as jest.Mock).mockResolvedValue(0);
      const repo = new UserRepository(model as never);

      await repo.findAll({ page: 1, limit: 20, search: 'a.b+c' });

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: null,
          $or: [
            { username: { $regex: 'a\\.b\\+c', $options: 'i' } },
            { name: { $regex: 'a\\.b\\+c', $options: 'i' } },
            { email: { $regex: 'a\\.b\\+c', $options: 'i' } },
          ],
        }),
      );
    });

    it('filter theo role/status/warehouseId khi có truyền', async () => {
      const model = makeModel();
      model.__chain.exec.mockResolvedValue([]);
      (model.countDocuments({}).exec as jest.Mock).mockResolvedValue(0);
      const repo = new UserRepository(model as never);

      await repo.findAll({
        page: 2,
        limit: 10,
        role: 'PICKER',
        status: UserStatus.LOCKED,
        warehouseId: 'wh1',
      });

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: null,
          roles: 'PICKER',
          status: UserStatus.LOCKED,
          warehouseId: 'wh1',
        }),
      );
      expect(model.__chain.skip).toHaveBeenCalledWith(10); // (page-1)*limit
      expect(model.__chain.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('softDelete', () => {
    it('trả true khi modifiedCount > 0', async () => {
      const model = makeModel();
      (model.updateOne({}, {}).exec as jest.Mock).mockResolvedValue({
        modifiedCount: 1,
      });
      const repo = new UserRepository(model as never);

      await expect(repo.softDelete('u1', 'actor1' as never)).resolves.toBe(
        true,
      );
    });

    it('trả false khi không tìm thấy user để xóa', async () => {
      const model = makeModel();
      (model.updateOne({}, {}).exec as jest.Mock).mockResolvedValue({
        modifiedCount: 0,
      });
      const repo = new UserRepository(model as never);

      await expect(repo.softDelete('missing', 'actor1' as never)).resolves.toBe(
        false,
      );
    });
  });
});
