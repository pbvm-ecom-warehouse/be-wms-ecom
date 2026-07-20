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
});

const makeQueue = () => ({ add: jest.fn() });
const makePaymentService = () => ({});

describe('OrderService.onReturned', () => {
  let svc: OrderService;
  let repo: ReturnType<typeof makeRepo>;
  const orderId = new Types.ObjectId().toString();

  beforeEach(() => {
    repo = makeRepo();
    svc = new OrderService(
      repo as never,
      makeQueue() as never,
      makePaymentService() as never,
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
