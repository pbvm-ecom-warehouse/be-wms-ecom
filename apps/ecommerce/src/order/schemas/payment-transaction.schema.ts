import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum TxnType {
  CHARGE = 'CHARGE',
  COD_COLLECT = 'COD_COLLECT',
  REFUND = 'REFUND',
}

export enum TxnStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
}

/**
 * Sổ cái append-only — lưu vết biến động tiền mặt thực tế.
 * Không sửa hoặc xóa bản ghi cũ.
 * providerTxnId là khóa duy nhất để đảm bảo idempotency.
 */
@Schema({ collection: 'payment_transactions', timestamps: true })
export class PaymentTransaction {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  orderId: Types.ObjectId;

  @Prop({ enum: TxnType, required: true })
  type: TxnType;

  @Prop({ type: String, default: null })
  provider: string | null; // 'VNPAY' | 'MOMO' | 'COD' | null

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ enum: TxnStatus, required: true })
  status: TxnStatus;

  /** Mã giao dịch từ cổng thanh toán — unique index sparse để chống ghi trùng */
  @Prop({ type: String, default: null, sparse: true })
  providerTxnId: string | null;

  /** Raw payload từ cổng thanh toán trả về */
  @Prop({ type: Object, default: {} })
  raw: Record<string, unknown>;
}

export type PaymentTransactionDocument = HydratedDocument<PaymentTransaction>;
export const PaymentTransactionSchema =
  SchemaFactory.createForClass(PaymentTransaction);

// Tạo unique sparse index cho providerTxnId
PaymentTransactionSchema.index(
  { providerTxnId: 1 },
  { unique: true, sparse: true },
);
