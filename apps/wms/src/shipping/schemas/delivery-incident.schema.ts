import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum DeliveryIncidentType {
  VEHICLE_BREAKDOWN = 'VEHICLE_BREAKDOWN',
  ACCIDENT = 'ACCIDENT',
  PACKAGE_DAMAGE = 'PACKAGE_DAMAGE',
  OTHER = 'OTHER',
}

export enum DeliveryIncidentStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}

export enum DeliveryIncidentResolutionAction {
  RESUME = 'RESUME',
  RESCUE = 'RESCUE',
  RETURN_TO_WAREHOUSE = 'RETURN_TO_WAREHOUSE',
}

@Schema({ collection: 'delivery_incidents', timestamps: true })
export class DeliveryIncident {
  @Prop({ required: true })
  incidentNumber!: string;

  @Prop({ type: Types.ObjectId, required: true })
  tripId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  shipmentId?: Types.ObjectId;

  @Prop({ enum: DeliveryIncidentType, required: true })
  type!: DeliveryIncidentType;

  @Prop({ required: true })
  description!: string;

  @Prop({ enum: DeliveryIncidentStatus, default: DeliveryIncidentStatus.OPEN })
  status!: DeliveryIncidentStatus;

  @Prop({ type: Types.ObjectId, required: true })
  reportedBy!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  reportedAt!: Date;

  @Prop({ enum: DeliveryIncidentResolutionAction })
  resolutionAction?: DeliveryIncidentResolutionAction;

  @Prop()
  resolutionNote?: string;

  @Prop({ type: Types.ObjectId })
  resolvedBy?: Types.ObjectId;

  @Prop({ type: Date })
  resolvedAt?: Date;
}

export type DeliveryIncidentDocument = HydratedDocument<DeliveryIncident>;
export const DeliveryIncidentSchema =
  SchemaFactory.createForClass(DeliveryIncident);

DeliveryIncidentSchema.index({ incidentNumber: 1 }, { unique: true });
DeliveryIncidentSchema.index({ tripId: 1, status: 1, createdAt: -1 });
