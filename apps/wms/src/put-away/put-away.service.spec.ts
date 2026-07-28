import { Types } from 'mongoose';
import { PutAwayService } from './put-away.service';

const packageSpec = {
  unit: 'thùng',
  factor: 10,
  depthCm: 10,
  widthCm: 10,
  heightCm: 10,
  volumeCm3: 1000,
};

describe('PutAwayService theo khoang', () => {
  const actorId = new Types.ObjectId().toString();
  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();
  const stagingShelfId = new Types.ObjectId();
  const taskSourceShelfId = new Types.ObjectId();
  const cellId = new Types.ObjectId();
  const taskId = new Types.ObjectId().toString();

  const repo = {
    findTaskById: jest.fn(),
    decrementRemainingQty: jest.fn(),
    markCompletedIfAllDone: jest.fn(),
    createTask: jest.fn(),
    findTasks: jest.fn(),
  };
  const stockRepo = {
    findItemByIdDocument: jest.fn(),
    findOccupiedVolumeForCell: jest.fn(),
    decrementInventoryIfAvailable: jest.fn(),
    upsertInventory: jest.fn(),
    insertMovement: jest.fn(),
  };
  const locationRepo = {
    findCellByCode: jest.fn(),
    findShelfById: jest.fn(),
    findShelfByCode: jest.fn(),
    lockActiveCellForInventory: jest.fn(),
    lockActiveShelfForInventory: jest.fn(),
  };
  const locationService = { findStagingShelf: jest.fn() };
  const tx = {
    withStockTransaction: jest.fn((fn: (session: object) => unknown) => fn({})),
  };
  const barcode = { findItemIdByCode: jest.fn() };

  let service: PutAwayService;

  // remainingQty giờ luôn là số thùng nguyên (không còn quy đổi qua factor).
  const task = () => ({
    _id: new Types.ObjectId(taskId),
    items: [
      {
        itemId,
        lotId: null,
        remainingQty: 5,
        packageSpec,
      },
    ],
  });
  const cell = () => ({
    _id: cellId,
    shelfId,
    rackId: new Types.ObjectId(),
    innerDepth: 100,
    innerWidth: 100,
    innerHeight: 100,
    fillFactor: 1,
  });
  const shelf = () => ({ _id: shelfId, isStaging: false });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PutAwayService(
      repo as never,
      stockRepo as never,
      locationRepo as never,
      locationService as never,
      tx as never,
      barcode as never,
    );
    repo.findTaskById.mockResolvedValue(task());
    barcode.findItemIdByCode.mockResolvedValue(itemId);
    stockRepo.findItemByIdDocument.mockResolvedValue({
      _id: itemId,
      isPerishable: false,
    });
    locationRepo.findCellByCode.mockResolvedValue(cell());
    locationRepo.findShelfById.mockResolvedValue(shelf());
    locationRepo.lockActiveCellForInventory.mockResolvedValue(cell());
    locationRepo.lockActiveShelfForInventory.mockResolvedValue(shelf());
    locationService.findStagingShelf.mockResolvedValue({ _id: stagingShelfId });
    stockRepo.findOccupiedVolumeForCell.mockResolvedValue(0);
    stockRepo.decrementInventoryIfAvailable.mockResolvedValue({ quantity: 3 });
    repo.decrementRemainingQty.mockResolvedValue(task());
    repo.findTaskById.mockResolvedValueOnce(task()).mockResolvedValue(task());
  });

  it('chặn barcode hàng không thuộc hệ thống', async () => {
    barcode.findItemIdByCode.mockResolvedValue(null);

    await expect(
      service.confirmLine(
        taskId,
        { itemBarcode: 'WRONG', cellBarcode: 'R1-T1-B1', quantity: 1 },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'PUTAWAY_ITEM_NOT_FOUND' });
  });

  it('bắt buộc quét barcode khoang thật', async () => {
    locationRepo.findCellByCode.mockResolvedValue(null);

    await expect(
      service.confirmLine(
        taskId,
        { itemBarcode: 'SKU-1', cellBarcode: 'WRONG', quantity: 1 },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'PUTAWAY_CELL_NOT_FOUND' });
  });

  it('chặn số thùng vượt phần còn phải cất', async () => {
    await expect(
      service.confirmLine(
        taskId,
        { itemBarcode: 'SKU-1', cellBarcode: 'R1-T1-B1', quantity: 6 },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'PUTAWAY_QTY_EXCEEDS' });
  });

  it('chặn khoang không còn đủ thể tích kể cả khi receiver override gợi ý', async () => {
    stockRepo.findOccupiedVolumeForCell.mockResolvedValue(999_500);

    await expect(
      service.confirmLine(
        taskId,
        { itemBarcode: 'SKU-1', cellBarcode: 'R1-T1-B1', quantity: 1 },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'PUTAWAY_CELL_CAPACITY_EXCEEDED' });
  });

  it('chuyển staging sang đúng cell, giữ onHand và ghi audit override', async () => {
    const suggestedCellId = new Types.ObjectId().toString();

    await service.confirmLine(
      taskId,
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
      stagingShelfId,
      null,
      null,
      2,
      expect.anything(),
    );
    expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
      itemId,
      shelfId,
      null,
      2,
      expect.anything(),
      expect.objectContaining({
        cellId,
        packageFactor: 10,
        packageVolumeCm3Snapshot: 1000,
      }),
    );
    expect(stockRepo.insertMovement).toHaveBeenCalledTimes(2);
    expect(stockRepo.insertMovement).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cellId,
        suggestedCellId: new Types.ObjectId(suggestedCellId),
        actualCellId: cellId,
        isOverride: true,
        quantity: 2,
      }),
      expect.anything(),
    );
    expect(repo.decrementRemainingQty).toHaveBeenCalledWith(
      taskId,
      itemId,
      null,
      2,
      expect.anything(),
    );
    expect(
      (stockRepo as Record<string, unknown>).upsertBalance,
    ).toBeUndefined();
  });
  it('dùng nguồn nhận tạm đã snapshot trong task thay vì cấu hình staging hiện tại', async () => {
    repo.findTaskById
      .mockReset()
      .mockResolvedValue({ ...task(), sourceShelfId: taskSourceShelfId });
    locationService.findStagingShelf.mockRejectedValue(
      new Error('staging hiện tại không còn được cấu hình'),
    );

    await service.confirmLine(
      taskId,
      {
        itemBarcode: 'SKU-1',
        cellBarcode: 'R1-T1-B1',
        quantity: 1,
      },
      actorId,
    );

    expect(locationService.findStagingShelf).not.toHaveBeenCalled();
    expect(stockRepo.decrementInventoryIfAvailable).toHaveBeenCalledWith(
      itemId,
      taskSourceShelfId,
      null,
      null,
      1,
      expect.anything(),
    );
  });
});
