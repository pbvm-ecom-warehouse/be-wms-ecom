import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum StorageCellStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
}

/** Khoang trong một tầng kệ. Barcode khoang chính là code để receiver/picker quét xác nhận. */
@Schema({ collection: 'storage_cells', timestamps: true })
export class StorageCell {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  rackId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  shelfId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  level!: number;

  @Prop({ type: Number, required: true, min: 1 })
  bay!: number;

  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  barcode!: string;

  @Prop({ type: Number, required: true, min: 1 })
  innerDepth!: number;

  @Prop({ type: Number, required: true, min: 1 })
  innerWidth!: number;

  @Prop({ type: Number, required: true, min: 1 })
  innerHeight!: number;

  @Prop({ type: Number, default: null })
  fillFactor?: number | null;

  @Prop({ enum: StorageCellStatus, default: StorageCellStatus.ACTIVE })
  status!: StorageCellStatus;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type StorageCellDocument = HydratedDocument<StorageCell>;
export const StorageCellSchema = SchemaFactory.createForClass(StorageCell);
StorageCellSchema.index({ shelfId: 1, bay: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
StorageCellSchema.index({ rackId: 1, level: 1, bay: 1 });
StorageCellSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
