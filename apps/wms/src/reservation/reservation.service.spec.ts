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

const makeWarehouseRepo = () => ({
  findAllActiveWarehouseIds: jest.fn(),
  findStagingShelfByWarehouse: jest.fn(),
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
  let warehouseRepo: ReturnType<typeof makeWarehouseRepo>;
  let goodsIssueRepo: ReturnType<typeof makeGoodsIssueRepo>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let queue: ReturnType<typeof makeQueue>;

  const orderId = new Types.ObjectId().toString();
  const warehouseA = new Types.ObjectId();
  const warehouseB = new Types.ObjectId();
  const stagingShelfA = { _id: new Types.ObjectId() };
  const stagingShelfB = { _id: new Types.ObjectId() };
  const itemA = new Types.ObjectId();
  const itemB = new Types.ObjectId();

  beforeEach(() => {
    stockRepo = makeStockRepo();
    warehouseRepo = makeWarehouseRepo();
    goodsIssueRepo = makeGoodsIssueRepo();
    txHelper = makeTxHelper();
    queue = makeQueue();
    svc = new ReservationService(
      stockRepo as never,
      txHelper as never,
      warehouseRepo as never,
      goodsIssueRepo as never,
      queue as never,
    );
  });

  describe('reserveForOrder', () => {
    it('reserve thành công khi kho ứng viên đủ tồn cho mọi sku, phát STOCK_RESERVED', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findItemBySku.mockResolvedValueOnce({
        _id: itemA,
        sku: 'SKU-A',
      });
      warehouseRepo.findAllActiveWarehouseIds.mockResolvedValue([warehouseA]);
      warehouseRepo.findStagingShelfByWarehouse.mockResolvedValue(
        stagingShelfA,
      );
      stockRepo.reserveIfAvailable.mockResolvedValue(true);

      await svc.reserveForOrder(
        orderId,
        [{ sku: 'SKU-A', quantity: 4 }],
        'CENTRAL',
      );

      expect(stockRepo.reserveIfAvailable).toHaveBeenCalledWith(
        itemA,
        warehouseA,
        4,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: itemA,
          warehouseId: warehouseA,
          shelfId: stagingShelfA._id,
          type: MovementType.RESERVE,
          quantity: 4,
          refType: 'reservation',
        }),
        expect.anything(),
      );
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.STOCK_RESERVED,
        { orderId, fulfillWarehouseId: warehouseA.toString() },
        { jobId: `reservation:${orderId}` },
      );
    });

    it('kho đầu tiên thiếu 1 sku, kho thứ 2 đủ toàn bộ → chọn kho thứ 2', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findItemBySku.mockImplementation((sku: string) =>
        Promise.resolve(
          sku === 'SKU-A'
            ? { _id: itemA, sku: 'SKU-A' }
            : { _id: itemB, sku: 'SKU-B' },
        ),
      );
      warehouseRepo.findAllActiveWarehouseIds.mockResolvedValue([
        warehouseA,
        warehouseB,
      ]);
      warehouseRepo.findStagingShelfByWarehouse.mockImplementation(
        (id: string) =>
          Promise.resolve(
            id === warehouseA.toString() ? stagingShelfA : stagingShelfB,
          ),
      );
      // warehouseA: SKU-A đủ, SKU-B thiếu → transaction abort ở SKU-B
      // warehouseB: cả 2 đủ
      stockRepo.reserveIfAvailable.mockImplementation(
        (itemId: Types.ObjectId, warehouseId: Types.ObjectId) => {
          if (warehouseId === warehouseA && itemId === itemB)
            return Promise.resolve(false);
          return Promise.resolve(true);
        },
      );

      await svc.reserveForOrder(
        orderId,
        [
          { sku: 'SKU-A', quantity: 2 },
          { sku: 'SKU-B', quantity: 2 },
        ],
        'CENTRAL',
      );

      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.STOCK_RESERVED,
        { orderId, fulfillWarehouseId: warehouseB.toString() },
        { jobId: `reservation:${orderId}` },
      );
    });

    it('không kho nào đủ toàn bộ đơn → phát STOCK_RESERVE_FAILED với đúng failedSkus', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findItemBySku.mockResolvedValue({ _id: itemA, sku: 'SKU-1' });
      warehouseRepo.findAllActiveWarehouseIds.mockResolvedValue([warehouseA]);
      warehouseRepo.findStagingShelfByWarehouse.mockResolvedValue(
        stagingShelfA,
      );
      stockRepo.reserveIfAvailable.mockResolvedValue(false);

      await svc.reserveForOrder(
        orderId,
        [{ sku: 'SKU-1', quantity: 5 }],
        'CENTRAL',
      );

      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.STOCK_RESERVE_FAILED,
        expect.objectContaining({ orderId, failedSkus: ['SKU-1'] }),
        { jobId: `reservation-failed:${orderId}` },
      );
    });

    it('sku không tồn tại trong WarehouseItem → góp vào failedSkus, không throw, không gọi reserveIfAvailable', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(false);
      stockRepo.findItemBySku.mockResolvedValue(null);
      warehouseRepo.findAllActiveWarehouseIds.mockResolvedValue([warehouseA]);
      warehouseRepo.findStagingShelfByWarehouse.mockResolvedValue(
        stagingShelfA,
      );

      await expect(
        svc.reserveForOrder(
          orderId,
          [{ sku: 'SKU-KHONG-TON-TAI', quantity: 1 }],
          'CENTRAL',
        ),
      ).resolves.not.toThrow();

      expect(stockRepo.reserveIfAvailable).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.STOCK_RESERVE_FAILED,
        expect.objectContaining({ orderId, failedSkus: ['SKU-KHONG-TON-TAI'] }),
        { jobId: `reservation-failed:${orderId}` },
      );
    });

    it('đơn đã có movement reservation (retry) → bỏ qua, không gọi reserveIfAvailable', async () => {
      stockRepo.hasMovementForRef.mockResolvedValue(true);

      await svc.reserveForOrder(
        orderId,
        [{ sku: 'SKU-1', quantity: 3 }],
        'CENTRAL',
      );

      expect(stockRepo.reserveIfAvailable).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('releaseForOrder', () => {
    const reserveMovement = {
      itemId: itemA,
      warehouseId: warehouseA,
      shelfId: stagingShelfA._id,
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
        warehouseA,
        0,
        -4,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: itemA,
          warehouseId: warehouseA,
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
