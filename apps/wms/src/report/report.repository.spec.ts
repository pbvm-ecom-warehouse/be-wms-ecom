import { Types } from 'mongoose';
import { LotStatus } from '../stock/schemas/lot.schema';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import { ReportRepository } from './report.repository';

describe('ReportRepository', () => {
  let repo: ReportRepository;
  let warehouseItemModel: { findOne: jest.Mock };
  let stockBalanceModel: { aggregate: jest.Mock };
  let inventoryStockModel: { aggregate: jest.Mock };
  let stockMovementModel: { aggregate: jest.Mock };

  const itemId = new Types.ObjectId();
  const warehouseId = new Types.ObjectId();

  beforeEach(() => {
    warehouseItemModel = { findOne: jest.fn() };
    stockBalanceModel = { aggregate: jest.fn() };
    inventoryStockModel = { aggregate: jest.fn() };
    stockMovementModel = { aggregate: jest.fn() };
    repo = new ReportRepository(
      warehouseItemModel as never,
      stockBalanceModel as never,
      inventoryStockModel as never,
      stockMovementModel as never,
    );
  });

  describe('findItemIdBySku', () => {
    it('trả về _id + nearExpiryDays khi tìm thấy sku', async () => {
      warehouseItemModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: itemId, nearExpiryDays: 3 }),
      });

      const result = await repo.findItemIdBySku('SKU-1');

      expect(warehouseItemModel.findOne).toHaveBeenCalledWith({ sku: 'SKU-1' });
      expect(result).toEqual({ _id: itemId, nearExpiryDays: 3 });
    });

    it('trả về null khi không tìm thấy', async () => {
      warehouseItemModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await repo.findItemIdBySku('SKU-X');

      expect(result).toBeNull();
    });
  });

  describe('aggregateStockReport', () => {
    it('dựng đúng $match theo warehouseId+itemId, $skip/$limit theo trang, đếm total', async () => {
      const rows = [
        {
          itemId,
          warehouseId,
          onHand: 10,
          reserved: 2,
          expired: 1,
          item: { sku: 'SKU-1', name: 'Item 1' },
          warehouse: { name: 'Kho A' },
        },
      ];
      stockBalanceModel.aggregate
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(rows) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([{ total: 1 }]) });

      const result = await repo.aggregateStockReport({ warehouseId, itemId }, 1, 20);

      expect(result).toEqual({ data: rows, total: 1 });
      const dataPipeline = stockBalanceModel.aggregate.mock.calls[0][0] as Record<
        string,
        unknown
      >[];
      expect(dataPipeline[0]).toEqual({ $match: { warehouseId, itemId } });
      expect(dataPipeline).toContainEqual({ $skip: 0 });
      expect(dataPipeline).toContainEqual({ $limit: 20 });
      const countPipeline = stockBalanceModel.aggregate.mock.calls[1][0] as Record<
        string,
        unknown
      >[];
      expect(countPipeline).toContainEqual({ $count: 'total' });
    });

    it('total = 0 khi $count trả mảng rỗng, $skip tính đúng theo trang 2', async () => {
      stockBalanceModel.aggregate
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) });

      const result = await repo.aggregateStockReport({}, 2, 20);

      expect(result).toEqual({ data: [], total: 0 });
      const dataPipeline = stockBalanceModel.aggregate.mock.calls[0][0] as Record<
        string,
        unknown
      >[];
      expect(dataPipeline[0]).toEqual({ $match: {} });
      expect(dataPipeline).toContainEqual({ $skip: 20 });
    });
  });

  describe('aggregateLotReport', () => {
    it('lọc lotId != null, group theo lotId+warehouseId, lookup lot/item/warehouse', async () => {
      const lotId = new Types.ObjectId();
      const rows = [
        {
          _id: { lotId, warehouseId },
          itemId,
          quantity: 5,
          lot: {
            lotNumber: 'LOT-1',
            expiryDate: new Date('2026-08-01'),
            status: LotStatus.ACTIVE,
          },
          item: { sku: 'SKU-1', name: 'Item 1', nearExpiryDays: 3 },
          warehouse: { name: 'Kho A' },
        },
      ];
      inventoryStockModel.aggregate
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(rows) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([{ total: 1 }]) });

      const result = await repo.aggregateLotReport({ warehouseId, itemId }, 1, 20);

      expect(result).toEqual({ data: rows, total: 1 });
      const dataPipeline = inventoryStockModel.aggregate.mock.calls[0][0] as Record<
        string,
        unknown
      >[];
      expect(dataPipeline[0]).toEqual({
        $match: { lotId: { $ne: null }, warehouseId, itemId },
      });
      expect(dataPipeline).toContainEqual({ $skip: 0 });
      expect(dataPipeline).toContainEqual({ $limit: 20 });
    });

    it('có status filter → thêm $match lot.status sau bước lookup', async () => {
      inventoryStockModel.aggregate
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) });

      await repo.aggregateLotReport({ status: LotStatus.EXPIRED }, 1, 20);

      const dataPipeline = inventoryStockModel.aggregate.mock.calls[0][0] as Record<
        string,
        unknown
      >[];
      expect(dataPipeline).toContainEqual({
        $match: { 'lot.status': LotStatus.EXPIRED },
      });
    });
  });

  describe('aggregatePerformanceReport', () => {
    it('$match theo createdAt range + filter, $group theo type', async () => {
      const dateFrom = new Date('2026-06-01');
      const dateTo = new Date('2026-07-01');
      const rows = [
        { _id: MovementType.RECEIVE, totalQuantity: 100, movementCount: 4 },
      ];
      stockMovementModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(rows),
      });

      const result = await repo.aggregatePerformanceReport({
        dateFrom,
        dateTo,
        warehouseId,
        itemId,
      });

      expect(result).toEqual(rows);
      const pipeline = stockMovementModel.aggregate.mock.calls[0][0] as Record<
        string,
        unknown
      >[];
      expect(pipeline[0]).toEqual({
        $match: {
          createdAt: { $gte: dateFrom, $lte: dateTo },
          warehouseId,
          itemId,
        },
      });
      expect(pipeline[1]).toEqual({
        $group: {
          _id: '$type',
          totalQuantity: { $sum: '$quantity' },
          movementCount: { $sum: 1 },
        },
      });
    });
  });
});
