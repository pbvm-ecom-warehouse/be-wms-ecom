import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum BarcodeKind {
  PRIMARY = 'PRIMARY',
  ALTERNATE = 'ALTERNATE',
}

/**
 * 1 mã (barcode chính hoặc altBarcode) → đúng 1 item, bất kể PRIMARY/ALTERNATE
 * (issue #25: "Registry chặn primary-primary, primary-alternate,
 * alternate-alternate"). unique index trên `code` một mình đã đảm bảo điều
 * này — không cần compound với kind. Sổ cái thuần, không soft-delete: gỡ 1 mã
 * (vd sửa altBarcodes) là xóa document, không đánh dấu deletedAt.
 */
@Schema({
  collection: 'barcode_registry',
  timestamps: { createdAt: true, updatedAt: false },
})
export class BarcodeRegistryEntry {
  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ type: Types.ObjectId, required: true })
  itemId!: Types.ObjectId;

  @Prop({ enum: BarcodeKind, required: true })
  kind!: BarcodeKind;
}

export type BarcodeRegistryEntryDocument =
  HydratedDocument<BarcodeRegistryEntry>;
export const BarcodeRegistryEntrySchema =
  SchemaFactory.createForClass(BarcodeRegistryEntry);

BarcodeRegistryEntrySchema.index({ itemId: 1 });
