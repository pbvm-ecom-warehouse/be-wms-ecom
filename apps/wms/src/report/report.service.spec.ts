import { Types } from 'mongoose';
import { ReportService } from './report.service';
import { LotStatus } from '../stock/schemas/lot.schema';
import { MovementType } from '../stock/schemas/stock-movement.schema';

describe('ReportService', () => {
  let svc: ReportService;
  let repo: {
    findItemIdBySku: jest.Mock;
    aggregateStockReport: jest.Mock;
    aggregateLotReport: jest.Mock;
    aggregatePerformanceReport: jest.Mock;
  };

  const itemId = new Types.ObjectId();

  beforeEach(() => {
    repo = {
      findItemIdBySku: jest.fn(),
      aggregateStockReport: jest.fn(),
      aggregateLotReport: jest.fn(),
      aggregatePerformanceReport: jest.fn(),
    };
    svc = new ReportService(repo as never);
  });

  describe('getStockReport', () => {
    it('tính available = onHand - reserved - expired', async () => {
      repo.aggregateStockReport.mockResolvedValue({
        data: [
          {
            itemId,
            onHand: 10,
            reserved: 3,
            expired: 1,
            item: { sku: 'SKU-1', name: 'Item 1' },
          },
        ],
        total: 1,
      });

      const result = await svc.getStockReport({ page: 1, limit: 20 });

      expect(result.data[0]).toEqual({
        sku: 'SKU-1',
        itemName: 'Item 1',
        onHand: 10,
        reserved: 3,
        expired: 1,
        available: 6,
      });
      expect(repo.aggregateStockReport).toHaveBeenCalledWith({}, 1, 20);
    });

    it('sku không khớp WarehouseItem nào → trả rỗng, không gọi aggregateStockReport', async () => {
      repo.findItemIdBySku.mockResolvedValue(null);

      const result = await svc.getStockReport({
        sku: 'SKU-X',
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({ data: [], total: 0 });
      expect(repo.aggregateStockReport).not.toHaveBeenCalled();
    });

    it('sku khớp → resolve itemId rồi truyền vào filter', async () => {
      repo.findItemIdBySku.mockResolvedValue({ _id: itemId });
      repo.aggregateStockReport.mockResolvedValue({ data: [], total: 0 });

      await svc.getStockReport({ sku: 'SKU-1', page: 1, limit: 20 });

      expect(repo.aggregateStockReport).toHaveBeenCalledWith({ itemId }, 1, 20);
    });
  });

  describe('getLotReport', () => {
    const now = new Date('2026-07-15T00:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('status EXPIRED → expiryFlag "expired" bất kể expiryDate', async () => {
      repo.aggregateLotReport.mockResolvedValue({
        data: [
          {
            _id: new Types.ObjectId(),
            itemId,
            quantity: 5,
            lot: {
              lotNumber: 'LOT-1',
              expiryDate: new Date('2027-01-01'),
              status: LotStatus.EXPIRED,
            },
            item: { sku: 'SKU-1', name: 'Item 1' },
          },
        ],
        total: 1,
      });

      const result = await svc.getLotReport({ page: 1, limit: 20 });

      expect(result.data[0].expiryFlag).toBe('expired');
    });

    it('expiryDate đã qua nhưng status vẫn ACTIVE (cron chưa chạy) → "expired"', async () => {
      repo.aggregateLotReport.mockResolvedValue({
        data: [
          {
            _id: new Types.ObjectId(),
            itemId,
            quantity: 5,
            lot: {
              lotNumber: 'LOT-1',
              expiryDate: new Date('2026-07-01'),
              status: LotStatus.ACTIVE,
            },
            item: { sku: 'SKU-1', name: 'Item 1' },
          },
        ],
        total: 1,
      });

      const result = await svc.getLotReport({ page: 1, limit: 20 });

      expect(result.data[0].expiryFlag).toBe('expired');
    });

    it('expiryDate trong ngưỡng nearExpiryDays riêng của item → "expiringSoon"', async () => {
      repo.aggregateLotReport.mockResolvedValue({
        data: [
          {
            _id: new Types.ObjectId(),
            itemId,
            quantity: 5,
            lot: {
              lotNumber: 'LOT-1',
              expiryDate: new Date('2026-07-17T00:00:00.000Z'), // +2 ngày
              status: LotStatus.ACTIVE,
            },
            item: { sku: 'SKU-1', name: 'Item 1', nearExpiryDays: 3 },
          },
        ],
        total: 1,
      });

      const result = await svc.getLotReport({ page: 1, limit: 20 });

      expect(result.data[0].expiryFlag).toBe('expiringSoon');
    });

    it('item không set nearExpiryDays → fallback 7 ngày', async () => {
      repo.aggregateLotReport.mockResolvedValue({
        data: [
          {
            _id: new Types.ObjectId(),
            itemId,
            quantity: 5,
            lot: {
              lotNumber: 'LOT-1',
              expiryDate: new Date('2026-07-20T00:00:00.000Z'), // +5 ngày, trong 7 ngày mặc định
              status: LotStatus.ACTIVE,
            },
            item: { sku: 'SKU-1', name: 'Item 1' },
          },
        ],
        total: 1,
      });

      const result = await svc.getLotReport({ page: 1, limit: 20 });

      expect(result.data[0].expiryFlag).toBe('expiringSoon');
    });

    it('expiryDate ngoài ngưỡng → "ok"', async () => {
      repo.aggregateLotReport.mockResolvedValue({
        data: [
          {
            _id: new Types.ObjectId(),
            itemId,
            quantity: 5,
            lot: {
              lotNumber: 'LOT-1',
              expiryDate: new Date('2026-09-01T00:00:00.000Z'),
              status: LotStatus.ACTIVE,
            },
            item: { sku: 'SKU-1', name: 'Item 1' },
          },
        ],
        total: 1,
      });

      const result = await svc.getLotReport({ page: 1, limit: 20 });

      expect(result.data[0].expiryFlag).toBe('ok');
    });

    it('sku không khớp → trả rỗng, không gọi aggregateLotReport', async () => {
      repo.findItemIdBySku.mockResolvedValue(null);

      const result = await svc.getLotReport({
        sku: 'SKU-X',
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({ data: [], total: 0 });
      expect(repo.aggregateLotReport).not.toHaveBeenCalled();
    });
  });

  describe('getPerformanceReport', () => {
    it('mặc định dateFrom = dateTo - 30 ngày khi không truyền', async () => {
      repo.aggregatePerformanceReport.mockResolvedValue([]);

      await svc.getPerformanceReport({});

      const calledWith = repo.aggregatePerformanceReport.mock.calls[0][0] as {
        dateFrom: Date;
        dateTo: Date;
      };
      const diffDays =
        (calledWith.dateTo.getTime() - calledWith.dateFrom.getTime()) /
        (24 * 60 * 60 * 1000);
      expect(diffDays).toBeCloseTo(30, 5);
    });

    it('trả đủ mọi MovementType, loại không có dữ liệu → totalQuantity=0, movementCount=0', async () => {
      repo.aggregatePerformanceReport.mockResolvedValue([
        { _id: MovementType.RECEIVE, totalQuantity: 50, movementCount: 2 },
      ]);

      const result = await svc.getPerformanceReport({});

      expect(result).toHaveLength(Object.values(MovementType).length);
      expect(result.find((r) => r.type === MovementType.RECEIVE)).toEqual({
        type: MovementType.RECEIVE,
        totalQuantity: 50,
        movementCount: 2,
      });
      expect(result.find((r) => r.type === MovementType.ISSUE)).toEqual({
        type: MovementType.ISSUE,
        totalQuantity: 0,
        movementCount: 0,
      });
    });

    it('sku không khớp WarehouseItem nào → trả đủ MovementType với số 0, không gọi aggregatePerformanceReport', async () => {
      repo.findItemIdBySku.mockResolvedValue(null);

      const result = await svc.getPerformanceReport({ sku: 'SKU-X' });

      expect(result).toHaveLength(Object.values(MovementType).length);
      expect(
        result.every((r) => r.totalQuantity === 0 && r.movementCount === 0),
      ).toBe(true);
      expect(repo.aggregatePerformanceReport).not.toHaveBeenCalled();
    });

    it('dateFrom/dateTo truyền vào được parse đúng và forward xuống repository', async () => {
      repo.aggregatePerformanceReport.mockResolvedValue([]);

      await svc.getPerformanceReport({
        dateFrom: '2026-06-01T00:00:00.000Z',
        dateTo: '2026-07-01T00:00:00.000Z',
      });

      expect(repo.aggregatePerformanceReport).toHaveBeenCalledWith({
        dateFrom: new Date('2026-06-01T00:00:00.000Z'),
        dateTo: new Date('2026-07-01T00:00:00.000Z'),
      });
    });
  });
});
