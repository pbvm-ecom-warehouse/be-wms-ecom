import { EVENTS } from '@app/events';
import { NotificationConsumer } from './notification.consumer';

describe('NotificationConsumer', () => {
  function make(opts?: {
    alertEmail?: string;
    firebaseEnabled?: boolean;
    smsWebhook?: string;
  }) {
    const email = {
      send: jest.fn().mockResolvedValue(undefined),
      isEnabled: jest.fn().mockReturnValue(true),
    };
    const messaging = { send: jest.fn().mockResolvedValue('msg-1') };
    const firebase = {
      isEnabled: jest.fn().mockReturnValue(opts?.firebaseEnabled ?? true),
      getMessaging: jest.fn().mockReturnValue(messaging),
    };
    // hasOwnProperty (thay vì ?? ) để phân biệt "truyền alertEmail: undefined"
    // (test case "không có WAREHOUSE_ALERT_EMAIL") với "không truyền opts" —
    // ?? sẽ gộp cả 2 trường hợp về default, làm test case đó không thể fail đúng ý.
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DELIVERY_SMS_WEBHOOK_URL') return opts?.smsWebhook;
        return opts && Object.prototype.hasOwnProperty.call(opts, 'alertEmail')
          ? opts.alertEmail
          : 'manager@x.com';
      }),
    };
    const consumer = new NotificationConsumer(
      email as never,
      firebase as never,
      config as never,
    );
    return { consumer, email, firebase, messaging, config };
  }

  it('verify_requested → gửi email verify với idempotencyKey = job.id', async () => {
    const { consumer, email } = make();
    await consumer.process({
      id: 'job-1',
      name: EVENTS.CUSTOMER_VERIFY_REQUESTED,
      data: { customerId: 'c1', email: 'x@y.com', code: '123456' },
    } as never);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'x@y.com', idempotencyKey: 'job-1' }),
    );
  });

  it('job lạ → không gửi email', async () => {
    const { consumer, email } = make();
    await consumer.process({
      id: 'j',
      name: 'unknown.event',
      data: {},
    } as never);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('delivery OTP → gửi SMS webhook, không trả/log OTP qua API WMS', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    const { consumer } = make({
      smsWebhook: 'https://sms.example.com/send',
    });

    await consumer.process({
      id: 'otp-job-1',
      name: EVENTS.SHIPMENT_DELIVERY_OTP_REQUESTED,
      data: {
        shipmentId: 'shipment-1',
        orderId: 'order-1',
        phone: '0901234567',
        code: '123456',
        expiresInSeconds: 600,
      },
    } as never);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://sms.example.com/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('0901234567'),
      }),
    );
    fetchSpy.mockRestore();
  });

  describe('stock.low', () => {
    const payload = {
      sku: 'SKU-1',
      available: 2,
      minQuantity: 10,
    };

    it('cả email + firebase bật → gửi cả 2', async () => {
      const { consumer, email, messaging } = make();
      await consumer.process({
        id: 'j1',
        name: EVENTS.STOCK_LOW,
        data: payload,
      } as never);

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'manager@x.com', idempotencyKey: 'j1' }),
      );
      expect(messaging.send).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'stock_alert' }),
      );
    });

    it('email tắt (isEnabled=false) → không gửi email, vẫn gửi firebase', async () => {
      const { consumer, email, messaging } = make();
      email.isEnabled.mockReturnValue(false);

      await consumer.process({
        id: 'j2',
        name: EVENTS.STOCK_LOW,
        data: payload,
      } as never);

      expect(email.send).not.toHaveBeenCalled();
      expect(messaging.send).toHaveBeenCalled();
    });

    it('cả 2 tắt → không throw, không gửi gì', async () => {
      const { consumer, email, messaging } = make({ firebaseEnabled: false });
      email.isEnabled.mockReturnValue(false);

      await expect(
        consumer.process({
          id: 'j3',
          name: EVENTS.STOCK_LOW,
          data: payload,
        } as never),
      ).resolves.toBeUndefined();
      expect(email.send).not.toHaveBeenCalled();
      expect(messaging.send).not.toHaveBeenCalled();
    });

    it('không có WAREHOUSE_ALERT_EMAIL → không gửi email dù isEnabled=true', async () => {
      const { consumer, email } = make({ alertEmail: undefined });

      await consumer.process({
        id: 'j4',
        name: EVENTS.STOCK_LOW,
        data: payload,
      } as never);

      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('payment.success', () => {
    it('gửi email xác nhận thanh toán tới customerEmail với idempotencyKey = job.id', async () => {
      const { consumer, email } = make();
      await consumer.process({
        id: 'j6',
        name: EVENTS.PAYMENT_SUCCESS,
        data: {
          orderId: 'order-1',
          customerEmail: 'khach@example.com',
          amount: 100000,
        },
      } as never);

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'khach@example.com',
          idempotencyKey: 'j6',
        }),
      );
    });
  });

  describe('stock.near_expiry', () => {
    const payload = {
      sku: 'SKU-1',
      lotNumber: 'LOT-1',
      expiryDate: '2026-07-20T00:00:00.000Z',
    };

    it('cả email + firebase bật → gửi cả 2, topic = stock_alert_expiry', async () => {
      const { consumer, email, messaging } = make();
      await consumer.process({
        id: 'j5',
        name: EVENTS.STOCK_NEAR_EXPIRY,
        data: payload,
      } as never);

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'manager@x.com', idempotencyKey: 'j5' }),
      );
      expect(messaging.send).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'stock_alert_expiry' }),
      );
    });
  });
});
