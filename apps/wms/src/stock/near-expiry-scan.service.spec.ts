import { NearExpiryScanService } from './near-expiry-scan.service';

describe('NearExpiryScanService', () => {
  let svc: NearExpiryScanService;
  let lotModel: { aggregate: jest.Mock };
  let notificationQueue: { add: jest.Mock };

  beforeEach(() => {
    lotModel = { aggregate: jest.fn() };
    notificationQueue = { add: jest.fn() };
    svc = new NearExpiryScanService(
      lotModel as never,
      notificationQueue as never,
    );
  });

  describe('scanNearExpiryLots', () => {
    it('phát 1 job stock.near_expiry cho mỗi lô tìm được, KHÔNG kèm jobId', async () => {
      lotModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            lotNumber: 'LOT-1',
            expiryDate: new Date('2026-07-20T00:00:00.000Z'),
            sku: 'SKU-1',
          },
          {
            lotNumber: 'LOT-2',
            expiryDate: new Date('2026-07-21T00:00:00.000Z'),
            sku: 'SKU-2',
          },
        ]),
      });

      await svc.scanNearExpiryLots();

      expect(notificationQueue.add).toHaveBeenCalledTimes(2);
      expect(notificationQueue.add).toHaveBeenNthCalledWith(
        1,
        'stock.near_expiry',
        {
          sku: 'SKU-1',
          lotNumber: 'LOT-1',
          expiryDate: '2026-07-20T00:00:00.000Z',
        },
      );
      // không truyền jobId — khớp quyết định "không dedup"
      expect(notificationQueue.add.mock.calls[0]).toHaveLength(2);
    });

    it('không có lô nào sắp hết hạn → không emit gì', async () => {
      lotModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      await svc.scanNearExpiryLots();

      expect(notificationQueue.add).not.toHaveBeenCalled();
    });

    it('$match theo status ACTIVE, $expr lte expiryDate/threshold', async () => {
      lotModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      await svc.scanNearExpiryLots();

      const pipeline = lotModel.aggregate.mock.calls[0][0] as Record<
        string,
        unknown
      >[];
      expect(pipeline[0]).toEqual({ $match: { status: 'ACTIVE' } });
      const lastMatch = pipeline.find(
        (stage) =>
          typeof stage.$match === 'object' &&
          stage.$match !== null &&
          '$expr' in (stage.$match as Record<string, unknown>),
      );
      expect(lastMatch).toBeDefined();
    });
  });
});
