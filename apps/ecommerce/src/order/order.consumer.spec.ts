import { ShipmentConsumer } from './order.consumer';
import { EVENTS } from '@app/events';

describe('ShipmentConsumer', () => {
  let consumer: ShipmentConsumer;
  let orderService: {
    onGoodsIssued: jest.Mock;
    onPrintCompleted: jest.Mock;
    onShipped: jest.Mock;
    onDelivered: jest.Mock;
    onReturned: jest.Mock;
  };

  beforeEach(() => {
    orderService = {
      onGoodsIssued: jest.fn(),
      onPrintCompleted: jest.fn(),
      onShipped: jest.fn(),
      onDelivered: jest.fn(),
      onReturned: jest.fn(),
    };
    consumer = new ShipmentConsumer(orderService as never);
  });

  it('gọi onReturned khi nhận shipment.returned', async () => {
    const job = {
      name: EVENTS.SHIPMENT_RETURNED,
      data: { orderId: 'order-1', shipmentId: 'ship1' },
    } as never;
    await consumer.process(job);
    expect(orderService.onReturned).toHaveBeenCalledWith('order-1');
  });

  it('bỏ qua job shipment.returned thiếu orderId', async () => {
    const job = { name: EVENTS.SHIPMENT_RETURNED, data: {} } as never;
    await consumer.process(job);
    expect(orderService.onReturned).not.toHaveBeenCalled();
  });

  it('truyền nguyên canonical print.completed payload sang OrderService', async () => {
    const data = {
      orderId: 'order-1',
      printJobId: 'print-job-1',
      stage: 'PRODUCTION',
      items: [
        {
          orderItemId: 'line-1',
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: 10,
        },
      ],
      proofImage: 'https://cdn.example.com/proof.jpg',
    };
    const job = {
      name: EVENTS.PRINT_COMPLETED,
      data,
    } as never;

    await consumer.process(job);

    expect(orderService.onPrintCompleted).toHaveBeenCalledWith(data);
  });
});
