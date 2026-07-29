import { Types } from 'mongoose';
import { PrintStage } from '@app/events';
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
  findTransactionByProviderTxnId: jest.fn(),
  listTransactions: jest.fn(),
});

const makeQueue = () => ({ add: jest.fn() });
const makePaymentService = () => ({});
const makeUserRepo = () => ({ findActiveById: jest.fn() });

const createService = (
  repo: ReturnType<typeof makeRepo>,
  orderQueue = makeQueue(),
  notifyQueue = makeQueue(),
  printQueue = makeQueue(),
  userRepo = makeUserRepo(),
) => ({
  service: new OrderService(
    repo as never,
    orderQueue as never,
    notifyQueue as never,
    printQueue as never,
    makePaymentService() as never,
    userRepo as never,
  ),
  orderQueue,
  notifyQueue,
  printQueue,
  userRepo,
});

describe('OrderService.onReturned', () => {
  let svc: OrderService;
  let repo: ReturnType<typeof makeRepo>;
  const orderId = new Types.ObjectId().toString();

  beforeEach(() => {
    repo = makeRepo();
    svc = createService(repo).service;
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

describe('OrderService.returnOrder', () => {
  it('phát order.returned kèm orderCode và jobId idempotent', async () => {
    const repo = makeRepo();
    const { service, orderQueue } = createService(repo);
    const orderId = new Types.ObjectId().toString();
    const customerId = new Types.ObjectId();
    repo.findById.mockResolvedValue({
      code: 'ORD-20260730-0001',
      customerId,
      fulfillmentStatus: FulfillmentStatus.DELIVERED,
      placedAt: new Date(),
      items: [{ sku: 'SKU-1', quantity: 2, isPrintItem: false }],
    });
    repo.updateOrder.mockResolvedValue({ _id: orderId });

    await service.returnOrder(orderId, customerId.toString());

    expect(orderQueue.add).toHaveBeenCalledWith(
      'order.returned',
      {
        orderId,
        orderCode: 'ORD-20260730-0001',
        items: [{ sku: 'SKU-1', quantity: 2 }],
      },
      { jobId: `order-returned-${orderId}` },
    );
  });
});

describe('OrderService.onStockReserved', () => {
  it('phát order.ready_to_fulfill kèm orderCode và jobId idempotent cho COD', async () => {
    const repo = makeRepo();
    const { service, orderQueue } = createService(repo);
    const orderId = new Types.ObjectId().toString();
    repo.findById.mockResolvedValue({
      code: 'ORD-20260730-0001',
      paymentMethod: PaymentMethod.COD,
      total: 250000,
      items: [{ sku: 'SKU-1', quantity: 2 }],
      shippingAddress: {
        recipientName: 'A',
        phone: '0900000000',
        street: '123 Le Loi',
      },
    });

    await service.onStockReserved(orderId);

    expect(orderQueue.add).toHaveBeenCalledWith(
      'order.ready_to_fulfill',
      expect.objectContaining({
        orderId,
        orderCode: 'ORD-20260730-0001',
      }),
      { jobId: `order-ready-${orderId}` },
    );
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
    code: 'ORD-20260730-0001',
    customerId,
    total: 100000,
    paymentStatus: PaymentStatus.UNPAID,
    paymentMethod: PaymentMethod.ONLINE,
    orderStatus: OrderStatus.PLACED,
    fulfillmentStatus: FulfillmentStatus.NONE,
    hasPrintItems: false,
    items: [],
    shippingAddress: { recipientName: 'A', phone: '0900000000' },
  };

  beforeEach(() => {
    repo = makeRepo();
    notifyQueue = makeQueue();
    userRepo = makeUserRepo();
    svc = createService(
      repo,
      makeQueue(),
      notifyQueue,
      makeQueue(),
      userRepo,
    ).service;
  });

  it('phát payment.success với email khách hàng sau khi thanh toán thành công', async () => {
    repo.findById.mockResolvedValue({ ...baseOrder });
    repo.appendTransaction.mockResolvedValue(undefined);
    repo.listTransactions.mockResolvedValue([
      { status: 'SUCCESS', type: 'CHARGE', amount: 100000 },
    ]);
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
      { jobId: `payment-success-${orderId}-txn-1` },
    );
  });

  it('bỏ qua phát payment.success (log warn) nếu không tìm thấy customer', async () => {
    repo.findById.mockResolvedValue({ ...baseOrder });
    repo.appendTransaction.mockResolvedValue(undefined);
    repo.listTransactions.mockResolvedValue([
      { status: 'SUCCESS', type: 'CHARGE', amount: 100000 },
    ]);
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

describe('OrderService print contract', () => {
  let repo: ReturnType<typeof makeRepo>;
  let orderQueue: ReturnType<typeof makeQueue>;
  let printQueue: ReturnType<typeof makeQueue>;
  let svc: OrderService;

  const orderId = new Types.ObjectId().toString();
  const customerId = new Types.ObjectId();
  const printItem = {
    orderItemId: 'line-print-1',
    sku: 'CUP-HRT-PET-500-CLR',
    blankSku: 'CUP-HRT-PET-500-CLR',
    name: 'Ly in logo',
    unitPrice: 100000,
    quantity: 5,
    isPrintItem: true,
    designFile: 'https://cdn.example.com/design.png',
    designId: 'design-1',
  };
  const normalItem = {
    orderItemId: 'line-normal-1',
    sku: 'MAT-SUGAR-WHITE-1KG',
    name: 'Đường',
    unitPrice: 50000,
    quantity: 2,
    isPrintItem: false,
  };
  const basePrintOrder = {
    _id: orderId,
    customerId,
    code: 'ORD-20260730-001',
    total: 1000000,
    paymentMethod: PaymentMethod.ONLINE,
    paymentStatus: PaymentStatus.UNPAID,
    orderStatus: OrderStatus.PLACED,
    fulfillmentStatus: FulfillmentStatus.NONE,
    hasPrintItems: true,
    items: [printItem],
    shippingAddress: {
      recipientName: 'Khách hàng',
      phone: '0900000000',
      line: '1 Đường A',
      ward: 'Phường A',
      district: 'Quận A',
      province: 'TP.HCM',
    },
  };

  beforeEach(() => {
    repo = makeRepo();
    orderQueue = makeQueue();
    printQueue = makeQueue();
    svc = createService(repo, orderQueue, makeQueue(), printQueue).service;
    repo.appendTransaction.mockResolvedValue(undefined);
    repo.updateOrder.mockImplementation(
      (_id: string, updates: Record<string, unknown>) =>
        Promise.resolve({
          ...basePrintOrder,
          ...updates,
        }),
    );
  });

  it('phát print.requested SAMPLE bằng orderId thật, line id + blankSku và jobId xác định', async () => {
    repo.findById.mockResolvedValue({ ...basePrintOrder });
    repo.listTransactions.mockResolvedValue([
      { status: 'SUCCESS', type: 'CHARGE', amount: 300000 },
    ]);

    await svc.onPaymentSuccess(orderId, 'txn-sample', 300000, 'PAYOS');

    expect(printQueue.add).toHaveBeenCalledWith(
      'print.requested',
      {
        orderId,
        orderCode: 'ORD-20260730-001',
        stage: 'SAMPLE',
        items: [
          {
            orderItemId: printItem.orderItemId,
            blankSku: printItem.blankSku,
            quantity: 1,
            designFile: printItem.designFile,
            designId: printItem.designId,
          },
        ],
        orderDetail: expect.objectContaining({
          _id: orderId,
          items: expect.any(Array),
        }),
      },
      { jobId: `print-requested-${orderId}-SAMPLE` },
    );
  });

  it('phát print.requested PRODUCTION full quantity với jobId tách stage', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      fulfillmentStatus: FulfillmentStatus.SAMPLE_PRINTED,
    });
    repo.listTransactions.mockResolvedValue([
      { status: 'SUCCESS', type: 'CHARGE', amount: 600000 },
    ]);

    await svc.onPaymentSuccess(
      orderId,
      'txn-production',
      300000,
      'MANUAL_ADMIN',
    );

    expect(printQueue.add).toHaveBeenCalledWith(
      'print.requested',
      {
        orderId,
        orderCode: 'ORD-20260730-001',
        stage: 'PRODUCTION',
        items: [
          {
            orderItemId: printItem.orderItemId,
            blankSku: printItem.blankSku,
            quantity: printItem.quantity,
            designFile: printItem.designFile,
            designId: printItem.designId,
          },
        ],
        orderDetail: expect.objectContaining({
          _id: orderId,
          items: expect.any(Array),
        }),
      },
      { jobId: `print-requested-${orderId}-PRODUCTION` },
    );
  });

  it('chặn xác nhận 60% của Manager trước khi mẫu đã hoàn tất', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
    });
    repo.findTransactionByProviderTxnId.mockResolvedValue(null);

    await expect(
      svc.onPaymentSuccess(
        orderId,
        'manual-production-too-early',
        300000,
        'MANUAL_ADMIN',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(repo.appendTransaction).not.toHaveBeenCalled();
    expect(repo.updateOrder).not.toHaveBeenCalled();
    expect(printQueue.add).not.toHaveBeenCalled();
  });

  it('dùng printedSku khi thanh toán cuối phát order.ready_to_fulfill', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.PROGRESS_PAID,
      fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      items: [{ ...printItem, printedSku: 'CUP-HRT-PET-500-CLR-DSG001' }],
    });
    repo.listTransactions.mockResolvedValue([
      { status: 'SUCCESS', type: 'CHARGE', amount: 1000000 },
    ]);

    await svc.onPaymentSuccess(orderId, 'txn-final', 400000, 'PAYOS');

    expect(repo.updateOrder).toHaveBeenCalledWith(
      orderId,
      expect.objectContaining({
        paymentStatus: PaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      }),
    );
    expect(orderQueue.add).toHaveBeenCalledWith(
      'order.ready_to_fulfill',
      expect.objectContaining({
        orderId,
        orderCode: basePrintOrder.code,
        items: [
          { sku: 'CUP-HRT-PET-500-CLR-DSG001', quantity: printItem.quantity },
        ],
      }),
      { jobId: `order-ready-${orderId}` },
    );
  });

  it('retry webhook giao dịch trùng vẫn phát lại SAMPLE nếu lần đầu queue lỗi sau khi đã lưu order', async () => {
    const awaitingSampleOrder = {
      ...basePrintOrder,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      orderStatus: OrderStatus.CONFIRMED,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
    };
    repo.findById
      .mockResolvedValueOnce({ ...basePrintOrder })
      .mockResolvedValueOnce(awaitingSampleOrder);
    repo.listTransactions.mockResolvedValue([
      { status: 'SUCCESS', type: 'CHARGE', amount: 300000 },
    ]);
    repo.appendTransaction
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ code: 11000 });
    repo.findTransactionByProviderTxnId.mockResolvedValue({
      orderId: new Types.ObjectId(orderId),
    });
    printQueue.add
      .mockRejectedValueOnce(new Error('Redis tạm thời mất kết nối'))
      .mockResolvedValueOnce(undefined);

    await expect(
      svc.onPaymentSuccess(orderId, 'txn-sample-retry', 300000, 'PAYOS'),
    ).rejects.toThrow('Redis tạm thời mất kết nối');

    await expect(
      svc.onPaymentSuccess(orderId, 'txn-sample-retry', 300000, 'PAYOS'),
    ).resolves.toBeDefined();

    // Retry áp lại trạng thái idempotently để tự chữa cả trường hợp update DB
    // lẫn enqueue event bị lỗi sau khi transaction thanh toán đã được lưu.
    expect(repo.updateOrder).toHaveBeenCalledTimes(2);
    expect(printQueue.add).toHaveBeenCalledTimes(2);
    expect(printQueue.add).toHaveBeenLastCalledWith(
      'print.requested',
      expect.objectContaining({ orderId, stage: PrintStage.SAMPLE }),
      { jobId: `print-requested-${orderId}-SAMPLE` },
    );
  });

  it('retry giao dịch 60% đã lưu nhưng update order lỗi vẫn tiến lên PRODUCTION', async () => {
    const sampleApprovedOrder = {
      ...basePrintOrder,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      fulfillmentStatus: FulfillmentStatus.SAMPLE_PRINTED,
      items: [
        {
          ...printItem,
          sampleProofImage: 'https://cdn.example.com/proof.jpg',
        },
      ],
    };
    repo.findById.mockResolvedValue(sampleApprovedOrder);
    repo.listTransactions.mockResolvedValue([
      { status: 'SUCCESS', type: 'CHARGE', amount: 300000 },
      { status: 'SUCCESS', type: 'CHARGE', amount: 300000 },
    ]);
    repo.appendTransaction
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ code: 11000 });
    repo.findTransactionByProviderTxnId.mockResolvedValue({
      orderId: new Types.ObjectId(orderId),
    });
    repo.updateOrder
      .mockRejectedValueOnce(new Error('Mongo tạm thời lỗi sau khi lưu txn'))
      .mockResolvedValueOnce({
        ...sampleApprovedOrder,
        paymentStatus: PaymentStatus.PROGRESS_PAID,
        fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
      });

    await expect(
      svc.onPaymentSuccess(
        orderId,
        'manual-production-recovery',
        300000,
        'MANUAL_ADMIN',
      ),
    ).rejects.toThrow('Mongo tạm thời lỗi sau khi lưu txn');

    await expect(
      svc.onPaymentSuccess(
        orderId,
        'manual-production-recovery',
        300000,
        'MANUAL_ADMIN',
      ),
    ).resolves.toBeDefined();

    expect(repo.updateOrder).toHaveBeenCalledTimes(2);
    expect(printQueue.add).toHaveBeenCalledWith(
      'print.requested',
      expect.objectContaining({ orderId, stage: PrintStage.PRODUCTION }),
      { jobId: `print-requested-${orderId}-PRODUCTION` },
    );
  });

  it('vẫn ghi nhận PAID nhưng giữ READY_TO_PICK và không phát fulfillment khi thiếu printedSku', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.PROGRESS_PAID,
      fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
    });
    repo.listTransactions.mockResolvedValue([
      { status: 'SUCCESS', type: 'CHARGE', amount: 1000000 },
    ]);

    await svc.onPaymentSuccess(orderId, 'txn-invalid-final', 400000, 'PAYOS');

    expect(repo.appendTransaction).toHaveBeenCalled();
    expect(repo.updateOrder).toHaveBeenCalledWith(
      orderId,
      expect.objectContaining({
        paymentStatus: PaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      }),
    );
    expect(orderQueue.add).not.toHaveBeenCalled();
  });

  it('không phát fulfillment nếu printedSku bị corrupt và vẫn bằng blankSku', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.PROGRESS_PAID,
      fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      items: [{ ...printItem, printedSku: printItem.blankSku }],
    });
    repo.listTransactions.mockResolvedValue([
      { status: 'SUCCESS', type: 'CHARGE', amount: 1000000 },
    ]);

    await svc.onPaymentSuccess(orderId, 'txn-corrupt-final', 400000, 'PAYOS');

    expect(repo.updateOrder).toHaveBeenCalledWith(
      orderId,
      expect.objectContaining({
        paymentStatus: PaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      }),
    );
    expect(orderQueue.add).not.toHaveBeenCalled();
  });

  it('completion SAMPLE cập nhật proof nhưng không phát fulfillment', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
    });

    await svc.onPrintCompleted({
      orderId,
      printJobId: 'print-job-sample',
      stage: PrintStage.SAMPLE,
      items: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: 1,
        },
      ],
      proofImage: 'https://cdn.example.com/proof.jpg',
    });

    expect(repo.updateOrder).toHaveBeenCalledWith(
      orderId,
      expect.objectContaining({
        fulfillmentStatus: FulfillmentStatus.SAMPLE_PRINTED,
        items: [
          expect.objectContaining({
            orderItemId: printItem.orderItemId,
            sampleProofImage: 'https://cdn.example.com/proof.jpg',
          }),
        ],
      }),
    );
    expect(orderQueue.add).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'proof rỗng',
      proofImage: ' ',
      mappings: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: 1,
        },
      ],
    },
    {
      name: 'mapping rỗng',
      proofImage: 'https://cdn.example.com/proof.jpg',
      mappings: [],
    },
    {
      name: 'quantity không phải 1',
      proofImage: 'https://cdn.example.com/proof.jpg',
      mappings: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: printItem.quantity,
        },
      ],
    },
  ])('reject completion SAMPLE invalid: $name', async (input) => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
    });

    await expect(
      svc.onPrintCompleted({
        orderId,
        printJobId: 'print-job-sample',
        stage: PrintStage.SAMPLE,
        items: input.mappings,
        proofImage: input.proofImage,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(repo.updateOrder).not.toHaveBeenCalled();
  });

  it('không cho SAMPLE đến muộn regress READY_TO_PICK về SAMPLE_PRINTED', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      items: [
        {
          ...printItem,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          printJobId: 'print-job-production',
        },
      ],
    });

    await expect(
      svc.onPrintCompleted({
        orderId,
        printJobId: 'print-job-sample-late',
        stage: PrintStage.SAMPLE,
        items: [
          {
            orderItemId: printItem.orderItemId,
            printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
            quantity: 1,
          },
        ],
        proofImage: 'https://cdn.example.com/proof.jpg',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(repo.updateOrder).not.toHaveBeenCalled();
    expect(orderQueue.add).not.toHaveBeenCalled();
  });

  it('reject PRODUCTION đến sớm trong cửa sổ mới chỉ thanh toán cọc in SAMPLE', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
    });

    await expect(
      svc.onPrintCompleted({
        orderId,
        printJobId: 'print-job-production-early',
        stage: PrintStage.PRODUCTION,
        items: [
          {
            orderItemId: printItem.orderItemId,
            printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
            quantity: printItem.quantity,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(repo.updateOrder).not.toHaveBeenCalled();
  });

  it('reject SAMPLE đến muộn trong cửa sổ đang chờ in PRODUCTION', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.PROGRESS_PAID,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
      items: [
        {
          ...printItem,
          sampleProofImage: 'https://cdn.example.com/proof-old.jpg',
        },
      ],
    });

    await expect(
      svc.onPrintCompleted({
        orderId,
        printJobId: 'print-job-sample-late',
        stage: PrintStage.SAMPLE,
        items: [
          {
            orderItemId: printItem.orderItemId,
            printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
            quantity: 1,
          },
        ],
        proofImage: 'https://cdn.example.com/proof-new.jpg',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(repo.updateOrder).not.toHaveBeenCalled();
  });

  it('no-op SAMPLE duplicate khi proof và mapping hợp lệ đã ở SAMPLE_PRINTED', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      fulfillmentStatus: FulfillmentStatus.SAMPLE_PRINTED,
      items: [
        {
          ...printItem,
          sampleProofImage: 'https://cdn.example.com/proof.jpg',
        },
      ],
    });

    await svc.onPrintCompleted({
      orderId,
      printJobId: 'print-job-sample',
      stage: PrintStage.SAMPLE,
      items: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: 1,
        },
      ],
      proofImage: 'https://cdn.example.com/proof.jpg',
    });

    expect(repo.updateOrder).not.toHaveBeenCalled();
    expect(orderQueue.add).not.toHaveBeenCalled();
  });

  it('completion PRODUCTION map đúng từng line và fulfillment dùng printedSku', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
      items: [
        {
          ...printItem,
          sampleProofImage: 'https://cdn.example.com/proof.jpg',
        },
        normalItem,
      ],
    });

    await svc.onPrintCompleted({
      orderId,
      printJobId: 'print-job-production',
      stage: PrintStage.PRODUCTION,
      items: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: printItem.quantity,
        },
      ],
    });

    expect(repo.updateOrder).toHaveBeenCalledWith(orderId, {
      fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      items: [
        expect.objectContaining({
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          printJobId: 'print-job-production',
        }),
        normalItem,
      ],
    });
    expect(orderQueue.add).toHaveBeenCalledWith(
      'order.ready_to_fulfill',
      expect.objectContaining({
        orderId,
        items: [
          { sku: 'CUP-HRT-PET-500-CLR-DSG001', quantity: printItem.quantity },
          { sku: normalItem.sku, quantity: normalItem.quantity },
        ],
      }),
      { jobId: `order-ready-${orderId}` },
    );
  });

  it('PRODUCTION duplicate không ghi DB nhưng đối soát lại fulfillment deterministic', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      items: [
        {
          ...printItem,
          sampleProofImage: 'https://cdn.example.com/proof.jpg',
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          printJobId: 'print-job-production',
        },
      ],
    });

    await svc.onPrintCompleted({
      orderId,
      printJobId: 'print-job-production',
      stage: PrintStage.PRODUCTION,
      items: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: printItem.quantity,
        },
      ],
    });

    expect(repo.updateOrder).not.toHaveBeenCalled();
    expect(orderQueue.add).toHaveBeenCalledWith(
      'order.ready_to_fulfill',
      expect.objectContaining({
        orderId,
        items: [
          { sku: 'CUP-HRT-PET-500-CLR-DSG001', quantity: printItem.quantity },
        ],
      }),
      { jobId: `order-ready-${orderId}` },
    );
  });

  it('retry print.completed PRODUCTION vẫn phát lại fulfillment nếu lần đầu queue lỗi sau khi đã lưu order', async () => {
    const printedSku = 'CUP-HRT-PET-500-CLR-DSG001';
    const awaitingProductionOrder = {
      ...basePrintOrder,
      paymentStatus: PaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
      items: [
        {
          ...printItem,
          sampleProofImage: 'https://cdn.example.com/proof.jpg',
        },
      ],
    };
    const readyOrder = {
      ...awaitingProductionOrder,
      fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      items: [
        {
          ...awaitingProductionOrder.items[0],
          printedSku,
          printJobId: 'print-job-production-retry',
        },
      ],
    };
    repo.findById
      .mockResolvedValueOnce(awaitingProductionOrder)
      .mockResolvedValueOnce(readyOrder);
    orderQueue.add
      .mockRejectedValueOnce(new Error('Redis tạm thời mất kết nối'))
      .mockResolvedValueOnce(undefined);
    const payload = {
      orderId,
      printJobId: 'print-job-production-retry',
      stage: PrintStage.PRODUCTION,
      items: [
        {
          orderItemId: printItem.orderItemId,
          printedSku,
          quantity: printItem.quantity,
        },
      ],
    };

    await expect(svc.onPrintCompleted(payload)).rejects.toThrow(
      'Redis tạm thời mất kết nối',
    );
    await expect(svc.onPrintCompleted(payload)).resolves.toBeUndefined();

    expect(repo.updateOrder).toHaveBeenCalledTimes(1);
    expect(orderQueue.add).toHaveBeenCalledTimes(2);
    expect(orderQueue.add).toHaveBeenLastCalledWith(
      'order.ready_to_fulfill',
      expect.objectContaining({
        orderId,
        items: [{ sku: printedSku, quantity: printItem.quantity }],
      }),
      { jobId: `order-ready-${orderId}` },
    );
  });

  it('reject completion nếu dòng order legacy thiếu blankSku', async () => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.PROGRESS_PAID,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
      items: [
        {
          ...printItem,
          blankSku: undefined,
          sampleProofImage: 'https://cdn.example.com/proof.jpg',
        },
      ],
    });

    await expect(
      svc.onPrintCompleted({
        orderId,
        printJobId: 'print-job-production',
        stage: PrintStage.PRODUCTION,
        items: [
          {
            orderItemId: printItem.orderItemId,
            printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
            quantity: printItem.quantity,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(repo.updateOrder).not.toHaveBeenCalled();
  });

  it.each([
    {
      orderStatus: OrderStatus.CANCELLED,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
    },
    {
      orderStatus: OrderStatus.CONFIRMED,
      fulfillmentStatus: FulfillmentStatus.SHIPPED,
    },
    {
      orderStatus: OrderStatus.CLOSED,
      fulfillmentStatus: FulfillmentStatus.DELIVERED,
    },
  ])(
    'không regress đơn terminal $orderStatus/$fulfillmentStatus khi nhận completion',
    async ({ orderStatus, fulfillmentStatus }) => {
      repo.findById.mockResolvedValue({
        ...basePrintOrder,
        orderStatus,
        fulfillmentStatus,
      });

      await expect(
        svc.onPrintCompleted({
          orderId,
          printJobId: 'print-job-production',
          stage: PrintStage.PRODUCTION,
          items: [
            {
              orderItemId: printItem.orderItemId,
              printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
              quantity: printItem.quantity,
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(repo.updateOrder).not.toHaveBeenCalled();
      expect(orderQueue.add).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: 'mapping rỗng',
      mappings: [],
    },
    {
      name: 'thiếu line',
      mappings: [
        {
          orderItemId: 'line-khac',
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: 5,
        },
      ],
    },
    {
      name: 'sai số lượng',
      mappings: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: 4,
        },
      ],
    },
    {
      name: 'printedSku rỗng',
      mappings: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: ' ',
          quantity: 5,
        },
      ],
    },
    {
      name: 'printedSku vẫn là blankSku',
      mappings: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: printItem.blankSku,
          quantity: 5,
        },
      ],
    },
    {
      name: 'mapping thừa',
      mappings: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: 5,
        },
        {
          orderItemId: 'line-thua',
          printedSku: 'CUP-HRT-PET-500-CLR-DSG002',
          quantity: 1,
        },
      ],
    },
    {
      name: 'mapping trùng line id',
      mappings: [
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: 5,
        },
        {
          orderItemId: printItem.orderItemId,
          printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
          quantity: 5,
        },
      ],
    },
  ])('reject completion PRODUCTION invalid: $name', async ({ mappings }) => {
    repo.findById.mockResolvedValue({
      ...basePrintOrder,
      paymentStatus: PaymentStatus.PROGRESS_PAID,
      fulfillmentStatus: FulfillmentStatus.AWAITING_PRINT,
      items: [
        {
          ...printItem,
          sampleProofImage: 'https://cdn.example.com/proof.jpg',
        },
      ],
    });

    await expect(
      svc.onPrintCompleted({
        orderId,
        printJobId: 'print-job-production',
        stage: PrintStage.PRODUCTION,
        items: mappings,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(repo.updateOrder).not.toHaveBeenCalled();
    expect(orderQueue.add).not.toHaveBeenCalled();
  });

  it('reject completion thiếu printJobId trước khi cập nhật đơn', async () => {
    repo.findById.mockResolvedValue({ ...basePrintOrder });

    await expect(
      svc.onPrintCompleted({
        orderId,
        printJobId: '',
        stage: PrintStage.PRODUCTION,
        items: [
          {
            orderItemId: printItem.orderItemId,
            printedSku: 'CUP-HRT-PET-500-CLR-DSG001',
            quantity: 5,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(repo.updateOrder).not.toHaveBeenCalled();
  });
});
