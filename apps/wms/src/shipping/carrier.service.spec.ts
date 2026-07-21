import { Types } from 'mongoose';
import { CarrierService } from './carrier.service';
import { CarrierStatus } from './schemas/carrier.schema';

const makeRepo = () => ({
  findById: jest.fn(),
  findByCode: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  findAll: jest.fn(),
});

describe('CarrierService', () => {
  let svc: CarrierService;
  let repo: ReturnType<typeof makeRepo>;
  const actorId = new Types.ObjectId().toString();

  beforeEach(() => {
    repo = makeRepo();
    svc = new CarrierService(repo as never);
  });

  describe('create', () => {
    it('throw CARRIER_CODE_CONFLICT nếu code đã tồn tại', async () => {
      repo.findByCode.mockResolvedValue({ _id: 'c1' });
      await expect(
        svc.create({ name: 'GHN', code: 'GHN' }, actorId),
      ).rejects.toMatchObject({ code: 'CARRIER_CODE_CONFLICT' });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('tạo carrier mới khi code chưa tồn tại', async () => {
      repo.findByCode.mockResolvedValue(null);
      repo.create.mockResolvedValue({ _id: 'c1', code: 'GHN' });
      const result = await svc.create({ name: 'GHN', code: 'GHN' }, actorId);
      expect(repo.create).toHaveBeenCalledWith({
        name: 'GHN',
        code: 'GHN',
        contactInfo: undefined,
        note: undefined,
        createdBy: new Types.ObjectId(actorId),
      });
      expect(result).toEqual({ _id: 'c1', code: 'GHN' });
    });
  });

  describe('update', () => {
    it('throw CARRIER_NOT_FOUND nếu carrier không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        svc.update('c1', { status: CarrierStatus.INACTIVE }, actorId),
      ).rejects.toMatchObject({ code: 'CARRIER_NOT_FOUND' });
    });

    it('cập nhật carrier khi tồn tại', async () => {
      repo.findById.mockResolvedValue({ _id: 'c1' });
      repo.update.mockResolvedValue({
        _id: 'c1',
        status: CarrierStatus.INACTIVE,
      });
      const result = await svc.update(
        'c1',
        { status: CarrierStatus.INACTIVE },
        actorId,
      );
      expect(repo.update).toHaveBeenCalledWith('c1', {
        status: CarrierStatus.INACTIVE,
        updatedBy: new Types.ObjectId(actorId),
      });
      expect(result).toEqual({ _id: 'c1', status: CarrierStatus.INACTIVE });
    });
  });

  describe('getById', () => {
    it('throw CARRIER_NOT_FOUND nếu không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.getById('c1')).rejects.toMatchObject({
        code: 'CARRIER_NOT_FOUND',
      });
    });
  });

  describe('list', () => {
    it('ủy quyền cho repo.findAll', async () => {
      repo.findAll.mockResolvedValue({ data: [], total: 0 });
      const result = await svc.list({});
      expect(repo.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual({ data: [], total: 0 });
    });
  });
});
