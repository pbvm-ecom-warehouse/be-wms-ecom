import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  EVENTS,
  QUEUES,
  PrintStage,
  type PaymentSuccessPayload,
  type PrintCompletedPayload,
  type PrintRequestedPayload,
} from '@app/events';
import { AppException } from '@app/common';
import { OrderRepository, type OrderFilterOptions } from './order.repository';
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Order,
  OrderItem,
} from './schemas/order.schema';
import { TxnStatus, TxnType } from './schemas/payment-transaction.schema';
import { Types } from 'mongoose';
import { PaymentService } from './payment.service';
import { UserRepository } from '../auth/repositories/user.repository';

const DUPLICATE_KEY_CODE = 11000;

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly repo: OrderRepository,
    @InjectQueue(QUEUES.ORDER) private readonly orderQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notifyQueue: Queue,
    @InjectQueue(QUEUES.PRINT) private readonly printQueue: Queue,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly userRepo: UserRepository,
  ) {}

  private validationError(message: string): AppException {
    return new AppException('VALIDATION_FAILED', message);
  }

  private toOrderDetail(order: unknown): Record<string, unknown> {
    return JSON.parse(JSON.stringify(order)) as Record<string, unknown>;
  }

  private toEventPaymentMethod(paymentMethod: PaymentMethod): 'COD' | 'ONLINE' {
    return paymentMethod === PaymentMethod.COD ? 'COD' : 'ONLINE';
  }

  /** BullMQ cấm dấu ':' trong custom jobId (ngoại lệ legacy sẽ bị bỏ). */
  private queueJobId(prefix: string, ...parts: unknown[]): string {
    return [
      prefix,
      ...parts.map((part) => encodeURIComponent(String(part))),
    ].join('-');
  }

  private async enqueuePrintRequested(
    orderId: string,
    order: Order,
    stage: PrintStage,
  ): Promise<void> {
    const payload: PrintRequestedPayload = {
      orderId,
      stage,
      items: this.buildPrintRequestedItems(order.items, stage),
      orderDetail: this.toOrderDetail(order),
    };
    await this.printQueue.add(EVENTS.PRINT_REQUESTED, payload, {
      jobId: this.queueJobId('print-requested', orderId, stage),
    });
  }

  private async enqueueOrderReady(
    orderId: string,
    order: Order,
    items: OrderItem[] = order.items,
  ): Promise<void> {
    await this.orderQueue.add(
      EVENTS.ORDER_READY_TO_FULFILL,
      {
        orderId,
        orderCode: order.code,
        items: this.buildFulfillmentItems(items),
        shippingAddress: order.shippingAddress,
        recipient: {
          name: order.shippingAddress.recipientName,
          phone: order.shippingAddress.phone,
        },
        paymentMethod: this.toEventPaymentMethod(order.paymentMethod),
        ...(order.paymentMethod === PaymentMethod.COD
          ? { codAmount: order.total }
          : {}),
        orderDetail: this.toOrderDetail({
          ...order,
          items,
        }),
      },
      { jobId: this.queueJobId('order-ready', orderId) },
    );
  }

  private async enqueuePaymentNotification(
    orderId: string,
    order: Order,
    amount: number,
    providerTxnId: string,
  ): Promise<void> {
    const customer = await this.userRepo.findActiveById(order.customerId);
    if (!customer) {
      this.logger.warn(
        `Không tìm thấy customer ${order.customerId.toString()} cho đơn ${orderId} → bỏ qua payment.success`,
      );
      return;
    }
    const payload: PaymentSuccessPayload = {
      orderId,
      customerId: order.customerId.toString(),
      customerEmail: customer.email,
      amount,
    };
    await this.notifyQueue.add(EVENTS.PAYMENT_SUCCESS, payload, {
      jobId: this.queueJobId('payment-success', orderId, providerTxnId),
    });
  }

  private async enqueuePrintCompletedNotification(
    orderId: string,
    order: Order,
    stage: PrintStage,
    printJobId: string,
    proofImage?: string,
  ): Promise<void> {
    const customer = await this.userRepo.findActiveById(order.customerId);
    if (!customer) return;
    await this.notifyQueue.add(
      EVENTS.PRINT_COMPLETED,
      {
        orderId,
        customerEmail: customer.email,
        customerId: order.customerId.toString(),
        ...(proofImage ? { proofImage } : {}),
      },
      {
        jobId: this.queueJobId(
          'print-completed-notification',
          orderId,
          stage,
          printJobId,
        ),
      },
    );
  }

  /**
   * DB đã lưu nhưng lần enqueue trước có thể lỗi. Webhook/event giao lại phải
   * tái phát đúng side effect hiện tại thay vì return và làm mất lệnh vĩnh viễn.
   */
  private async reconcilePaymentSideEffects(
    orderId: string,
    order: Order,
  ): Promise<void> {
    if (order.hasPrintItems) {
      const printItems = order.items.filter((item) => item.isPrintItem);
      const hasSampleProof =
        printItems.length > 0 &&
        printItems.every((item) => !!item.sampleProofImage?.trim());

      if (
        order.paymentStatus === PaymentStatus.DEPOSIT_PAID &&
        order.fulfillmentStatus === FulfillmentStatus.AWAITING_PRINT &&
        !hasSampleProof
      ) {
        await this.enqueuePrintRequested(orderId, order, PrintStage.SAMPLE);
        return;
      }

      if (
        (order.paymentStatus === PaymentStatus.PROGRESS_PAID ||
          order.paymentStatus === PaymentStatus.PAID) &&
        order.fulfillmentStatus === FulfillmentStatus.AWAITING_PRINT &&
        hasSampleProof
      ) {
        await this.enqueuePrintRequested(orderId, order, PrintStage.PRODUCTION);
        return;
      }

      if (
        order.paymentStatus === PaymentStatus.PAID &&
        order.fulfillmentStatus === FulfillmentStatus.READY_TO_PICK &&
        this.hasCompletePrintedSkuMapping(order.items)
      ) {
        await this.enqueueOrderReady(orderId, order);
      }
      return;
    }

    const shouldFulfillOnline =
      order.paymentMethod === PaymentMethod.ONLINE &&
      order.paymentStatus === PaymentStatus.PAID &&
      (order.fulfillmentStatus === FulfillmentStatus.READY_TO_PICK ||
        order.fulfillmentStatus === FulfillmentStatus.ISSUED);
    const shouldFulfillCod =
      order.paymentMethod === PaymentMethod.COD &&
      order.paymentStatus === PaymentStatus.DEPOSIT_PAID &&
      order.fulfillmentStatus === FulfillmentStatus.READY_TO_PICK;
    if (shouldFulfillOnline || shouldFulfillCod) {
      await this.enqueueOrderReady(orderId, order);
    }
  }

  /**
   * Event in chỉ dùng snapshot server-side trên OrderItem. Không nhận lại SKU
   * ly trống từ client và không dùng SKU catalog mơ hồ làm SKU đầu ra.
   */
  private buildPrintRequestedItems(
    items: OrderItem[],
    stage: PrintStage,
  ): PrintRequestedPayload['items'] {
    const printItems = items.filter((item) => item.isPrintItem);
    if (printItems.length === 0) {
      throw this.validationError('Đơn hàng không có dòng sản phẩm cần in');
    }

    const seenLineIds = new Set<string>();
    return printItems.map((item) => {
      const orderItemId = item.orderItemId?.trim();
      const blankSku = item.blankSku?.trim();
      const designFile = item.designFile?.trim();
      if (!orderItemId || seenLineIds.has(orderItemId)) {
        throw this.validationError(
          'Dòng sản phẩm in thiếu hoặc trùng orderItemId',
        );
      }
      if (!blankSku) {
        throw this.validationError(
          `Dòng in ${orderItemId} thiếu snapshot blankSku`,
        );
      }
      if (!designFile) {
        throw this.validationError(
          `Dòng in ${orderItemId} thiếu snapshot designFile`,
        );
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw this.validationError(
          `Dòng in ${orderItemId} có số lượng không hợp lệ`,
        );
      }
      seenLineIds.add(orderItemId);

      return {
        orderItemId,
        blankSku,
        quantity: stage === PrintStage.SAMPLE ? 1 : item.quantity,
        designFile,
        designId: item.designId,
      };
    });
  }

  /**
   * SKU xuất kho của dòng in là SKU CUP_PRINTED WMS đã trả về. Dòng thường
   * tiếp tục dùng SKU catalog gốc.
   */
  private buildFulfillmentItems(items: OrderItem[]) {
    return items.map((item) => {
      const sku = item.isPrintItem ? item.printedSku?.trim() : item.sku?.trim();
      if (!sku) {
        throw this.validationError(
          item.isPrintItem
            ? `Dòng in ${item.orderItemId || '(không có id)'} chưa có printedSku`
            : 'Dòng đơn hàng thường thiếu SKU',
        );
      }
      if (
        item.isPrintItem &&
        (!item.blankSku?.trim() || sku === item.blankSku.trim())
      ) {
        throw this.validationError(
          `Dòng in ${item.orderItemId || '(không có id)'} có mapping SKU không hợp lệ`,
        );
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw this.validationError(
          `Dòng ${item.orderItemId || sku} có số lượng không hợp lệ`,
        );
      }
      return { sku, quantity: item.quantity };
    });
  }

  private hasCompletePrintedSkuMapping(items: OrderItem[]): boolean {
    const printItems = items.filter((item) => item.isPrintItem);
    return (
      printItems.length > 0 &&
      printItems.every(
        (item) =>
          !!item.orderItemId?.trim() &&
          !!item.blankSku?.trim() &&
          !!item.printedSku?.trim() &&
          item.printedSku.trim() !== item.blankSku.trim() &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0,
      )
    );
  }

  private validatePrintCompletionMappings(
    printItems: OrderItem[],
    mappings: PrintCompletedPayload['items'] | undefined,
    stage: PrintStage,
  ) {
    if (
      !Array.isArray(mappings) ||
      mappings.length === 0 ||
      mappings.length !== printItems.length
    ) {
      throw this.validationError(
        `print.completed ${stage} phải map đủ chính xác mọi dòng in`,
      );
    }

    const mappingByLineId = new Map<string, (typeof mappings)[number]>();
    for (const mapping of mappings) {
      const lineId = String(mapping.orderItemId ?? '').trim();
      const printedSku = String(mapping.printedSku ?? '').trim();
      if (!lineId || !printedSku || mappingByLineId.has(lineId)) {
        throw this.validationError(
          `print.completed ${stage} có mapping dòng trống hoặc trùng`,
        );
      }
      mappingByLineId.set(lineId, {
        ...mapping,
        orderItemId: lineId,
        printedSku,
      });
    }

    for (const item of printItems) {
      const lineId = item.orderItemId?.trim();
      const blankSku = item.blankSku?.trim();
      const mapping = lineId ? mappingByLineId.get(lineId) : undefined;
      const expectedQuantity = stage === PrintStage.SAMPLE ? 1 : item.quantity;
      if (
        !lineId ||
        !blankSku ||
        !mapping ||
        !Number.isInteger(mapping.quantity) ||
        mapping.quantity !== expectedQuantity ||
        mapping.printedSku === blankSku
      ) {
        throw this.validationError(
          `print.completed ${stage} không khớp dòng ${lineId || '(không có id)'}`,
        );
      }
    }

    return mappingByLineId;
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID đơn hàng không hợp lệ');
    }
    const order = await this.repo.findById(id);
    if (!order) {
      throw new AppException('ORDER_NOT_FOUND');
    }
    return order;
  }

  async listByCustomer(customerId: string, filter?: OrderFilterOptions) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }
    return this.repo.listByCustomer(customerId, filter);
  }

  async listAll(filter?: OrderFilterOptions) {
    return this.repo.listAll(filter);
  }

  /**
   * Gọi sau khi WMS phản hồi giữ kho thành công (STOCK_RESERVED).
   *   - Nếu COD -> xác nhận và chuyển sang đóng gói.
   *   - Nếu ONLINE -> tiếp tục chờ thanh toán.
   */
  async onStockReserved(orderId: string) {
    const order = await this.repo.findById(orderId);
    if (!order) return;

    if (order.paymentMethod === PaymentMethod.COD) {
      // COD -> Xác nhận ngay -> Chuyển sang READY_TO_PICK
      await this.repo.updateOrder(orderId, {
        orderStatus: OrderStatus.CONFIRMED,
        fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      });

      // Dùng cùng helper để payload có orderCode và jobId idempotent như mọi
      // nhánh READY_TO_PICK khác.
      await this.enqueueOrderReady(orderId, order);

      this.logger.log(
        `Đơn COD ${orderId} -> CONFIRMED & READY_TO_PICK -> Đã phát lệnh xuất kho`,
      );
    }
  }

  /**
   * Gọi khi webhook xác nhận thanh toán thành công.
   * Cập nhật PAID, duyệt đơn, phát lệnh in (nếu có ly in) hoặc lệnh xuất kho.
   */
  async onPaymentSuccess(
    orderId: string,
    providerTxnId: string,
    amount: number,
    provider: string,
    rawPayload: Record<string, any> = {},
  ) {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw new AppException('ORDER_NOT_FOUND');
    }

    // Idempotency: nếu đơn đã thanh toán trước đó
    if (order.paymentStatus === PaymentStatus.PAID) {
      this.logger.warn(
        `Thanh toán trùng lặp: Đơn hàng ${orderId} đã ở trạng thái PAID`,
      );
      await this.reconcilePaymentSideEffects(orderId, order);
      return order;
    }

    // Nút manual 60% chính là cổng Manager xác nhận mẫu. Không cho tạo giao
    // dịch đợt 2 khi Printer chưa hoàn tất SAMPLE + proof, nếu không đơn sẽ
    // tiến lên PROGRESS_PAID nhưng SAMPLE đến sau lại bị từ chối.
    if (
      provider === 'MANUAL_ADMIN' &&
      order.hasPrintItems &&
      order.paymentStatus === PaymentStatus.DEPOSIT_PAID &&
      order.fulfillmentStatus !== FulfillmentStatus.SAMPLE_PRINTED
    ) {
      const existingTransaction =
        await this.repo.findTransactionByProviderTxnId(providerTxnId);
      if (!existingTransaction) {
        throw this.validationError(
          'Chỉ được xác nhận thanh toán 60% sau khi mẫu in đã hoàn tất và được duyệt',
        );
      }
    }

    // Ghi nhận dòng tiền thanh toán
    let duplicateTransaction = false;
    try {
      await this.repo.appendTransaction({
        orderId: new Types.ObjectId(order._id.toString()),
        type: TxnType.CHARGE,
        provider,
        amount,
        status: TxnStatus.SUCCESS,
        providerTxnId,
        raw: rawPayload,
      });
    } catch (err: unknown) {
      if ((err as { code?: number }).code === DUPLICATE_KEY_CODE) {
        duplicateTransaction = true;
        const existingTransaction =
          await this.repo.findTransactionByProviderTxnId(providerTxnId);
        if (
          !existingTransaction ||
          existingTransaction.orderId?.toString() !== order._id.toString()
        ) {
          throw this.validationError(
            `Mã giao dịch ${providerTxnId} không thuộc đơn hàng ${orderId}`,
          );
        }
        this.logger.warn(
          `Mã giao dịch ${providerTxnId} đã được xử lý (idempotency) -> Đối soát side effect`,
        );
      } else {
        throw err;
      }
    }

    // Luôn tính lại lũy kế cả khi txn trùng: lần trước có thể đã lưu transaction
    // nhưng update Order/enqueue event bị lỗi. Việc áp lại cùng trạng thái là
    // idempotent và giúp retry tự chữa thay vì làm mất lệnh SAMPLE/PRODUCTION.
    const txns = await this.repo.listTransactions(orderId);
    const paidTotal = txns
      .filter(
        (t) =>
          t.status === TxnStatus.SUCCESS &&
          (t.type === TxnType.CHARGE || t.type === TxnType.COD_COLLECT),
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const paidRatio = paidTotal / order.total;

    const prevPaymentStatus = order.paymentStatus as PaymentStatus;
    let nextPaymentStatus: PaymentStatus = prevPaymentStatus;
    let nextOrderStatus = order.orderStatus;
    if (nextOrderStatus === OrderStatus.CANCELLED) {
      if (provider === 'MANUAL_ADMIN') {
        nextOrderStatus = OrderStatus.CONFIRMED;
      } else {
        this.logger.warn(
          `Nhận thanh toán từ cổng ${provider} cho đơn hàng đã bị HỦY ${orderId} -> Bỏ qua không kích hoạt lại đơn`,
        );
        return order;
      }
    }
    let nextFulfillmentStatus = order.fulfillmentStatus;

    if (order.hasPrintItems) {
      // Đơn ly in KHÔNG có thanh toán 100% ngay — chỉ đi qua 3 đợt: 30% → 30% → 40%
      if (paidRatio >= 0.99) {
        // Đợt 3 (40% cuối): in chính thức đã xong, giờ có thể xuất kho
        nextPaymentStatus = PaymentStatus.PAID;
        nextOrderStatus = OrderStatus.CONFIRMED;
        if (order.fulfillmentStatus === FulfillmentStatus.READY_TO_PICK) {
          if (this.hasCompletePrintedSkuMapping(order.items)) {
            // READY_TO_PICK nghĩa là đủ điều kiện tạo phiếu xuất. Chỉ callback
            // goods.issued từ WMS mới được chuyển sang ISSUED.
            nextFulfillmentStatus = FulfillmentStatus.READY_TO_PICK;
          } else {
            // Vẫn ghi nhận thanh toán PAID nhưng giữ hàng chờ recovery mapping;
            // tuyệt đối không xuất nhầm SKU ly trống.
            this.logger.error(
              `Đơn in ${orderId} đã thanh toán đủ nhưng thiếu printedSku hợp lệ; giữ ${FulfillmentStatus.READY_TO_PICK}, không phát lệnh xuất kho`,
            );
          }
        }
        // Các trường hợp khác (AWAITING_PRINT, SAMPLE_PRINTED...): chỉ ghi nhận PAID, giữ nguyên fulfillmentStatus
      } else if (paidRatio >= 0.59) {
        nextPaymentStatus = PaymentStatus.PROGRESS_PAID;
        // Đợt 2: chuyển từ SAMPLE_PRINTED (đã xem xét mẫu) → AWAITING_PRINT (in chính thức)
        if (order.fulfillmentStatus === FulfillmentStatus.SAMPLE_PRINTED) {
          nextFulfillmentStatus = FulfillmentStatus.AWAITING_PRINT;
        }
      } else if (paidRatio >= 0.29) {
        nextPaymentStatus = PaymentStatus.DEPOSIT_PAID;
        nextOrderStatus = OrderStatus.CONFIRMED;
        // Đợt 1: bắt đầu in mẫu
        if (order.fulfillmentStatus === FulfillmentStatus.NONE) {
          nextFulfillmentStatus = FulfillmentStatus.AWAITING_PRINT;
        }
      }
    } else {
      if (paidRatio >= 0.99) {
        nextPaymentStatus = PaymentStatus.PAID;
        nextOrderStatus = OrderStatus.CONFIRMED;
        nextFulfillmentStatus = FulfillmentStatus.ISSUED;
      } else if (paidRatio >= 0.49) {
        nextPaymentStatus = PaymentStatus.DEPOSIT_PAID;
        nextOrderStatus = OrderStatus.CONFIRMED;
        nextFulfillmentStatus = FulfillmentStatus.READY_TO_PICK;
      }
    }

    const updated = await this.repo.updateOrder(orderId, {
      paymentStatus: nextPaymentStatus,
      orderStatus: nextOrderStatus,
      fulfillmentStatus: nextFulfillmentStatus,
    });
    const eventOrder = {
      ...order,
      paymentStatus: nextPaymentStatus,
      orderStatus: nextOrderStatus,
      fulfillmentStatus: nextFulfillmentStatus,
    } as Order;

    // Báo khách hàng thanh toán thành công (Ecom → Notification)
    await this.enqueuePaymentNotification(
      orderId,
      eventOrder,
      amount,
      providerTxnId,
    );

    if (duplicateTransaction) {
      await this.reconcilePaymentSideEffects(orderId, eventOrder);
      return updated;
    }

    // Phát lệnh in / lệnh xuất kho theo tiến trình mới
    if (order.hasPrintItems) {
      // ── Đợt 1 (DEPOSIT_PAID, ~30%): In BẢN MẪU (quantity = 1) ──
      if (
        nextFulfillmentStatus === FulfillmentStatus.AWAITING_PRINT &&
        order.fulfillmentStatus === FulfillmentStatus.NONE
      ) {
        const stage = PrintStage.SAMPLE;
        await this.enqueuePrintRequested(orderId, eventOrder, stage);
        this.logger.log(
          `Đơn in custom ${orderId} -> Phát lệnh in BẢN MẪU (sample) thành công`,
        );
      }

      // ── Đợt 2 (PROGRESS_PAID, ~60%): In CHÍNH THỨC (full quantity) ──
      if (
        nextFulfillmentStatus === FulfillmentStatus.AWAITING_PRINT &&
        order.fulfillmentStatus === FulfillmentStatus.SAMPLE_PRINTED
      ) {
        const stage = PrintStage.PRODUCTION;
        await this.enqueuePrintRequested(orderId, eventOrder, stage);
        this.logger.log(
          `Đơn in custom ${orderId} -> Phát lệnh in CHÍNH THỨC thành công`,
        );
      }

      // ── Đợt 3 (PAID, 100% ONLINE): Phát lệnh xuất kho ──
      if (
        nextPaymentStatus === PaymentStatus.PAID &&
        prevPaymentStatus !== PaymentStatus.PAID &&
        nextFulfillmentStatus === FulfillmentStatus.READY_TO_PICK &&
        this.hasCompletePrintedSkuMapping(order.items)
      ) {
        await this.enqueueOrderReady(orderId, eventOrder);
        this.logger.log(
          `Đơn in custom ${orderId} -> READY_TO_PICK -> Phát lệnh xuất kho thành công`,
        );
      }
    } else {
      // Đơn thường (không in):
      // - COD: xuất kho ngay khi cọc đợt 1 (50%)
      // - ONLINE: xuất kho khi đóng đủ 100%
      const isCodFulfill =
        order.paymentMethod === PaymentMethod.COD &&
        nextPaymentStatus === PaymentStatus.DEPOSIT_PAID &&
        prevPaymentStatus !== PaymentStatus.DEPOSIT_PAID;
      const isOnlineFulfill =
        order.paymentMethod === PaymentMethod.ONLINE &&
        nextPaymentStatus === PaymentStatus.PAID &&
        prevPaymentStatus !== PaymentStatus.PAID;

      if (isCodFulfill || isOnlineFulfill) {
        await this.enqueueOrderReady(orderId, eventOrder);
        this.logger.log(
          `Đơn hàng thường ${orderId} -> Phát lệnh xuất kho thành công`,
        );
      }
    }

    return updated;
  }

  /**
   * Hủy đơn hàng (do khách chủ động hủy hoặc do quá hạn thanh toán).
   */
  async cancelOrder(orderId: string, reason = '') {
    const order = await this.repo.findById(orderId);
    if (!order) return;

    // Ràng buộc trạng thái hủy: chỉ hủy trước khi hàng được đóng gói xuất kho
    const allowedCancel = [
      FulfillmentStatus.NONE,
      FulfillmentStatus.AWAITING_PRINT,
      FulfillmentStatus.READY_TO_PICK,
    ];

    if (!allowedCancel.includes(order.fulfillmentStatus)) {
      throw new AppException(
        'ORDER_NOT_CANCELLABLE',
        'Hàng đã được đóng gói hoặc xuất kho, không thể hủy đơn',
      );
    }

    // Đối với ly in custom: không cho hủy khi đã đưa xuống xưởng in
    if (
      order.hasPrintItems &&
      order.fulfillmentStatus === FulfillmentStatus.AWAITING_PRINT
    ) {
      throw new AppException(
        'ORDER_NOT_CANCELLABLE',
        'Đơn hàng in ấn đã đưa vào sản xuất, không thể hủy đơn',
      );
    }

    await this.repo.updateOrder(orderId, {
      orderStatus: OrderStatus.CANCELLED,
      cancelReason: reason,
    });

    // Phát lệnh cho WMS giải phóng kho
    await this.orderQueue.add(EVENTS.ORDER_CANCELLED, {
      orderId,
      reason,
    });

    // Nếu đơn hàng đã PAID trước đó -> chuyển sang REFUND_PENDING để thực hiện hoàn tiền sau
    if (order.paymentStatus === PaymentStatus.PAID) {
      await this.repo.updateOrder(orderId, {
        paymentStatus: PaymentStatus.REFUND_PENDING,
      });
    } else if (order.paymentMethod === PaymentMethod.ONLINE) {
      // Nếu chưa trả tiền và là đơn ONLINE -> tự động hủy link thanh toán PayOS
      await this.paymentService.cancelPayosPaymentLink(orderId, reason);
    }

    this.logger.log(`Hủy đơn hàng thành công: ${orderId} -> Lý do: ${reason}`);
  }

  /**
   * Hoàn trả hàng (RMA) sau khi giao thành công trong hạn 7 ngày.
   */
  async returnOrder(orderId: string, customerId: string) {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw new AppException('ORDER_NOT_FOUND');
    }

    if (order.customerId.toString() !== customerId) {
      throw new AppException(
        'FORBIDDEN',
        'Bạn không có quyền thao tác trên đơn hàng này',
      );
    }

    if (order.fulfillmentStatus !== FulfillmentStatus.DELIVERED) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Chỉ hỗ trợ hoàn trả khi đơn hàng đã giao thành công',
      );
    }

    // Kiểm tra thời hạn 7 ngày
    const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const deliveredAt =
      order.placedAt ?? (order as unknown as { createdAt: Date }).createdAt; // hoặc lấy trường updatedAt gần nhất
    if (Date.now() - new Date(deliveredAt).getTime() > RETURN_WINDOW_MS) {
      throw new AppException('ORDER_RETURN_EXPIRED');
    }

    // Không hỗ trợ hoàn trả ly in custom tự động
    if (order.items.some((i) => i.isPrintItem)) {
      throw new AppException('ORDER_PRINT_ITEM_NOT_RETURNABLE');
    }

    const updated = await this.repo.updateOrder(orderId, {
      fulfillmentStatus: FulfillmentStatus.RETURNED,
    });

    // Phát sự kiện hoàn trả về kho cho WMS biết để xử lý hoàn nhập kho
    await this.orderQueue.add(EVENTS.ORDER_RETURNED, {
      orderId,
      items: order.items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
    });

    this.logger.log(`Yêu cầu đổi trả đơn hàng ${orderId} được xác nhận`);
    return updated;
  }

  // ── CALLBACKS TỪ WMS CONSUMER ──────────────────────────────────────────────

  async onGoodsIssued(orderId: string, goodsIssueId: string) {
    await this.repo.updateOrder(orderId, {
      fulfillmentStatus: FulfillmentStatus.ISSUED,
    });
    this.logger.log(
      `WMS cập nhật: Đơn hàng ${orderId} đã xuất kho (GoodsIssue: ${goodsIssueId})`,
    );
  }

  async onPrintCompleted(payload: PrintCompletedPayload) {
    const rawOrderId = String(payload?.orderId ?? '').trim();
    if (!rawOrderId) {
      throw this.validationError('print.completed thiếu orderId');
    }

    // Tương thích đúng một trường hợp legacy an toàn: sample từng dùng hậu tố
    // "-sample". Legacy production không có stage/mapping sẽ bị từ chối.
    const isLegacySample = rawOrderId.endsWith('-sample');
    const orderId = isLegacySample ? rawOrderId.slice(0, -7) : rawOrderId;
    const stage =
      (payload as Partial<PrintCompletedPayload>).stage ??
      (isLegacySample ? PrintStage.SAMPLE : undefined);
    if (stage !== PrintStage.SAMPLE && stage !== PrintStage.PRODUCTION) {
      throw this.validationError('print.completed thiếu hoặc sai stage');
    }

    const printJobId = String(payload.printJobId ?? '').trim();
    if (!printJobId) {
      throw this.validationError('print.completed thiếu printJobId');
    }

    const order = await this.repo.findById(orderId);
    if (!order) {
      throw new AppException('ORDER_NOT_FOUND');
    }
    const isTerminalOrder =
      order.orderStatus === OrderStatus.CANCELLED ||
      order.orderStatus === OrderStatus.CLOSED ||
      [
        FulfillmentStatus.ISSUED,
        FulfillmentStatus.SHIPPED,
        FulfillmentStatus.DELIVERED,
        FulfillmentStatus.RETURNED,
      ].includes(order.fulfillmentStatus);
    if (isTerminalOrder) {
      throw this.validationError(
        `Không nhận print.completed cho đơn ${orderId} ở trạng thái kết thúc`,
      );
    }

    const printItems = order.items.filter((item) => item.isPrintItem);
    if (printItems.length === 0) {
      throw this.validationError(
        `Đơn ${orderId} không có dòng sản phẩm cần in`,
      );
    }

    if (stage === PrintStage.SAMPLE) {
      if (order.paymentStatus !== PaymentStatus.DEPOSIT_PAID) {
        throw this.validationError(
          `print.completed SAMPLE không đúng cửa sổ thanh toán của đơn ${orderId}`,
        );
      }
      const proofImage = payload.proofImage?.trim();
      if (!proofImage) {
        throw this.validationError(
          'print.completed SAMPLE thiếu ảnh proof hợp lệ',
        );
      }
      this.validatePrintCompletionMappings(
        printItems,
        payload.items,
        PrintStage.SAMPLE,
      );
      if (order.fulfillmentStatus === FulfillmentStatus.SAMPLE_PRINTED) {
        const isExactDuplicate = printItems.every(
          (item) => item.sampleProofImage?.trim() === proofImage,
        );
        if (isExactDuplicate) {
          await this.enqueuePrintCompletedNotification(
            orderId,
            order,
            stage,
            printJobId,
            proofImage,
          );
          this.logger.warn(
            `Đối soát print.completed SAMPLE trùng cho đơn ${orderId}`,
          );
          return;
        }
        throw this.validationError(
          `print.completed SAMPLE xung đột với kết quả đã lưu của đơn ${orderId}`,
        );
      }
      if (order.fulfillmentStatus !== FulfillmentStatus.AWAITING_PRINT) {
        throw this.validationError(
          `Không thể áp dụng print.completed SAMPLE khi đơn ${orderId} ở ${order.fulfillmentStatus}`,
        );
      }

      const items = order.items.map((item) =>
        item.isPrintItem ? { ...item, sampleProofImage: proofImage } : item,
      );

      await this.repo.updateOrder(orderId, {
        fulfillmentStatus: FulfillmentStatus.SAMPLE_PRINTED,
        items,
      });

      await this.enqueuePrintCompletedNotification(
        orderId,
        order,
        stage,
        printJobId,
        proofImage,
      );
      this.logger.log(
        `WMS in xong BẢN MẪU đơn ${orderId} -> SAMPLE_PRINTED -> Chờ khách xác nhận & thanh toán đợt 2. Ảnh mẫu: ${proofImage}`,
      );
      return;
    }

    const hasSampleProof = printItems.every(
      (item) => !!item.sampleProofImage?.trim(),
    );
    if (
      (order.paymentStatus !== PaymentStatus.PROGRESS_PAID &&
        order.paymentStatus !== PaymentStatus.PAID) ||
      !hasSampleProof
    ) {
      throw this.validationError(
        `print.completed PRODUCTION không đúng cửa sổ sau duyệt mẫu của đơn ${orderId}`,
      );
    }

    const mappingByLineId = this.validatePrintCompletionMappings(
      printItems,
      payload.items,
      PrintStage.PRODUCTION,
    );
    if (order.fulfillmentStatus === FulfillmentStatus.READY_TO_PICK) {
      const isExactDuplicate = printItems.every((item) => {
        const mapping = mappingByLineId.get(item.orderItemId);
        return (
          mapping?.printedSku === item.printedSku?.trim() &&
          item.printJobId === printJobId
        );
      });
      if (isExactDuplicate) {
        await this.enqueuePrintCompletedNotification(
          orderId,
          order,
          stage,
          printJobId,
        );
        if (
          order.paymentMethod === PaymentMethod.COD ||
          order.paymentStatus === PaymentStatus.PAID
        ) {
          await this.enqueueOrderReady(orderId, order);
        }
        this.logger.warn(
          `Đối soát print.completed PRODUCTION trùng cho đơn ${orderId}`,
        );
        return;
      }
      throw this.validationError(
        `print.completed PRODUCTION xung đột với kết quả đã lưu của đơn ${orderId}`,
      );
    }
    if (order.fulfillmentStatus !== FulfillmentStatus.AWAITING_PRINT) {
      throw this.validationError(
        `Không thể áp dụng print.completed PRODUCTION khi đơn ${orderId} ở ${order.fulfillmentStatus}`,
      );
    }

    const items = order.items.map((item) => {
      if (!item.isPrintItem) return item;
      const mapping = mappingByLineId.get(item.orderItemId);
      // Đã kiểm tra exact coverage ở trên.
      return {
        ...item,
        printedSku: mapping!.printedSku,
        printJobId,
      };
    });
    await this.repo.updateOrder(orderId, {
      fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      items,
    });

    await this.enqueuePrintCompletedNotification(
      orderId,
      order,
      stage,
      printJobId,
    );

    // COD: xuất kho luôn (thu tiền khi giao). ONLINE: chỉ xuất khi đã PAID 100%.
    if (
      order.paymentMethod === PaymentMethod.COD ||
      order.paymentStatus === PaymentStatus.PAID
    ) {
      const readyOrder = {
        ...order,
        items,
        fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      } as Order;
      await this.enqueueOrderReady(orderId, readyOrder, items);
      this.logger.log(
        `WMS in xong CHÍNH THỨC đơn ${orderId} -> READY_TO_PICK -> Phát lệnh xuất kho`,
      );
    } else {
      this.logger.log(
        `WMS in xong CHÍNH THỨC đơn ${orderId} -> READY_TO_PICK -> Chờ khách thanh toán nốt online đợt 3`,
      );
    }
  }

  async onShipped(orderId: string) {
    await this.repo.updateOrder(orderId, {
      fulfillmentStatus: FulfillmentStatus.SHIPPED,
    });
    this.logger.log(`WMS cập nhật: Đơn hàng ${orderId} đang được giao`);

    const order = await this.repo.findById(orderId);
    if (order) {
      const customer = await this.userRepo.findActiveById(order.customerId);
      if (customer) {
        await this.notifyQueue.add(
          EVENTS.SHIPMENT_SHIPPED,
          {
            orderId,
            customerEmail: customer.email,
            customerId: order.customerId.toString(),
          },
          { removeOnComplete: true },
        );
      }
    }
  }

  async onDelivered(orderId: string) {
    const order = await this.repo.findById(orderId);
    if (!order) return;

    const updates: Partial<Order> = {
      fulfillmentStatus: FulfillmentStatus.DELIVERED,
      orderStatus: OrderStatus.CLOSED,
    };

    // Nếu COD -> chuyển sang PAID vì shipper đã thu hộ tiền mặt
    if (order.paymentMethod === PaymentMethod.COD) {
      const txns = await this.repo.listTransactions(orderId);
      const paidTotal = txns
        .filter(
          (t) =>
            t.status === TxnStatus.SUCCESS &&
            (t.type === TxnType.CHARGE || t.type === TxnType.COD_COLLECT),
        )
        .reduce((sum, t) => sum + t.amount, 0);
      const remaining = order.total - paidTotal;
      if (remaining > 0) {
        await this.repo.appendTransaction({
          orderId: new Types.ObjectId(order._id.toString()),
          type: TxnType.COD_COLLECT,
          provider: 'COD',
          amount: remaining,
          status: TxnStatus.SUCCESS,
          providerTxnId: `cod_${orderId}_delivered`,
        });
      }
      updates.paymentStatus = PaymentStatus.PAID;
    }

    await this.repo.updateOrder(orderId, updates);
    this.logger.log(
      `WMS cập nhật: Giao thành công đơn ${orderId} -> Đã đóng đơn`,
    );
  }

  async onReturned(orderId: string) {
    const order = await this.repo.findById(orderId);
    if (!order) return;

    const updates: Partial<Order> = {
      fulfillmentStatus: FulfillmentStatus.RETURNED,
      orderStatus: OrderStatus.CANCELLED,
    };

    // Return-to-sender (chưa từng giao thành công) — ONLINE đã trả trước cần hoàn tiền;
    // COD chưa thu được đồng nào nên không cần hoàn.
    if (order.paymentMethod === PaymentMethod.ONLINE) {
      updates.paymentStatus = PaymentStatus.REFUND_PENDING;
    }

    await this.repo.updateOrder(orderId, updates);
    this.logger.log(
      `WMS cập nhật: Đơn ${orderId} hoàn về kho (chưa giao được) -> CANCELLED`,
    );
  }
}
