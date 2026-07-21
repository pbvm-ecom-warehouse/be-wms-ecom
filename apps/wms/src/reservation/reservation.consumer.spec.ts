import { Logger } from '@nestjs/common';
import { ReservationConsumer } from './reservation.consumer';
import { EVENTS } from '@app/events';

describe('ReservationConsumer', () => {
  let consumer: ReservationConsumer;
  let service: { reserveForOrder: jest.Mock; releaseForOrder: jest.Mock };
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    service = {
      reserveForOrder: jest.fn(),
      releaseForOrder: jest.fn(),
    };
    consumer = new ReservationConsumer(service as never);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('gọi reserveForOrder với đúng dữ liệu khi nhận stock.reserve_requested', async () => {
    const job = {
      name: EVENTS.STOCK_RESERVE_REQUESTED,
      data: {
        orderId: 'order-1',
        items: [{ sku: 'SKU-1', quantity: 3 }],
        preferWarehouse: 'CENTRAL',
      },
    } as never;

    await consumer.process(job);

    expect(service.reserveForOrder).toHaveBeenCalledWith(
      'order-1',
      [{ sku: 'SKU-1', quantity: 3 }],
      'CENTRAL',
    );
    expect(service.releaseForOrder).not.toHaveBeenCalled();
  });

  it('gọi releaseForOrder với đúng orderId khi nhận order.cancelled', async () => {
    const job = {
      name: EVENTS.ORDER_CANCELLED,
      data: { orderId: 'order-2', reason: 'Khách hủy' },
    } as never;

    await consumer.process(job);

    expect(service.releaseForOrder).toHaveBeenCalledWith('order-2');
    expect(service.reserveForOrder).not.toHaveBeenCalled();
  });

  it('bỏ qua job lạ trên order-queue, không gọi service, không throw, không warn', async () => {
    const job = {
      name: 'order.ready_to_fulfill',
      data: {},
    } as never;

    await expect(consumer.process(job)).resolves.not.toThrow();

    expect(service.reserveForOrder).not.toHaveBeenCalled();
    expect(service.releaseForOrder).not.toHaveBeenCalled();
    // default case của ReservationConsumer im lặng có chủ đích (QUEUES.ORDER
    // dùng chung 3 consumer WMS) — không được log warn để tránh nhiễu.
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
