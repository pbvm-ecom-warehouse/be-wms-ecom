import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum CarrierStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * Danh mục hãng vận chuyển — config tay, MANAGER/ADMIN quản lý (UC-S01).
 * Master data: soft-delete qua deletedAt, audit đầy đủ.
 */
@Schema({ collection: 'carriers', timestamps: true })
export class Carrier {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ enum: CarrierStatus, default: CarrierStatus.ACTIVE })
  status!: CarrierStatus;

  @Prop({ type: Object })
  contactInfo?: Record<string, unknown>;

  @Prop()
  note?: string;

  /** Chỗ chừa tích hợp API hãng sau (endpoint/token) — YAGNI, không dùng vòng này. */
  @Prop({ type: Object })
  apiConfig?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type CarrierDocument = HydratedDocument<Carrier>;
export const CarrierSchema = SchemaFactory.createForClass(Carrier);

// unique index cho code đã khai báo qua @Prop({ unique: true }) ở trên
CarrierSchema.index({ status: 1 });
