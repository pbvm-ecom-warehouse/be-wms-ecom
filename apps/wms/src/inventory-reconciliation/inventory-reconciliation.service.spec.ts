import { Types } from 'mongoose';
import { InventoryReconciliationService } from './inventory-reconciliation.service';

describe('InventoryReconciliationService', () => {
  const session = {} as never;
  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();
  const cellId = new Types.ObjectId();
  const inventoryId = new Types.ObjectId();
  const actorId = new Types.ObjectId().toString();
  const dto = {
    inventoryId: inventoryId.toString(),
    cellBarcode: 'R01-T1-B2',
    packageCount: 2,
    packageFactor: 10,
    packageDepthCm: 40,
    packageWidthCm: 30,
    packageHeightCm: 20,
    packageVolumeCm3: 24000,
  };

  const stockRepo = {
    decrementUnassignedInventory: jest.fn(),
    findInventoryById: jest.fn(),
    findOccupiedVolumeForCell: jest.fn(),
    findUnassignedInventoryRows: jest.fn(),
    getInventoryCellProgress: jest.fn(),
    upsertInventory: jest.fn(),
  };
  const locationRepo = {
    findCellByCode: jest.fn(),
    lockActiveCellForInventory: jest.fn(),
  };
  const txHelper = {
    withStockTransaction: jest.fn((work: (session: never) => unknown) =>
      work(session),
    ),
  };
  const assignmentModel = { create: jest.fn() };
  const service = new InventoryReconciliationService(
    stockRepo as never,
    locationRepo as never,
    txHelper as never,
    assignmentModel as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    stockRepo.getInventoryCellProgress.mockResolvedValue({
      assignedBaseQty: 80,
      unassignedBaseQty: 20,
    });
    stockRepo.findInventoryById.mockResolvedValue({
      _id: inventoryId,
      itemId,
      shelfId,
      lotId: null,
      cellId: null,
      quantity: 50,
      packageCount: 5,
      packageFactor: 10,
    });
    locationRepo.findCellByCode.mockResolvedValue({ _id: cellId });
    locationRepo.lockActiveCellForInventory.mockResolvedValue({
      _id: cellId,
      shelfId,
      innerDepth: 100,
      innerWidth: 100,
      innerHeight: 100,
      fillFactor: 0.75,
    });
    stockRepo.findOccupiedVolumeForCell.mockResolvedValue(0);
    stockRepo.decrementUnassignedInventory.mockResolvedValue({ quantity: 30 });
    stockRepo.upsertInventory.mockResolvedValue({});
    assignmentModel.create.mockResolvedValue([]);
  });

  it('tính tiến độ và chỉ bắt buộc quét khi đã hết tồn UNASSIGNED', async () => {
    await expect(service.getProgress()).resolves.toEqual({
      assignedBaseQty: 80,
      unassignedBaseQty: 20,
      assignedPercent: 80,
      requiresCellScan: false,
    });
  });

  it('chuyển đúng số thùng sang cell, giữ tổng base quantity và chỉ ghi audit assignment', async () => {
    await service.assign(dto, actorId);

    expect(stockRepo.decrementUnassignedInventory).toHaveBeenCalledWith(
      dto.inventoryId,
      20,
      2,
      session,
    );
    expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
      itemId,
      shelfId,
      null,
      20,
      session,
      expect.objectContaining({
        cellId,
        packageCount: 2,
        packageFactor: 10,
        packageVolumeCm3Snapshot: 24000,
      }),
    );
    expect(assignmentModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({ quantity: 20, packageCount: 2, cellId })],
      { session },
    );
  });

  it('rollback trước khi trừ nguồn nếu khoang không đủ thể tích', async () => {
    stockRepo.findOccupiedVolumeForCell.mockResolvedValue(740000);

    await expect(service.assign(dto, actorId)).rejects.toMatchObject({
      code: 'STORAGE_CELL_CAPACITY_EXCEEDED',
    });
    expect(stockRepo.decrementUnassignedInventory).not.toHaveBeenCalled();
    expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
  });
});
