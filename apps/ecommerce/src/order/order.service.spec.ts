import { Types } from 'mongoose';
import { OrderService } from './order.service';
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
} from './schemas/order.schema';

const makeRepo = () => ({
  findById: jest.fn(),
  updateOrder: jest.fn(),
  listByCustomer: jest.fn(),
  listAll: jest.fn(),
  appendTransaction: jest.fn(),
});

const makeQueue = () => ({ add: jest.fn() });
const makePaymentService = () => ({});
const makeUserRepo = () => ({ findActiveById: jest.fn() });

describe('OrderService.onReturned', () => {
  let svc: OrderService;
  let repo: ReturnType<typeof makeRepo>;
  const orderId = new Types.ObjectId().toString();

  beforeEach(() => {
    repo = makeRepo();
    svc = new OrderService(
      repo as never,
      makeQueue() as never,
      makeQueue() as never,
      makePaymentService() as never,
      makeUserRepo() as never,
    );
  });

  it('không làm gì nếu order không tồn tại', async () => {
    repo.findById.mockResolvedValue(null);
    await svc.onReturned(orderId);
    expect(repo.updateOrder).not.toHaveBeenCalled();
  });

  it('COD: RETURNED/CANCELLED, không đổi paymentStatus', async () => {
    repo.findById.mockResolvedValue({ paymentMethod: PaymentMethod.COD });
    await svc.onReturned(orderId);
    expect(repo.updateOrder).toHaveBeenCalledWith(orderId, {
      fulfillmentStatus: FulfillmentStatus.RETURNED,
      orderStatus: OrderStatus.CANCELLED,
    });
  });

  it('ONLINE: RETURNED/CANCELLED + paymentStatus=REFUND_PENDING', async () => {
    repo.findById.mockResolvedValue({ paymentMethod: PaymentMethod.ONLINE });
    await svc.onReturned(orderId);
    expect(repo.updateOrder).toHaveBeenCalledWith(orderId, {
      fulfillmentStatus: FulfillmentStatus.RETURNED,
      orderStatus: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUND_PENDING,
    });
  });
});

describe('OrderService.onPaymentSuccess', () => {
  let svc: OrderService;
  let repo: ReturnType<typeof makeRepo>;
  let notifyQueue: ReturnType<typeof makeQueue>;
  let userRepo: ReturnType<typeof makeUserRepo>;
  const orderId = new Types.ObjectId().toString();
  const customerId = new Types.ObjectId();

  const baseOrder = {
    _id: orderId,
    customerId,
    paymentStatus: PaymentStatus.PENDING,
    hasPrintItems: false,
    items: [],
    shippingAddress: { recipientName: 'A', phone: '0900000000' },
  };

  beforeEach(() => {
    repo = makeRepo();
    notifyQueue = makeQueue();
    userRepo = makeUserRepo();
    svc = new OrderService(
      repo as never,
      makeQueue() as never,
      notifyQueue as never,
      makePaymentService() as never,
      userRepo as never,
    );
  });

  it('phát payment.success với email khách hàng sau khi thanh toán thành công', async () => {
    repo.findById.mockResolvedValue({ ...baseOrder });
    repo.appendTransaction.mockResolvedValue(undefined);
    repo.updateOrder.mockResolvedValue({
      ...baseOrder,
      paymentStatus: PaymentStatus.PAID,
    });
    userRepo.findActiveById.mockResolvedValue({
      _id: customerId,
      email: 'khach@example.com',
    });

    await svc.onPaymentSuccess(orderId, 'txn-1', 100000, 'PAYOS');

    expect(userRepo.findActiveById).toHaveBeenCalledWith(customerId);
    expect(notifyQueue.add).toHaveBeenCalledWith(
      'payment.success',
      {
        orderId,
        customerId: customerId.toString(),
        customerEmail: 'khach@example.com',
        amount: 100000,
      },
      { removeOnComplete: true },
    );
  });

  it('bỏ qua phát payment.success (log warn) nếu không tìm thấy customer', async () => {
    repo.findById.mockResolvedValue({ ...baseOrder });
    repo.appendTransaction.mockResolvedValue(undefined);
    repo.updateOrder.mockResolvedValue({
      ...baseOrder,
      paymentStatus: PaymentStatus.PAID,
    });
    userRepo.findActiveById.mockResolvedValue(null);

    await svc.onPaymentSuccess(orderId, 'txn-1', 100000, 'PAYOS');

    expect(notifyQueue.add).not.toHaveBeenCalled();
  });

  it('không phát payment.success nếu đơn đã PAID trước đó (idempotent)', async () => {
    repo.findById.mockResolvedValue({
      ...baseOrder,
      paymentStatus: PaymentStatus.PAID,
    });

    await svc.onPaymentSuccess(orderId, 'txn-1', 100000, 'PAYOS');

    expect(notifyQueue.add).not.toHaveBeenCalled();
    expect(repo.appendTransaction).not.toHaveBeenCalled();
  });
});
