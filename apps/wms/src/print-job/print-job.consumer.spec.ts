import { PrintJobConsumer } from './print-job.consumer';
import { EVENTS } from '@app/events';

describe('PrintJobConsumer', () => {
  let consumer: PrintJobConsumer;
  let service: { createFromPrintRequested: jest.Mock };

  beforeEach(() => {
    service = { createFromPrintRequested: jest.fn() };
    consumer = new PrintJobConsumer(service as never);
  });

  it('gọi createFromPrintRequested với đúng dữ liệu khi nhận print.requested', async () => {
    const job = {
      name: EVENTS.PRINT_REQUESTED,
      data: {
        orderId: 'order-1',
        items: [{ sku: 'CUP-PRINTED-1', quantity: 5, designFile: 'd.png' }],
      },
    } as never;

    await consumer.process(job);

    expect(service.createFromPrintRequested).toHaveBeenCalledWith('order-1', [
      { sku: 'CUP-PRINTED-1', quantity: 5, designFile: 'd.png' },
    ]);
  });

  it('bỏ qua job không phải print.requested', async () => {
    const job = { name: 'some.other.event', data: {} } as never;
    await consumer.process(job);
    expect(service.createFromPrintRequested).not.toHaveBeenCalled();
  });
});
