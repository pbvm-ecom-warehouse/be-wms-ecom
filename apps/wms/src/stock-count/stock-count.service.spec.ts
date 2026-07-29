import { Types } from 'mongoose';
import { StockCountService } from './stock-count.service';
import { StockCountStatus } from './schemas/stock-count.schema';

const makeRepo = () => ({
  findById: jest.fn(),
  createStockCount: jest.fn(),
  findAll: jest.fn(),
  countItem: jest.fn(),
  setCountedByIfDraft: jest.fn(),
  markCompletedIfAllCounted: jest.fn(),
  setApproved: jest.fn(),
  claimApprovedIfCompleted: jest.fn(),
});

const makeStockRepo = () => ({
  findInventoryByScope: jest.fn(),
  upsertInventory: jest.fn(),
  upsertBalance: jest.fn(),
  insertMovement: jest.fn(),
  findItemsByIds: jest.fn(),
});

const makeLocationRepo = () => ({
  findZoneById: jest.fn(),
  findShelfIdsByZone: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeStockQueue = () => ({ add: jest.fn() });

const makeDocumentNumberService = () => ({
  next: jest.fn().mockResolvedValue('SC-20260730-0001'),
});

const makeStockService = () => ({ checkAndEmitStockLow: jest.fn() });

const makeCloudinaryService = () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/demo/image/upload/wms/stock-count/x.jpg',
    publicId: 'wms/stock-count/x',
  }),
});

function fakeImageFile(
  overrides: Partial<{ mimetype: string; size: number; buffer: Buffer }> = {},
) {
  return {
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('fake-image'),
    ...overrides,
  };
}

describe('StockCountService', () => {
  let svc: StockCountService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let locationRepo: ReturnType<typeof makeLocationRepo>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let stockQueue: ReturnType<typeof makeStockQueue>;
  let stockService: ReturnType<typeof makeStockService>;
  let cloudinary: ReturnType<typeof makeCloudinaryService>;
  let documentNumber: ReturnType<typeof makeDocumentNumberService>;

  const actorId = new Types.ObjectId().toString();
  const zoneId = new Types.ObjectId();
  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    locationRepo = makeLocationRepo();
    txHelper = makeTxHelper();
    stockQueue = makeStockQueue();
    stockService = makeStockService();
    cloudinary = makeCloudinaryService();
    documentNumber = makeDocumentNumberService();
    repo.claimApprovedIfCompleted.mockResolvedValue(true);
    svc = new StockCountService(
      repo as never,
      stockRepo as never,
      stockService as never,
      locationRepo as never,
      txHelper as never,
      documentNumber as never,
      stockQueue as never,
      cloudinary as never,
    );
  });

  describe('createStockCount', () => {
    it('tạo phiếu toàn kho khi không truyền zoneId, dòng lấy từ InventoryStock', async () => {
      stockRepo.findInventoryByScope.mockResolvedValue([
        { itemId, shelfId, lotId: null, quantity: 50 },
      ]);
      stockRepo.findItemsByIds.mockResolvedValue([
        { _id: itemId, sku: 'SKU-1' },
      ]);
      repo.createStockCount.mockResolvedValue({ _id: 'sc1' });

      await svc.createStockCount({}, actorId);

      expect(locationRepo.findShelfIdsByZone).not.toHaveBeenCalled();
      expect(stockRepo.findInventoryByScope).toHaveBeenCalledWith(undefined);
      expect(stockRepo.findItemsByIds).toHaveBeenCalledWith([itemId]);
      expect(repo.createStockCount).toHaveBeenCalledWith(
        null,
        undefined,
        expect.anything(),
        [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            systemQty: 50,
          },
        ],
        'SC-20260730-0001',
      );
      expect(documentNumber.next).toHaveBeenCalledWith('SC');
    });

    it('lọc theo zoneId khi có truyền — dùng findShelfIdsByZone trước', async () => {
      locationRepo.findZoneById.mockResolvedValue({ _id: zoneId });
      locationRepo.findShelfIdsByZone.mockResolvedValue([shelfId]);
      stockRepo.findInventoryByScope.mockResolvedValue([
        { itemId, shelfId, lotId: null, quantity: 30 },
      ]);
      stockRepo.findItemsByIds.mockResolvedValue([
        { _id: itemId, sku: 'SKU-1' },
      ]);
      repo.createStockCount.mockResolvedValue({ _id: 'sc1' });

      await svc.createStockCount({ zoneId: zoneId.toString() }, actorId);

      expect(stockRepo.findInventoryByScope).toHaveBeenCalledWith([shelfId]);
    });

    it('phạm vi trống (không có InventoryStock nào) → throw STOCK_COUNT_EMPTY_SCOPE', async () => {
      stockRepo.findInventoryByScope.mockResolvedValue([]);

      await expect(svc.createStockCount({}, actorId)).rejects.toThrow();
      expect(repo.createStockCount).not.toHaveBeenCalled();
    });

    it('dòng InventoryStock mồ côi (itemId không khớp WarehouseItem nào) bị bỏ qua, các dòng hợp lệ khác vẫn tạo bình thường', async () => {
      const orphanItemId = new Types.ObjectId();
      const otherShelfId = new Types.ObjectId();
      stockRepo.findInventoryByScope.mockResolvedValue([
        { itemId, shelfId, lotId: null, quantity: 50 },
        {
          itemId: orphanItemId,
          shelfId: otherShelfId,
          lotId: null,
          quantity: 10,
        },
      ]);
      // Batch chỉ trả về item hợp lệ — orphanItemId không khớp WarehouseItem nào.
      stockRepo.findItemsByIds.mockResolvedValue([
        { _id: itemId, sku: 'SKU-1' },
      ]);
      repo.createStockCount.mockResolvedValue({ _id: 'sc1' });

      await svc.createStockCount({}, actorId);

      expect(repo.createStockCount).toHaveBeenCalledWith(
        null,
        undefined,
        expect.anything(),
        [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            systemQty: 50,
          },
        ],
        'SC-20260730-0001',
      );
    });

    it('mọi dòng InventoryStock đều mồ côi → throw STOCK_COUNT_EMPTY_SCOPE, không tạo phiếu', async () => {
      const orphanItemId = new Types.ObjectId();
      stockRepo.findInventoryByScope.mockResolvedValue([
        { itemId: orphanItemId, shelfId, lotId: null, quantity: 10 },
      ]);
      stockRepo.findItemsByIds.mockResolvedValue([]);

      await expect(svc.createStockCount({}, actorId)).rejects.toThrow();
      expect(repo.createStockCount).not.toHaveBeenCalled();
    });

    it('zoneId không tồn tại → throw ZONE_NOT_FOUND, không tạo phiếu', async () => {
      locationRepo.findZoneById.mockResolvedValue(null);

      await expect(
        svc.createStockCount({ zoneId: zoneId.toString() }, actorId),
      ).rejects.toThrow();
      expect(repo.createStockCount).not.toHaveBeenCalled();
    });
  });

  describe('countItem', () => {
    it('nhập dòng đầu tiên → gọi setCountedByIfDraft rồi countItem rồi markCompletedIfAllCounted', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', shelfId, lotId: null, systemQty: 50 }],
      });
      repo.countItem.mockResolvedValue({ _id: 'sc1' });

      await svc.countItem(
        'sc1',
        itemId.toString(),
        { shelfId: shelfId.toString(), actualQty: 45, reason: 'Hao hụt' },
        actorId,
      );

      expect(repo.setCountedByIfDraft).toHaveBeenCalledWith(
        'sc1',
        expect.anything(),
      );
      expect(repo.countItem).toHaveBeenCalledWith(
        'sc1',
        itemId,
        shelfId,
        null,
        45,
        'Hao hụt',
        [],
      );
      expect(repo.markCompletedIfAllCounted).toHaveBeenCalledWith('sc1');
    });

    it('không có imageFiles → images rỗng, không gọi CloudinaryService', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', shelfId, lotId: null, systemQty: 50 }],
      });
      repo.countItem.mockResolvedValue({ _id: 'sc1' });

      await svc.countItem(
        'sc1',
        itemId.toString(),
        { shelfId: shelfId.toString(), actualQty: 45, reason: 'Hao hụt' },
        actorId,
      );

      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
      expect(repo.countItem).toHaveBeenCalledWith(
        'sc1',
        itemId,
        shelfId,
        null,
        45,
        'Hao hụt',
        [],
      );
    });

    it('có ảnh minh chứng lệch tồn → upload Cloudinary vào wms/stock-count, lưu URL', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', shelfId, lotId: null, systemQty: 50 }],
      });
      repo.countItem.mockResolvedValue({ _id: 'sc1' });

      await svc.countItem(
        'sc1',
        itemId.toString(),
        { shelfId: shelfId.toString(), actualQty: 45, reason: 'Hao hụt' },
        actorId,
        [fakeImageFile()],
      );

      expect(cloudinary.uploadImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        'wms/stock-count',
      );
      expect(repo.countItem).toHaveBeenCalledWith(
        'sc1',
        itemId,
        shelfId,
        null,
        45,
        'Hao hụt',
        ['https://res.cloudinary.com/demo/image/upload/wms/stock-count/x.jpg'],
      );
    });

    it('ảnh minh chứng sai mimetype → throw VALIDATION_FAILED, không gọi countItem', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', shelfId, lotId: null, systemQty: 50 }],
      });

      await expect(
        svc.countItem(
          'sc1',
          itemId.toString(),
          { shelfId: shelfId.toString(), actualQty: 45 },
          actorId,
          [fakeImageFile({ mimetype: 'application/pdf' })],
        ),
      ).rejects.toThrow();
      expect(repo.countItem).not.toHaveBeenCalled();
    });

    it('ảnh minh chứng vượt quá 5MB → throw VALIDATION_FAILED, không gọi countItem', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', shelfId, lotId: null, systemQty: 50 }],
      });

      await expect(
        svc.countItem(
          'sc1',
          itemId.toString(),
          { shelfId: shelfId.toString(), actualQty: 45 },
          actorId,
          [fakeImageFile({ size: 6 * 1024 * 1024 })],
        ),
      ).rejects.toThrow();
      expect(repo.countItem).not.toHaveBeenCalled();
    });

    it('phiếu đã APPROVED → throw, không gọi countItem', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.APPROVED,
        items: [],
      });

      await expect(
        svc.countItem(
          'sc1',
          itemId.toString(),
          { shelfId: shelfId.toString(), actualQty: 10 },
          actorId,
        ),
      ).rejects.toThrow();
      expect(repo.countItem).not.toHaveBeenCalled();
    });

    it('không khớp dòng nào (itemId/shelfId/lotId sai) → throw STOCK_COUNT_ITEM_MISMATCH', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', shelfId, lotId: null, systemQty: 50 }],
      });
      const otherShelf = new Types.ObjectId();

      await expect(
        svc.countItem(
          'sc1',
          itemId.toString(),
          { shelfId: otherShelf.toString(), actualQty: 10 },
          actorId,
        ),
      ).rejects.toThrow();
    });

    it('phiếu đã IN_PROGRESS (đếm lần 2 trở đi) → không gọi lại setCountedByIfDraft, vẫn countItem/markCompletedIfAllCounted bình thường', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.IN_PROGRESS,
        items: [{ itemId, sku: 'SKU-1', shelfId, lotId: null, systemQty: 50 }],
      });
      repo.countItem.mockResolvedValue({ _id: 'sc1' });

      await svc.countItem(
        'sc1',
        itemId.toString(),
        { shelfId: shelfId.toString(), actualQty: 48, reason: 'Hao hụt' },
        actorId,
      );

      expect(repo.setCountedByIfDraft).not.toHaveBeenCalled();
      expect(repo.countItem).toHaveBeenCalledWith(
        'sc1',
        itemId,
        shelfId,
        null,
        48,
        'Hao hụt',
        [],
      );
      expect(repo.markCompletedIfAllCounted).toHaveBeenCalledWith('sc1');
    });
  });

  describe('approveStockCount', () => {
    it('phiếu chưa COMPLETED → throw STOCK_COUNT_NOT_COMPLETED', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.IN_PROGRESS,
        items: [],
      });

      await expect(svc.approveStockCount('sc1', {}, actorId)).rejects.toThrow();
    });

    it('compare-and-set thua race không điều chỉnh tồn lần hai', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.COMPLETED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            delta: 5,
          },
        ],
      });
      repo.claimApprovedIfCompleted.mockResolvedValue(false);

      await expect(
        svc.approveStockCount('sc1', {}, actorId),
      ).rejects.toMatchObject({ code: 'STOCK_COUNT_ALREADY_APPROVED' });
      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
    });

    it('duyệt dòng lệch dương → onHand/InventoryStock += delta, ghi ADJUST, bắn stock.changed', async () => {
      repo.findById.mockResolvedValue({
        _id: new Types.ObjectId('665f1a2b3c4d5e6f7a8b9c99'),
        status: StockCountStatus.COMPLETED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            systemQty: 50,
            actualQty: 55,
            delta: 5,
          },
        ],
      });

      await svc.approveStockCount('sc1', { reason: 'Duyệt' }, actorId);

      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        itemId,
        shelfId,
        null,
        5,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        5,
        0,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 5, refType: 'stock_count' }),
        expect.anything(),
      );
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'SKU-1', delta: 5 },
        expect.objectContaining({ jobId: expect.any(String) }),
      );
      expect(repo.claimApprovedIfCompleted).toHaveBeenCalledWith(
        'sc1',
        expect.anything(),
        'Duyệt',
        expect.anything(),
      );
    });

    it('mọi dòng delta=0 → set APPROVED nhưng không ghi movement/event nào', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.COMPLETED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            systemQty: 50,
            actualQty: 50,
            delta: 0,
          },
        ],
      });

      await svc.approveStockCount('sc1', {}, actorId);

      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
      expect(stockRepo.insertMovement).not.toHaveBeenCalled();
      expect(stockQueue.add).not.toHaveBeenCalled();
      expect(repo.claimApprovedIfCompleted).toHaveBeenCalled();
    });

    it('approveStockCount gọi checkAndEmitStockLow cho mỗi dòng có delta ≠ 0', async () => {
      const itemId2 = new Types.ObjectId();
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.COMPLETED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            systemQty: 50,
            actualQty: 55,
            delta: 5,
          },
          {
            itemId: itemId2,
            sku: 'SKU-2',
            shelfId,
            lotId: null,
            systemQty: 20,
            actualQty: 15,
            delta: -5,
          },
          {
            itemId: new Types.ObjectId(),
            sku: 'SKU-3',
            shelfId,
            lotId: null,
            systemQty: 10,
            actualQty: 10,
            delta: 0,
          },
        ],
      });

      await svc.approveStockCount('sc1', { reason: 'Duyệt' }, actorId);

      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledTimes(2);
      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledWith(itemId);
      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledWith(itemId2);
    });

    it('approveStockCount gọi checkAndEmitStockLow 1 lần khi nhiều dòng lệch cùng itemId (dedup)', async () => {
      const otherShelfId = new Types.ObjectId();
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        status: StockCountStatus.COMPLETED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            systemQty: 50,
            actualQty: 45,
            delta: -5,
          },
          {
            // cùng itemId, khác shelf/lot (kiểm 2 vị trí của cùng 1 SKU)
            itemId,
            sku: 'SKU-1',
            shelfId: otherShelfId,
            lotId: null,
            systemQty: 20,
            actualQty: 18,
            delta: -2,
          },
        ],
      });

      await svc.approveStockCount('sc1', { reason: 'Duyệt' }, actorId);

      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledTimes(1);
      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledWith(itemId);
    });
  });

  describe('getStockCount', () => {
    it('tìm thấy phiếu → trả về document', async () => {
      const doc = { _id: 'sc1', status: StockCountStatus.DRAFT, items: [] };
      repo.findById.mockResolvedValue(doc);

      const result = await svc.getStockCount('sc1');

      expect(result).toBe(doc);
      expect(repo.findById).toHaveBeenCalledWith('sc1');
    });

    it('không tìm thấy phiếu → throw STOCK_COUNT_NOT_FOUND', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(svc.getStockCount('sc1')).rejects.toThrow();
    });
  });

  describe('listStockCounts', () => {
    it('trả về data + total từ repo.findAll, truyền nguyên query', async () => {
      const query = { page: 1, limit: 20 };
      const result = {
        data: [{ _id: 'sc1' }, { _id: 'sc2' }],
        total: 2,
      };
      repo.findAll.mockResolvedValue(result);

      const actual = await svc.listStockCounts(query);

      expect(actual).toBe(result);
      expect(repo.findAll).toHaveBeenCalledWith(query);
    });
  });
});
