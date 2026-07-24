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
    it('1 lô hết hạn → tăng expired 1 lần, phát 1 job stock.expired', async () => {
      lotModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: lotId }]),
      });
      stockRepo.sumInventoryByLot.mockResolvedValue([
        { itemId, sku: 'SKU-1', qty: 5 },
      ]);

      await svc.scanExpiredLots();

      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(itemId, 0, 0, 5, {});
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

    it('1 lô hết hạn, tồn rải rác nhiều item cùng sku → tăng expired nhiều lần, chỉ 1 job stock.expired với delta tổng', async () => {
      const itemId2 = new Types.ObjectId();
      lotModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: lotId }]),
      });
      stockRepo.sumInventoryByLot.mockResolvedValue([
        { itemId, sku: 'SKU-1', qty: 5 },
        { itemId: itemId2, sku: 'SKU-1', qty: 3 },
      ]);

      await svc.scanExpiredLots();

      expect(stockRepo.upsertBalance).toHaveBeenCalledTimes(2);
      expect(stockRepo.upsertBalance).toHaveBeenNthCalledWith(
        1,
        itemId,
        0,
        0,
        5,
        {},
      );
      expect(stockRepo.upsertBalance).toHaveBeenNthCalledWith(
        2,
        itemId2,
        0,
        0,
        3,
        {},
      );
      expect(stockQueue.add).toHaveBeenCalledTimes(1);
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.expired',
        { sku: 'SKU-1', delta: -8 },
        { jobId: `lot_expire:${lotId.toString()}:SKU-1` },
      );
    });

    it('lô hết hạn nhưng đã hết InventoryStock (đã bán/scrap hết) → chỉ set EXPIRED, không update balance, không phát event', async () => {
      lotModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: lotId }]),
      });
      stockRepo.sumInventoryByLot.mockResolvedValue([]);

      await svc.scanExpiredLots();

      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
      expect(lotModel.updateOne).toHaveBeenCalledWith(
        { _id: lotId },
        { status: LotStatus.EXPIRED },
        { session: {} },
      );
      expect(stockQueue.add).not.toHaveBeenCalled();
    });

    it('không có lô nào hết hạn → không làm gì', async () => {
      lotModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      await svc.scanExpiredLots();

      expect(stockRepo.sumInventoryByLot).not.toHaveBeenCalled();
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
      expect(stockQueue.add).not.toHaveBeenCalled();
    });

    it('$match theo status ACTIVE và expiryDate < now', async () => {
      lotModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      await svc.scanExpiredLots();

      const filter = lotModel.find.mock.calls[0][0] as {
        status: string;
        expiryDate: { $lt: Date };
      };
      expect(filter.status).toBe(LotStatus.ACTIVE);
      expect(filter.expiryDate.$lt).toBeInstanceOf(Date);
    });
  });
});
