import { Types } from 'mongoose';
import {
  AttributeOptionService,
  suggestCodeFromName,
} from './attribute-option.service';
import { AttributeOptionKey } from '../schemas/attribute-option.schema';

const makeRepo = () => ({
  findByKey: jest.fn(),
  findById: jest.fn(),
  findByKeyAndCode: jest.fn(),
  findByIds: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
});

describe('suggestCodeFromName', () => {
  it('bỏ dấu, uppercase, ghép chữ cái đầu mỗi từ, tối đa 6 ký tự', () => {
    expect(suggestCodeFromName('Trong suốt')).toBe('TS');
    expect(suggestCodeFromName('Trái Tim')).toBe('TT');
    expect(suggestCodeFromName('Đường nâu')).toBe('DN');
  });

  it('từ đơn dài → cắt 6 ký tự đầu, bỏ dấu, uppercase', () => {
    expect(suggestCodeFromName('Matcha')).toBe('MATCHA');
    expect(suggestCodeFromName('Chocolate')).toBe('CHOCOL');
  });

  it('loại ký tự không phải chữ/số', () => {
    expect(suggestCodeFromName('Ly 500ml!')).toBe('L5');
  });
});

describe('AttributeOptionService', () => {
  let svc: AttributeOptionService;
  let repo: ReturnType<typeof makeRepo>;
  const actorId = new Types.ObjectId().toString();

  beforeEach(() => {
    repo = makeRepo();
    svc = new AttributeOptionService(repo as never);
  });

  describe('create', () => {
    const dto = {
      key: AttributeOptionKey.COLOR,
      name: 'Trong suốt',
      code: 'CLR',
    };

    it('tạo option mới khi code chưa tồn tại trong key', async () => {
      repo.findByKeyAndCode.mockResolvedValue(null);
      repo.create.mockResolvedValue({ _id: new Types.ObjectId(), ...dto });

      await svc.create(dto, actorId);

      expect(repo.findByKeyAndCode).toHaveBeenCalledWith(
        AttributeOptionKey.COLOR,
        'CLR',
      );
      expect(repo.create).toHaveBeenCalledWith(
        dto,
        new Types.ObjectId(actorId),
      );
    });

    it('throw STOCK_ATTRIBUTE_CODE_CONFLICT khi code đã tồn tại trong cùng key', async () => {
      repo.findByKeyAndCode.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(svc.create(dto, actorId)).rejects.toMatchObject({
        code: 'STOCK_ATTRIBUTE_CODE_CONFLICT',
      });
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const id = new Types.ObjectId().toString();

    it('throw STOCK_ATTRIBUTE_CODE_IMMUTABLE khi cố đổi code', async () => {
      repo.findById.mockResolvedValue({
        _id: id,
        key: AttributeOptionKey.COLOR,
        code: 'CLR',
      });

      await expect(
        svc.update(id, { code: 'NEW' } as never, actorId),
      ).rejects.toMatchObject({ code: 'STOCK_ATTRIBUTE_CODE_IMMUTABLE' });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('cho phép đổi name/isActive/sortOrder (không đụng code)', async () => {
      repo.findById.mockResolvedValue({
        _id: id,
        key: AttributeOptionKey.COLOR,
        code: 'CLR',
      });
      repo.update.mockResolvedValue({ _id: id, name: 'Đỏ' });

      await svc.update(id, { name: 'Đỏ' } as never, actorId);

      expect(repo.update).toHaveBeenCalledWith(
        id,
        { name: 'Đỏ' },
        new Types.ObjectId(actorId),
      );
    });

    it('throw STOCK_ATTRIBUTE_OPTION_NOT_FOUND khi id không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        svc.update(id, { name: 'x' } as never, actorId),
      ).rejects.toMatchObject({ code: 'STOCK_ATTRIBUTE_OPTION_NOT_FOUND' });
    });
  });
});
