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
});

const makeStockRepo = () => ({
  findInventoryByScope: jest.fn(),
  upsertInventory: jest.fn(),
  upsertBalance: jest.fn(),
  insertMovement: jest.fn(),
  findSkuById: jest.fn(),
});

const makeWarehouseRepo = () => ({
  findWarehouseById: jest.fn(),
  findZoneById: jest.fn(),
  findShelfIdsByZone: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeStockQueue = () => ({ add: jest.fn() });

describe('StockCountService', () => {
  let svc: StockCountService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let warehouseRepo: ReturnType<typeof makeWarehouseRepo>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let stockQueue: ReturnType<typeof makeStockQueue>;

  const actorId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId();
  const zoneId = new Types.ObjectId();
  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    warehouseRepo = makeWarehouseRepo();
    txHelper = makeTxHelper();
    stockQueue = makeStockQueue();
    svc = new StockCountService(
      repo as never,
      stockRepo as never,
      warehouseRepo as never,
      txHelper as never,
      stockQueue as never,
    );
  });

  describe('createStockCount', () => {
    it('tạo phiếu toàn kho khi không truyền zoneId, dòng lấy từ InventoryStock', async () => {
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      stockRepo.findInventoryByScope.mockResolvedValue([
        { itemId, shelfId, lotId: null, quantity: 50 },
      ]);
      stockRepo.findSkuById = jest.fn().mockResolvedValue({ sku: 'SKU-1' });
      repo.createStockCount.mockResolvedValue({ _id: 'sc1' });

      await svc.createStockCount(
        { warehouseId: warehouseId.toString() },
        actorId,
      );

      expect(warehouseRepo.findShelfIdsByZone).not.toHaveBeenCalled();
      expect(stockRepo.findInventoryByScope).toHaveBeenCalledWith(
        warehouseId,
        undefined,
      );
      expect(repo.createStockCount).toHaveBeenCalledWith(
        warehouseId,
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
      );
    });

    it('lọc theo zoneId khi có truyền — dùng findShelfIdsByZone trước', async () => {
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findZoneById.mockResolvedValue({
        _id: zoneId,
        warehouseId,
      });
      warehouseRepo.findShelfIdsByZone.mockResolvedValue([shelfId]);
      stockRepo.findInventoryByScope.mockResolvedValue([
        { itemId, shelfId, lotId: null, quantity: 30 },
      ]);
      stockRepo.findSkuById = jest.fn().mockResolvedValue({ sku: 'SKU-1' });
      repo.createStockCount.mockResolvedValue({ _id: 'sc1' });

      await svc.createStockCount(
        { warehouseId: warehouseId.toString(), zoneId: zoneId.toString() },
        actorId,
      );

      expect(stockRepo.findInventoryByScope).toHaveBeenCalledWith(warehouseId, [
        shelfId,
      ]);
    });

    it('phạm vi trống (không có InventoryStock nào) → throw STOCK_COUNT_EMPTY_SCOPE', async () => {
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      stockRepo.findInventoryByScope.mockResolvedValue([]);

      await expect(
        svc.createStockCount({ warehouseId: warehouseId.toString() }, actorId),
      ).rejects.toThrow();
      expect(repo.createStockCount).not.toHaveBeenCalled();
    });

    it('không tìm thấy warehouse → throw WAREHOUSE_NOT_FOUND, không tạo phiếu', async () => {
      warehouseRepo.findWarehouseById.mockResolvedValue(null);

      await expect(
        svc.createStockCount({ warehouseId: warehouseId.toString() }, actorId),
      ).rejects.toThrow();
      expect(repo.createStockCount).not.toHaveBeenCalled();
    });

    it('zoneId thuộc warehouse khác → throw ZONE_NOT_FOUND, không tạo phiếu', async () => {
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      const otherWarehouseId = new Types.ObjectId();
      warehouseRepo.findZoneById.mockResolvedValue({
        _id: zoneId,
        warehouseId: otherWarehouseId,
      });

      await expect(
        svc.createStockCount(
          { warehouseId: warehouseId.toString(), zoneId: zoneId.toString() },
          actorId,
        ),
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
      );
      expect(repo.markCompletedIfAllCounted).toHaveBeenCalledWith('sc1');
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

    it('duyệt dòng lệch dương → onHand/InventoryStock += delta, ghi ADJUST, bắn stock.changed', async () => {
      repo.findById.mockResolvedValue({
        _id: new Types.ObjectId('665f1a2b3c4d5e6f7a8b9c99'),
        warehouseId,
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
        warehouseId,
        shelfId,
        null,
        5,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        warehouseId,
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
      expect(repo.setApproved).toHaveBeenCalledWith(
        'sc1',
        expect.anything(),
        'Duyệt',
        expect.anything(),
      );
    });

    it('mọi dòng delta=0 → set APPROVED nhưng không ghi movement/event nào', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sc1',
        warehouseId,
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
      expect(repo.setApproved).toHaveBeenCalled();
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
      const query = { warehouseId: warehouseId.toString(), page: 1, limit: 20 };
      const result = {
        data: [{ _id: 'sc1' }, { _id: 'sc2' }],
        total: 2,
      };
      repo.findAll.mockResolvedValue(result);

      const actual = await svc.listStockCounts(query as never);

      expect(actual).toBe(result);
      expect(repo.findAll).toHaveBeenCalledWith(query);
    });
  });
});
