import { PrintJobConsumer } from './print-job.consumer';
import { EVENTS, PrintStage } from '@app/events';
import { UnrecoverableError } from 'bullmq';

describe('PrintJobConsumer', () => {
  let consumer: PrintJobConsumer;
  let service: { createFromPrintRequested: jest.Mock };

  beforeEach(() => {
    service = { createFromPrintRequested: jest.fn() };
    consumer = new PrintJobConsumer(service as never);
  });

  it('gọi createFromPrintRequested với đúng dữ liệu khi nhận print.requested', async () => {
    const payload = {
      orderId: 'order-1',
      stage: PrintStage.PRODUCTION,
      items: [
        {
          orderItemId: 'order-item-1',
          blankSku: 'CUP-HRT-PET-500-CLR',
          quantity: 5,
          designFile: 'd.png',
          designId: '042',
        },
      ],
      orderDetail: { code: 'ORD-0001' },
    };
    const job = {
      name: EVENTS.PRINT_REQUESTED,
      data: payload,
    } as never;

    await consumer.process(job);

    expect(service.createFromPrintRequested).toHaveBeenCalledWith(payload);
  });

  it('đánh dấu malformed payload là unrecoverable để BullMQ không retry vô ích', async () => {
    service.createFromPrintRequested.mockRejectedValue(
      Object.assign(new Error('Thiếu orderItemId'), {
        code: 'VALIDATION_FAILED',
      }),
    );
    const job = {
      name: EVENTS.PRINT_REQUESTED,
      data: {
        orderId: 'order-1',
        stage: PrintStage.SAMPLE,
        items: [
          {
            blankSku: 'CUP-HRT-PET-500-CLR',
            quantity: 1,
            designFile: 'd.png',
          },
        ],
      },
    } as never;

    await expect(consumer.process(job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('payload null cũng được phân loại unrecoverable, không vỡ trước validation', async () => {
    service.createFromPrintRequested.mockRejectedValue(
      Object.assign(new Error('Payload không hợp lệ'), {
        code: 'VALIDATION_FAILED',
      }),
    );

    await expect(
      consumer.process({
        name: EVENTS.PRINT_REQUESTED,
        data: null,
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('giữ lỗi master data là recoverable để BullMQ retry', async () => {
    const masterError = new Error('Không tìm thấy CUP_BLANK');
    service.createFromPrintRequested.mockRejectedValue(masterError);
    const job = {
      name: EVENTS.PRINT_REQUESTED,
      data: {
        orderId: 'order-1',
        stage: PrintStage.PRODUCTION,
        items: [],
      },
    } as never;

    await expect(consumer.process(job)).rejects.toBe(masterError);
  });

  it('bỏ qua job không phải print.requested', async () => {
    const job = { name: 'some.other.event', data: {} } as never;
    await consumer.process(job);
    expect(service.createFromPrintRequested).not.toHaveBeenCalled();
  });
});
