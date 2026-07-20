import { Types } from 'mongoose';
import { ExpiredLotScanService } from './expired-lot-scan.service';
import { LotStatus } from './schemas/lot.schema';

describe('ExpiredLotScanService', () => {
  let svc: ExpiredLotScanService;
  let lotModel: { find: jest.Mock; updateOne: jest.Mock };
  let stockRepo: { sumInventoryByLot: jest.Mock; upsertBalance: jest.Mock };
  let stockTransactionHelper: { withStockTransaction: jest.Mock };
  let stockQueue: { add: jest.Mock };

  const lotId = new Types.ObjectId();
  const itemId = new Types.ObjectId();
  const warehouseId = new Types.ObjectId();

  beforeEach(() => {
    lotModel = {
      find: jest.fn().mockReturnValue({ exec: jest.fn() }),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn() }),
    };
    stockRepo = {
      sumInventoryByLot: jest.fn(),
      upsertBalance: jest.fn(),
    };
    stockTransactionHelper = {
      withStockTransaction: jest
        .fn()
        .mockImplementation((fn: (session: unknown) => unknown) => fn({})),
    };
    stockQueue = { add: jest.fn() };

    svc = new ExpiredLotScanService(
      lotModel as never,
      stockRepo as never,
      stockTransactionHelper as never,
      stockQueue as never,
    );
  });

  describe('scanExpiredLots', () => {
    it('1 lô hết hạn, tồn ở 1 kho → tăng expired 1 lần, phát 1 job stock.expired', async () => {
      lotModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: lotId }]),
      });
      stockRepo.sumInventoryByLot.mockResolvedValue([
        { itemId, warehouseId, sku: 'SKU-1', qty: 5 },
      ]);

      await svc.scanExpiredLots();

      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        warehouseId,
        0,
        0,
        5,
        {},
      );
      expect(lotModel.updateOne).toHaveBeenCalledWith(
        { _id: lotId },
        { status: LotStatus.EXPIRED },
        { session: {} },
      );
      expect(stockQueue.add).toHaveBeenCalledTimes(1);
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.expired',
        { sku: 'SKU-1', delta: -5 },
        { jobId: `lot_expire:${lotId.toString()}:SKU-1` },
      );
    });
  });
});
