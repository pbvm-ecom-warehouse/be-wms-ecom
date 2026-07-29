import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum DeliveryTripStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  LOADING = 'LOADING',
  IN_TRANSIT = 'IN_TRANSIT',
  PAUSED = 'PAUSED',
  AWAITING_SETTLEMENT = 'AWAITING_SETTLEMENT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Schema({ _id: false })
export class DeliveryTripStop {
  @Prop({ type: Types.ObjectId, required: true })
  shipmentId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  routeOrder!: number;
}
const DeliveryTripStopSchema = SchemaFactory.createForClass(DeliveryTripStop);

@Schema({ _id: false })
export class DeliveryTripStatusHistoryEntry {
  @Prop({ enum: DeliveryTripStatus, required: true })
  status!: DeliveryTripStatus;

  @Prop({ type: Date, required: true })
  at!: Date;

  @Prop({ type: Types.ObjectId, required: true })
  by!: Types.ObjectId;

  @Prop()
  note?: string;
}
const DeliveryTripStatusHistoryEntrySchema = SchemaFactory.createForClass(
  DeliveryTripStatusHistoryEntry,
);

/**
 * Chuyến giao do kho tự vận hành. Shipment/package vẫn là nguồn dữ liệu hàng;
 * trip chỉ giữ owner, thứ tự dừng và state machine của một ca giao.
 */
@Schema({ collection: 'delivery_trips', timestamps: true })
export class DeliveryTrip {
  @Prop({ required: true })
  tripNumber!: string;

  @Prop({ type: Types.ObjectId, required: true })
  assignedShipperId!: Types.ObjectId;

  @Prop({ type: [DeliveryTripStopSchema], required: true })
  stops!: DeliveryTripStop[];

  @Prop({ enum: DeliveryTripStatus, default: DeliveryTripStatus.DRAFT })
  status!: DeliveryTripStatus;

  @Prop({ type: [DeliveryTripStatusHistoryEntrySchema], default: [] })
  statusHistory!: DeliveryTripStatusHistoryEntry[];

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;
}

export type DeliveryTripDocument = HydratedDocument<DeliveryTrip>;
export const DeliveryTripSchema = SchemaFactory.createForClass(DeliveryTrip);

DeliveryTripSchema.index({ tripNumber: 1 }, { unique: true });
DeliveryTripSchema.index({ assignedShipperId: 1, status: 1 });
DeliveryTripSchema.index({ 'stops.shipmentId': 1 });
