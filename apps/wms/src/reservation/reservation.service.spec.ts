import { Types } from 'mongoose';
import { EVENTS } from '@app/events';
import { ReservationService } from './reservation.service';
import { MovementType } from '../stock/schemas/stock-movement.schema';

const makeStockRepo = () => ({
  hasMovementForRef: jest.fn(),
  findMovementsByRef: jest.fn(),
  findItemBySku: jest.fn(),
  reserveIfAvailable: jest.fn(),
  upsertBalance: jest.fn(),
  insertMovement: jest.fn(),
});

const makeLocationRepo = () => ({
  findStagingShelf: jest.fn(),
});

const makeGoodsIssueRepo = () => ({
  findByOrderId: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeQueue = () => ({
  add: jest.fn(),
});

describe('ReservationService', () => {
  let svc: ReservationService;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let locationRepo: ReturnType<typeof makeLocationRepo>;
  let goodsIssueRepo: ReturnType<typeof makeGoodsIssueRepo>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let queue: ReturnType<typeof makeQueue>;

  const orderId = new Types.ObjectId().toString();
  const stagingShelf = { _id: new Types.ObjectId() };
  const itemA = new Types.ObjectId();

  beforeEach(() => {
    stockRepo = makeStockRepo();
    locationRepo = makeLocationRepo();
    goodsIssueRepo = makeGoodsIssueRepo();
    txHelper = makeTxHelper();
    queue = makeQueue();
    svc = new ReservationService(
      stockRepo as never,
      txHelper as never,
      locationRepo as never,
      goodsIssueRepo as never,
      queue as never, // orderReplyQueue (QUEUES.ORDER_REPLY) — WMS chỉ publish, không consume
    );
  });

  describe('reserveForOrder', () => {
    it('reserve thành công khi đủ tồn — emit stock.reserved không kèm fulfillWarehouseId', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findItemBySku.mockResolvedValueOnce({
        _id: itemA,
        sku: 'SKU-A',
      });
      locationRepo.findStagingShelf.mockResolvedValue(stagingShelf);
      stockRepo.reserveIfAvailable.mockResolvedValue(true);

      await svc.reserveForOrder(orderId, [{ sku: 'SKU-A', quantity: 4 }]);

      expect(stockRepo.reserveIfAvailable).toHaveBeenCalledWith(
        itemA,
        4,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: itemA,
          shelfId: stagingShelf._id,
          type: MovementType.RESERVE,
          quantity: 4,
          refType: 'reservation',
        }),
        expect.anything(),
      );
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.STOCK_RESERVED,
        { orderId },
        { jobId: `reservation:${orderId}` },
      );
    });

    it('emit stock.reserve_failed khi thiếu tồn, không thử lại kho khác', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findItemBySku.mockResolvedValue({ _id: itemA, sku: 'SKU-1' });
      locationRepo.findStagingShelf.mockResolvedValue(stagingShelf);
      stockRepo.reserveIfAvailable.mockResolvedValue(false);

      await svc.reserveForOrder(orderId, [{ sku: 'SKU-1', quantity: 999 }]);

      expect(stockRepo.reserveIfAvailable).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.STOCK_RESERVE_FAILED,
        expect.objectContaining({
          orderId,
          reason: 'Không đủ tồn cho toàn bộ đơn hàng',
          failedSkus: ['SKU-1'],
        }),
        { jobId: `reservation-failed:${orderId}` },
      );
    });

    it('emit stock.reserve_failed khi không có staging shelf', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findItemBySku.mockResolvedValue({ _id: itemA, sku: 'SKU-1' });
      locationRepo.findStagingShelf.mockResolvedValue(null);

      await svc.reserveForOrder(orderId, [{ sku: 'SKU-1', quantity: 1 }]);

      expect(stockRepo.reserveIfAvailable).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.STOCK_RESERVE_FAILED,
        expect.objectContaining({
          orderId,
          reason: 'Hệ thống chưa cấu hình vị trí nhận hàng (staging)',
        }),
        { jobId: `reservation-failed:${orderId}` },
      );
    });

    it('sku không tồn tại trong WarehouseItem → góp vào failedSkus, không throw, không gọi reserveIfAvailable', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findItemBySku.mockResolvedValue(null);

      await expect(
        svc.reserveForOrder(orderId, [
          { sku: 'SKU-KHONG-TON-TAI', quantity: 1 },
        ]),
      ).resolves.not.toThrow();

      expect(locationRepo.findStagingShelf).not.toHaveBeenCalled();
      expect(stockRepo.reserveIfAvailable).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.STOCK_RESERVE_FAILED,
        expect.objectContaining({
          orderId,
          reason: 'Sku không tồn tại: SKU-KHONG-TON-TAI',
          failedSkus: ['SKU-KHONG-TON-TAI'],
        }),
        { jobId: `reservation-failed:${orderId}` },
      );
    });

    it('idempotent — bỏ qua nếu đã reserve trước đó', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(true);

      await svc.reserveForOrder(orderId, [{ sku: 'SKU-1', quantity: 1 }]);

      expect(stockRepo.findItemBySku).not.toHaveBeenCalled();
      expect(stockRepo.reserveIfAvailable).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('releaseForOrder', () => {
    const reserveMovement = {
      itemId: itemA,
      shelfId: stagingShelf._id,
      quantity: 4,
      type: MovementType.RESERVE,
    };

    it('giải phóng đúng reserved cho đơn đã reserve, chưa có GoodsIssue', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false); // chưa có RELEASE trước đó
      stockRepo.findMovementsByRef.mockResolvedValue([reserveMovement]);
      goodsIssueRepo.findByOrderId.mockResolvedValue(null);

      await svc.releaseForOrder(orderId);

      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemA,
        0,
        -4,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: itemA,
          type: MovementType.RELEASE,
          quantity: -4,
          refType: 'reservation_release',
        }),
        expect.anything(),
      );
    });

    it('không có movement RESERVE nào (chưa từng reserve) → bỏ qua, không gọi upsertBalance', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findMovementsByRef.mockResolvedValue([]);

      await expect(svc.releaseForOrder(orderId)).resolves.not.toThrow();

      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    });

    it('đã có RELEASE trước đó (retry) → bỏ qua, không trừ reserved lần 2', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(true);

      await svc.releaseForOrder(orderId);

      expect(stockRepo.findMovementsByRef).not.toHaveBeenCalled();
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    });

    it('đã có GoodsIssue cho đơn → không release, không đổi reserved', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findMovementsByRef.mockResolvedValue([reserveMovement]);
      goodsIssueRepo.findByOrderId.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      await svc.releaseForOrder(orderId);

      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    });
  });
});
