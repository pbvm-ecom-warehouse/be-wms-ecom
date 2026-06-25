import { EVENTS } from '@app/events';
import { NotificationConsumer } from './notification.consumer';

describe('NotificationConsumer', () => {
  function make() {
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    const consumer = new NotificationConsumer(email as any);
    return { consumer, email };
  }

  it('verify_requested → gửi email verify với idempotencyKey = job.id', async () => {
    const { consumer, email } = make();
    await consumer.process({
      id: 'job-1',
      name: EVENTS.CUSTOMER_VERIFY_REQUESTED,
      data: { customerId: 'c1', email: 'x@y.com', code: '123456' },
    } as any);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'x@y.com', idempotencyKey: 'job-1' }),
    );
  });

  it('job lạ → không gửi email', async () => {
    const { consumer, email } = make();
    await consumer.process({ id: 'j', name: 'unknown.event', data: {} } as any);
    expect(email.send).not.toHaveBeenCalled();
  });
});
