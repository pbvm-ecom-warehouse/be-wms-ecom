import { Types } from 'mongoose';
import { ReportService } from './report.service';

describe('ReportService', () => {
  let svc: ReportService;
  let repo: {
    findItemIdBySku: jest.Mock;
    aggregateStockReport: jest.Mock;
    aggregateLotReport: jest.Mock;
    aggregatePerformanceReport: jest.Mock;
  };

  const itemId = new Types.ObjectId();
  const warehouseId = new Types.ObjectId();

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
            warehouseId,
            onHand: 10,
            reserved: 3,
            expired: 1,
            item: { sku: 'SKU-1', name: 'Item 1' },
            warehouse: { name: 'Kho A' },
          },
        ],
        total: 1,
      });

      const result = await svc.getStockReport({ page: 1, limit: 20 });

      expect(result.data[0]).toEqual({
        sku: 'SKU-1',
        itemName: 'Item 1',
        warehouseId: warehouseId.toString(),
        warehouseName: 'Kho A',
        onHand: 10,
        reserved: 3,
        expired: 1,
        available: 6,
      });
      expect(repo.aggregateStockReport).toHaveBeenCalledWith({}, 1, 20);
    });

    it('sku không khớp WarehouseItem nào → trả rỗng, không gọi aggregateStockReport', async () => {
      repo.findItemIdBySku.mockResolvedValue(null);

      const result = await svc.getStockReport({ sku: 'SKU-X', page: 1, limit: 20 });

      expect(result).toEqual({ data: [], total: 0 });
      expect(repo.aggregateStockReport).not.toHaveBeenCalled();
    });

    it('sku khớp → resolve itemId rồi truyền vào filter', async () => {
      repo.findItemIdBySku.mockResolvedValue({ _id: itemId });
      repo.aggregateStockReport.mockResolvedValue({ data: [], total: 0 });

      await svc.getStockReport({ sku: 'SKU-1', page: 1, limit: 20 });

      expect(repo.aggregateStockReport).toHaveBeenCalledWith({ itemId }, 1, 20);
    });

    it('warehouseId truyền vào filter dạng ObjectId', async () => {
      repo.aggregateStockReport.mockResolvedValue({ data: [], total: 0 });

      await svc.getStockReport({
        warehouseId: warehouseId.toString(),
        page: 1,
        limit: 20,
      });

      expect(repo.aggregateStockReport).toHaveBeenCalledWith(
        { warehouseId: expect.any(Types.ObjectId) },
        1,
        20,
      );
    });
  });
});
