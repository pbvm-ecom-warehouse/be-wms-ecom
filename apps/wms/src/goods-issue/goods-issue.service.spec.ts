import { Types } from 'mongoose';
import { GoodsIssueService } from './goods-issue.service';
import { GoodsIssueStatus } from './schemas/goods-issue.schema';

const makeRepo = () => ({
  findByOrderId: jest.fn(),
  createGoodsIssue: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  decrementRemainingQty: jest.fn(),
  markConfirmedIfAllDone: jest.fn(),
});

const makeStockRepo = () => ({
  findItemBySku: jest.fn(),
  findItemById: jest.fn(),
  findItemByBarcode: jest.fn(),
  findInventory: jest.fn(),
  upsertInventory: jest.fn(),
  upsertBalance: jest.fn(),
  insertMovement: jest.fn(),
  findAvailableStockForPick: jest.fn(),
});

const makeWarehouseRepo = () => ({
  findShelfByCode: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeQueue = () => ({
  add: jest.fn(),
});

describe('GoodsIssueService', () => {
  let svc: GoodsIssueService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let warehouseRepo: ReturnType<typeof makeWarehouseRepo>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let queue: ReturnType<typeof makeQueue>;

  const actorId = new Types.ObjectId().toString();
  const orderId = 'order-1';
  const warehouseId = new Types.ObjectId();
  const itemId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    warehouseRepo = makeWarehouseRepo();
    txHelper = makeTxHelper();
    queue = makeQueue();
    svc = new GoodsIssueService(
      repo as never,
      stockRepo as never,
      warehouseRepo as never,
      txHelper as never,
      queue as never,
    );
  });

  describe('createFromOrderReady', () => {
    it('bỏ qua nếu đã có GoodsIssue cho orderId này (idempotent)', async () => {
      repo.findByOrderId.mockResolvedValue({ _id: 'gi1' });
      await svc.createFromOrderReady(orderId, warehouseId.toString(), [
        { sku: 'SKU-1', quantity: 5 },
      ]);
      expect(repo.createGoodsIssue).not.toHaveBeenCalled();
    });

    it('bỏ qua dòng sku không khớp WarehouseItem, vẫn tạo phiếu với dòng hợp lệ', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      stockRepo.findItemBySku.mockImplementation((sku: string) =>
        sku === 'SKU-1'
          ? Promise.resolve({ _id: itemId, sku: 'SKU-1' })
          : Promise.resolve(null),
      );
      await svc.createFromOrderReady(orderId, warehouseId.toString(), [
        { sku: 'SKU-1', quantity: 5 },
        { sku: 'SKU-UNKNOWN', quantity: 3 },
      ]);
      expect(repo.createGoodsIssue).toHaveBeenCalledWith(orderId, warehouseId, [
        { itemId, sku: 'SKU-1', quantity: 5 },
      ]);
    });

    it('không tạo phiếu nếu không có dòng nào khớp sku', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      stockRepo.findItemBySku.mockResolvedValue(null);
      await svc.createFromOrderReady(orderId, warehouseId.toString(), [
        { sku: 'SKU-UNKNOWN', quantity: 3 },
      ]);
      expect(repo.createGoodsIssue).not.toHaveBeenCalled();
    });
  });

  describe('getPickSuggestions', () => {
    it('throw GOODS_ISSUE_NOT_FOUND khi phiếu không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        svc.getPickSuggestions('gi1', itemId.toString()),
      ).rejects.toMatchObject({ code: 'GOODS_ISSUE_NOT_FOUND' });
    });

    it('throw GOODS_ISSUE_ITEM_MISMATCH khi itemId không thuộc phiếu', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gi1',
        warehouseId,
        items: [{ itemId: new Types.ObjectId(), remainingQty: 5 }],
      });
      await expect(
        svc.getPickSuggestions('gi1', itemId.toString()),
      ).rejects.toMatchObject({ code: 'GOODS_ISSUE_ITEM_MISMATCH' });
    });

    it('gọi findAvailableStockForPick với isPerishable đúng theo WarehouseItem', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gi1',
        warehouseId,
        items: [{ itemId, remainingQty: 5 }],
      });
      stockRepo.findItemById.mockResolvedValue({ isPerishable: true });
      stockRepo.findAvailableStockForPick.mockResolvedValue([]);

      await svc.getPickSuggestions('gi1', itemId.toString());

      expect(stockRepo.findAvailableStockForPick).toHaveBeenCalledWith(
        itemId,
        warehouseId,
        true,
      );
    });
  });

  describe('confirmLine', () => {
    const giId = 'gi1';
    const shelfId = new Types.ObjectId();

    const baseGi = () => ({
      _id: giId,
      orderId,
      warehouseId,
      items: [{ itemId, sku: 'SKU-1', quantity: 20, remainingQty: 20 }],
    });

    it('throw GOODS_ISSUE_NOT_FOUND khi phiếu không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        svc.confirmLine(
          giId,
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'GOODS_ISSUE_NOT_FOUND' });
    });

    it('throw GOODS_ISSUE_ITEM_NOT_FOUND khi barcode không khớp item nào', async () => {
      repo.findById.mockResolvedValue(baseGi());
      stockRepo.findItemByBarcode.mockResolvedValue(null);
      await expect(
        svc.confirmLine(
          giId,
          { itemBarcode: 'UNKNOWN', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'GOODS_ISSUE_ITEM_NOT_FOUND' });
    });

    it('throw GOODS_ISSUE_SHELF_NOT_FOUND khi shelf code không khớp', async () => {
      repo.findById.mockResolvedValue(baseGi());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue(null);
      await expect(
        svc.confirmLine(
          giId,
          { itemBarcode: 'X', shelfCode: 'UNKNOWN', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'GOODS_ISSUE_SHELF_NOT_FOUND' });
    });

    it('throw GOODS_ISSUE_SHELF_NOT_FOUND khi shelf thuộc kho khác với phiếu', async () => {
      repo.findById.mockResolvedValue(baseGi());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId: new Types.ObjectId(),
      });
      await expect(
        svc.confirmLine(
          giId,
          { itemBarcode: 'X', shelfCode: 'OTHER-WH', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'GOODS_ISSUE_SHELF_NOT_FOUND' });
    });

    it('throw GOODS_ISSUE_ITEM_MISMATCH khi item không thuộc phiếu', async () => {
      repo.findById.mockResolvedValue(baseGi());
      stockRepo.findItemByBarcode.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      await expect(
        svc.confirmLine(
          giId,
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'GOODS_ISSUE_ITEM_MISMATCH' });
    });

    it('throw GOODS_ISSUE_QTY_EXCEEDS khi quantity > remainingQty', async () => {
      repo.findById.mockResolvedValue(baseGi());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      await expect(
        svc.confirmLine(
          giId,
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 999 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'GOODS_ISSUE_QTY_EXCEEDS' });
    });

    it('throw STOCK_INSUFFICIENT khi InventoryStock tại shelf/lot không đủ', async () => {
      repo.findById.mockResolvedValue(baseGi());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 2 });
      await expect(
        svc.confirmLine(
          giId,
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'STOCK_INSUFFICIENT' });
    });

    it('throw STOCK_INSUFFICIENT khi không có InventoryStock nào tại shelf/lot đó', async () => {
      repo.findById.mockResolvedValue(baseGi());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      stockRepo.findInventory.mockResolvedValue(null);
      await expect(
        svc.confirmLine(
          giId,
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'STOCK_INSUFFICIENT' });
    });

    it('trừ onHand+reserved, ghi movement ISSUE âm, KHÔNG emit goods.issued khi còn dòng chưa xong', async () => {
      repo.findById.mockResolvedValueOnce(baseGi()).mockResolvedValueOnce({
        ...baseGi(),
        status: GoodsIssueStatus.PENDING,
      });
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 20 });
      repo.markConfirmedIfAllDone.mockResolvedValue(false);

      await svc.confirmLine(
        giId,
        { itemBarcode: 'X', shelfCode: 'A1', quantity: 12 },
        actorId,
      );

      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        itemId,
        warehouseId,
        shelfId,
        null,
        -12,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        warehouseId,
        -12,
        -12,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId,
          warehouseId,
          shelfId,
          type: 'ISSUE',
          quantity: -12,
          refType: 'goods_issue',
        }),
        expect.anything(),
      );
      expect(repo.decrementRemainingQty).toHaveBeenCalledWith(
        giId,
        itemId,
        12,
        expect.anything(),
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('emit goods.issued đúng 1 lần khi markConfirmedIfAllDone trả true', async () => {
      repo.findById.mockResolvedValueOnce(baseGi()).mockResolvedValueOnce({
        ...baseGi(),
        status: GoodsIssueStatus.CONFIRMED,
      });
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 20 });
      repo.markConfirmedIfAllDone.mockResolvedValue(true);

      await svc.confirmLine(
        giId,
        { itemBarcode: 'X', shelfCode: 'A1', quantity: 20 },
        actorId,
      );

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        'goods.issued',
        { orderId, goodsIssueId: giId },
        { jobId: `goods_issue:${giId}` },
      );
    });
  });

  describe('listGoodsIssues', () => {
    it('ủy quyền cho repo.findAll', async () => {
      repo.findAll.mockResolvedValue({ data: [], total: 0 });
      const result = await svc.listGoodsIssues({});
      expect(repo.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('getGoodsIssue', () => {
    it('throw GOODS_ISSUE_NOT_FOUND khi không tìm thấy', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.getGoodsIssue('gi1')).rejects.toMatchObject({
        code: 'GOODS_ISSUE_NOT_FOUND',
      });
    });

    it('trả về document khi tìm thấy', async () => {
      const doc = { _id: 'gi1' };
      repo.findById.mockResolvedValue(doc);
      const result = await svc.getGoodsIssue('gi1');
      expect(result).toBe(doc);
    });
  });
});
