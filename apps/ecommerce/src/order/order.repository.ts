import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order } from './schemas/order.schema';
import { PaymentTransaction } from './schemas/payment-transaction.schema';

@Injectable()
export class OrderRepository {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(PaymentTransaction.name)
    private readonly txnModel: Model<PaymentTransaction>,
  ) {}

  async createOrder(
    data: Partial<Order>,
  ): Promise<Order & { _id: Types.ObjectId }> {
    const created = await this.orderModel.create(data);
    return created.toObject();
  }

  async findById(id: string) {
    return this.orderModel.findById(id).lean();
  }

  async findByCode(code: string) {
    return this.orderModel.findOne({ code }).lean();
  }

  async listByCustomer(customerId: string) {
    return this.orderModel
      .find({ customerId: new Types.ObjectId(customerId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  /** Cập nhật bất kỳ trục trạng thái nào — state machine guard nằm ở Service */
  async updateOrder(id: string, data: Partial<Order>) {
    return this.orderModel.findByIdAndUpdate(id, data, { new: true }).lean();
  }

  /**
   * Append-only: thêm 1 dòng vào payment_transactions.
   * Ném DuplicateKey (11000) nếu providerTxnId đã tồn tại — caller bắt để idempotency.
   */
  async appendTransaction(data: Partial<PaymentTransaction>) {
    return this.txnModel.create(data);
  }

  async findTransactionByProviderTxnId(providerTxnId: string) {
    return this.txnModel.findOne({ providerTxnId }).lean();
  }

  async listTransactions(orderId: string) {
    return this.txnModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .sort({ createdAt: 1 })
      .lean();
  }

  /** Sinh mã đơn theo format ORD-YYYYMMDD-NNN */
  async generateOrderCode(): Promise<string> {
    const today = new Date();
    const prefix = `ORD-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const count = await this.orderModel.countDocuments({
      code: { $regex: `^${prefix}` },
    });
    return `${prefix}-${String(count + 1).padStart(3, '0')}`;
  }

  async listAll() {
    return this.orderModel.find().sort({ createdAt: -1 }).lean();
  }
}
