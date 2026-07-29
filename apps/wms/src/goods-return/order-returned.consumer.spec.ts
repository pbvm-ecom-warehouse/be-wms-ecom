import { EVENTS } from '@app/events';
import { OrderReturnedConsumer } from './order-returned.consumer';

describe('OrderReturnedConsumer', () => {
  let consumer: OrderReturnedConsumer;
  let goodsReturnService: { createFromOrderReturned: jest.Mock };

  beforeEach(() => {
    goodsReturnService = { createFromOrderReturned: jest.fn() };
    consumer = new OrderReturnedConsumer(goodsReturnService as never);
  });

  it('ORDER_RETURNED → gọi createFromOrderReturned với đúng orderId + items', async () => {
    await consumer.process({
      name: EVENTS.ORDER_RETURNED,
      data: {
        orderId: 'order-1',
        orderCode: 'ORD-20260730-0001',
        items: [{ sku: 'SKU-1', quantity: 2 }],
      },
    } as never);

    expect(goodsReturnService.createFromOrderReturned).toHaveBeenCalledWith(
      'order-1',
      'ORD-20260730-0001',
      [{ sku: 'SKU-1', quantity: 2 }],
    );
  });

  it('event lạ → không throw, không gọi service', async () => {
    await expect(
      consumer.process({ name: 'some.other.event', data: {} } as never),
    ).resolves.toBeUndefined();
    expect(goodsReturnService.createFromOrderReturned).not.toHaveBeenCalled();
  });
});
