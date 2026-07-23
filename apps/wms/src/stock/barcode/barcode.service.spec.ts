import { Types } from 'mongoose';
import { BarcodeService, isMongoDuplicateKeyError } from './barcode.service';
import { BarcodeKind } from '../schemas/barcode-registry.schema';

const makeRepo = () => ({
  nextSequence: jest.fn(),
  insertRegistryEntry: jest.fn(),
  findByCode: jest.fn(),
  deleteByCode: jest.fn(),
});

const fakeSession = {} as never;

describe('isMongoDuplicateKeyError', () => {
  it('nhận diện đúng lỗi Mongo 11000', () => {
    expect(isMongoDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isMongoDuplicateKeyError({ code: 12345 })).toBe(false);
    expect(isMongoDuplicateKeyError(new Error('other'))).toBe(false);
  });
});

describe('BarcodeService', () => {
  let svc: BarcodeService;
  let repo: ReturnType<typeof makeRepo>;
  const itemId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    svc = new BarcodeService(repo as never);
  });

  describe('generateAndReservePrimaryBarcode', () => {
    it('sinh EAN-13 hợp lệ (13 ký tự, prefix 20) và ghi registry PRIMARY', async () => {
      repo.nextSequence.mockResolvedValue(1);
      repo.insertRegistryEntry.mockResolvedValue(undefined);

      const code = await svc.generateAndReservePrimaryBarcode(
        itemId,
        fakeSession,
      );

      expect(code).toHaveLength(13);
      expect(code.startsWith('20')).toBe(true);
      expect(repo.insertRegistryEntry).toHaveBeenCalledWith(
        code,
        itemId,
        BarcodeKind.PRIMARY,
        fakeSession,
      );
    });

    it('2 lần gọi liên tiếp (sequence khác nhau) → 2 mã khác nhau', async () => {
      repo.nextSequence.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      repo.insertRegistryEntry.mockResolvedValue(undefined);

      const a = await svc.generateAndReservePrimaryBarcode(itemId, fakeSession);
      const b = await svc.generateAndReservePrimaryBarcode(itemId, fakeSession);

      expect(a).not.toBe(b);
    });

    it('retry khi gặp 11000 (race hiếm), thành công ở lần thử lại', async () => {
      repo.nextSequence.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      repo.insertRegistryEntry
        .mockRejectedValueOnce({ code: 11000 })
        .mockResolvedValueOnce(undefined);

      const code = await svc.generateAndReservePrimaryBarcode(
        itemId,
        fakeSession,
      );

      expect(code).toHaveLength(13);
      expect(repo.nextSequence).toHaveBeenCalledTimes(2);
    });

    it('throw STOCK_ITEM_BARCODE_CONFLICT sau 3 lần retry 11000 liên tiếp', async () => {
      repo.nextSequence.mockResolvedValue(1);
      repo.insertRegistryEntry.mockRejectedValue({ code: 11000 });

      await expect(
        svc.generateAndReservePrimaryBarcode(itemId, fakeSession),
      ).rejects.toMatchObject({ code: 'STOCK_ITEM_BARCODE_CONFLICT' });
    });

    it('lỗi khác 11000 → ném thẳng ra, không nuốt lỗi', async () => {
      repo.nextSequence.mockResolvedValue(1);
      const boom = new Error('mongo down');
      repo.insertRegistryEntry.mockRejectedValue(boom);

      await expect(
        svc.generateAndReservePrimaryBarcode(itemId, fakeSession),
      ).rejects.toBe(boom);
    });
  });

  describe('findItemIdByCode', () => {
    it('trả itemId khi tìm thấy', async () => {
      repo.findByCode.mockResolvedValue({ itemId });
      const result = await svc.findItemIdByCode('2000000000015');
      expect(result).toEqual(itemId);
    });

    it('trả null khi không tìm thấy', async () => {
      repo.findByCode.mockResolvedValue(null);
      const result = await svc.findItemIdByCode('nope');
      expect(result).toBeNull();
    });
  });
});
