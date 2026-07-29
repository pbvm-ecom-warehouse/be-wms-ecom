import { Types } from 'mongoose';
import { AppException } from '@app/common/errors/app.exception';
import { GoodsIssueService } from './goods-issue.service';

const path = (rackId: string, distanceM: number) => ({
  startGateCode: 'GATE-01',
  targetRackId: rackId,
  points: [
    { xM: 0, yM: 0 },
    { xM: distanceM, yM: 0 },
  ],
  distanceM,
});

describe('GoodsIssueService theo khoang và thùng nguyên', () => {
  const actorId = new Types.ObjectId().toString();
  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();
  const cellId = new Types.ObjectId();
  const giId = new Types.ObjectId().toString();
  const orderId = 'order-1';

  const repo = {
    findByOrderId: jest.fn(),
    createGoodsIssue: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    decrementRemainingQty: jest.fn(),
    markConfirmedIfAllDone: jest.fn(),
  };
  const stockRepo = {
    findItemBySku: jest.fn(),
    findItemById: jest.fn(),
    findItemByIdDocument: jest.fn(),
    findInventory: jest.fn(),
    findAvailableStockForPick: jest.fn(),
    decrementInventoryIfAvailable: jest.fn(),
    issueReservedIfAvailable: jest.fn(),
    insertMovement: jest.fn(),
  };
  const stockService = { checkAndEmitStockLow: jest.fn() };
  const locationRepo = {
    findCellByCode: jest.fn(),
    findShelfById: jest.fn(),
    lockActiveCellForInventory: jest.fn(),
  };
  const tx = {
    withStockTransaction: jest.fn((fn: (session: object) => unknown) => fn({})),
  };
  const barcode = { findItemIdByCode: jest.fn() };
  const navigation = { getPath: jest.fn() };
  const documentNumber = { next: jest.fn() };
  const shipmentQueue = { add: jest.fn() };
  const internalQueue = { add: jest.fn() };

  let service: GoodsIssueService;

  const goodsIssue = () => ({
    _id: new Types.ObjectId(giId),
    orderId,
    items: [{ itemId, sku: 'SKU-1', quantity: 5, remainingQty: 5 }],
  });
  const cell = () => ({ _id: cellId, shelfId });
  // quantity giờ luôn là số thùng nguyên — không còn packageCount riêng.
  const inventory = () => ({
    quantity: 5,
    packageFactor: 10,
    packageVolumeCm3Snapshot: 1000,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GoodsIssueService(
      repo as never,
      stockRepo as never,
      stockService as never,
      locationRepo as never,
      tx as never,
      barcode as never,
      navigation as never,
      documentNumber as never,
      shipmentQueue as never,
      internalQueue as never,
    );
    repo.findById.mockResolvedValue(goodsIssue());
    repo.findByOrderId.mockResolvedValue(null);
    repo.createGoodsIssue.mockResolvedValue(goodsIssue());
    documentNumber.next.mockResolvedValue('GI-20260730-0001');
    stockRepo.findItemById.mockResolvedValue({ isPerishable: false });
    stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
    barcode.findItemIdByCode.mockResolvedValue(itemId);
    locationRepo.findCellByCode.mockResolvedValue(cell());
    locationRepo.findShelfById.mockResolvedValue({ _id: shelfId });
    locationRepo.lockActiveCellForInventory.mockResolvedValue(cell());
    stockRepo.findInventory.mockResolvedValue(inventory());
    stockRepo.decrementInventoryIfAvailable.mockResolvedValue({ quantity: 4 });
    stockRepo.issueReservedIfAvailable.mockResolvedValue(true);
    repo.decrementRemainingQty.mockResolvedValue(goodsIssue());
    repo.markConfirmedIfAllDone.mockResolvedValue(false);
  });

  it('tạo mã phiếu atomic và lưu snapshot orderCode khi nhận event', async () => {
    stockRepo.findItemBySku.mockResolvedValue({ _id: itemId });

    await service.createFromOrderReady(
      orderId,
      'ORD-20260730-0001',
      [{ sku: 'SKU-1', quantity: 5 }],
      { street: '123 Le Loi' },
      { name: 'A', phone: '0900000000' },
      'ONLINE',
      0,
    );

    expect(documentNumber.next).toHaveBeenCalledWith('GI');
    expect(repo.createGoodsIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId,
        orderCode: 'ORD-20260730-0001',
        goodsIssueNumber: 'GI-20260730-0001',
      }),
    );
  });

  it('event retry dùng phiếu đã có và không cấp mã mới', async () => {
    repo.findByOrderId.mockResolvedValue(goodsIssue());

    await service.createFromOrderReady(
      orderId,
      'ORD-20260730-0001',
      [{ sku: 'SKU-1', quantity: 5 }],
      {},
      { name: 'A', phone: '0900000000' },
      'ONLINE',
      0,
    );

    expect(documentNumber.next).not.toHaveBeenCalled();
    expect(repo.createGoodsIssue).not.toHaveBeenCalled();
  });

  it('gợi ý pick theo FEFO trước, rồi khoảng cách cho cùng hạn dùng', async () => {
    stockRepo.findItemById.mockResolvedValue({ isPerishable: true });
    const early = new Date('2026-08-01');
    const late = new Date('2026-09-01');
    stockRepo.findAvailableStockForPick.mockResolvedValue([
      {
        cellId: new Types.ObjectId(),
        cellCode: 'C-LATE',
        rackId: new Types.ObjectId('64b000000000000000000003'),
        expiryDate: late,
      },
      {
        cellId: new Types.ObjectId(),
        cellCode: 'C-FAR',
        rackId: new Types.ObjectId('64b000000000000000000002'),
        expiryDate: early,
      },
      {
        cellId: new Types.ObjectId(),
        cellCode: 'C-NEAR',
        rackId: new Types.ObjectId('64b000000000000000000001'),
        expiryDate: early,
      },
    ]);
    navigation.getPath.mockImplementation((rackId: string) =>
      Promise.resolve(
        path(rackId, rackId.endsWith('1') ? 2 : rackId.endsWith('2') ? 9 : 1),
      ),
    );

    const result = await service.getPickSuggestions(giId, itemId.toString());

    expect(result.map((entry) => entry.cellCode)).toEqual([
      'C-NEAR',
      'C-FAR',
      'C-LATE',
    ]);
    expect(result[0].path.distanceM).toBe(2);
  });

  it('bỏ vị trí không có đường điều hướng', async () => {
    stockRepo.findAvailableStockForPick.mockResolvedValue([
      {
        cellId: new Types.ObjectId(),
        cellCode: 'C1',
        rackId: new Types.ObjectId(),
      },
    ]);
    navigation.getPath.mockRejectedValue(
      new AppException('NAVIGATION_RACK_NOT_CONNECTED'),
    );

    await expect(
      service.getPickSuggestions(giId, itemId.toString()),
    ).resolves.toEqual([]);
  });

  it('bắt buộc quét đúng khoang', async () => {
    locationRepo.findCellByCode.mockResolvedValue(null);

    await expect(
      service.confirmLine(
        giId,
        { itemBarcode: 'SKU-1', cellBarcode: 'WRONG', quantity: 1 },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'GOODS_ISSUE_CELL_NOT_FOUND' });
  });

  it('chặn quantity <= 0', async () => {
    await expect(
      service.confirmLine(
        giId,
        { itemBarcode: 'SKU-1', cellBarcode: 'R1-T1-B1', quantity: 0 },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'GOODS_ISSUE_PACKAGE_COUNT_REQUIRED' });
  });

  it('rollback nghiệp vụ khi tồn cell không còn đủ tại thời điểm transaction', async () => {
    stockRepo.decrementInventoryIfAvailable.mockResolvedValue(null);

    await expect(
      service.confirmLine(
        giId,
        { itemBarcode: 'SKU-1', cellBarcode: 'R1-T1-B1', quantity: 2 },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'STOCK_INSUFFICIENT' });
    expect(stockRepo.insertMovement).not.toHaveBeenCalled();
  });

  it('trừ đúng cell và onHand/reserved, ghi audit override và phát goods.issued khi hoàn tất', async () => {
    repo.markConfirmedIfAllDone.mockResolvedValue(true);
    const suggestedCellId = new Types.ObjectId().toString();

    await service.confirmLine(
      giId,
      {
        itemBarcode: 'SKU-1',
        cellBarcode: 'R1-T1-B1',
        quantity: 2,
        suggestedCellId,
      },
      actorId,
    );

    expect(stockRepo.decrementInventoryIfAvailable).toHaveBeenCalledWith(
      itemId,
      shelfId,
      cellId,
      null,
      2,
      expect.anything(),
    );
    expect(stockRepo.issueReservedIfAvailable).toHaveBeenCalledWith(
      itemId,
      2,
      expect.anything(),
    );
    expect(stockRepo.insertMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        cellId,
        quantity: -2,
        suggestedCellId: new Types.ObjectId(suggestedCellId),
        actualCellId: cellId,
        isOverride: true,
      }),
      expect.anything(),
    );
    expect(shipmentQueue.add).toHaveBeenCalledTimes(1);
    expect(internalQueue.add).toHaveBeenCalledTimes(1);
  });
});
