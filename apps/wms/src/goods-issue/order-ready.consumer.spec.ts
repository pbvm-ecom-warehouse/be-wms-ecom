import { OrderReadyConsumer } from './order-ready.consumer';
import { EVENTS } from '@app/events';

describe('OrderReadyConsumer', () => {
  let consumer: OrderReadyConsumer;
  let service: { createFromOrderReady: jest.Mock };

  beforeEach(() => {
    service = { createFromOrderReady: jest.fn() };
    consumer = new OrderReadyConsumer(service as never);
  });

  it('gọi createFromOrderReady với đúng dữ liệu khi nhận order.ready_to_fulfill', async () => {
    const job = {
      name: EVENTS.ORDER_READY_TO_FULFILL,
      data: {
        orderId: 'order-1',
        fulfillWarehouseId: 'wh-1',
        items: [{ sku: 'SKU-1', quantity: 5 }],
        shippingAddress: { street: '123 Le Loi' },
        recipient: { name: 'A', phone: '0900000000' },
        paymentMethod: 'COD',
        codAmount: 0,
      },
    } as never;

    await consumer.process(job);

    expect(service.createFromOrderReady).toHaveBeenCalledWith(
      'order-1',
      'wh-1',
      [{ sku: 'SKU-1', quantity: 5 }],
      { street: '123 Le Loi' },
      { name: 'A', phone: '0900000000' },
      'COD',
      0,
    );
  });

  it('bỏ qua job không phải order.ready_to_fulfill', async () => {
    const job = { name: 'some.other.event', data: {} } as never;
    await consumer.process(job);
    expect(service.createFromOrderReady).not.toHaveBeenCalled();
  });
});
