import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DeliveryIncident,
  DeliveryIncidentDocument,
  DeliveryIncidentResolutionAction,
  DeliveryIncidentStatus,
  DeliveryIncidentType,
} from './schemas/delivery-incident.schema';

@Injectable()
export class DeliveryIncidentRepository {
  constructor(
    @InjectModel(DeliveryIncident.name)
    private readonly model: Model<DeliveryIncident>,
  ) {}

  create(input: {
    incidentNumber: string;
    tripId: Types.ObjectId;
    shipmentId?: Types.ObjectId;
    type: DeliveryIncidentType;
    description: string;
    reportedBy: Types.ObjectId;
    reportedAt: Date;
  }): Promise<DeliveryIncidentDocument> {
    return this.model.create({
      ...input,
      status: DeliveryIncidentStatus.OPEN,
    });
  }

  findById(id: string): Promise<DeliveryIncidentDocument | null> {
    return this.model.findById(id).exec();
  }

  findByTripId(tripId: string): Promise<DeliveryIncidentDocument[]> {
    return this.model.find({ tripId }).sort({ createdAt: -1 }).exec();
  }

  resolve(
    id: string,
    input: {
      action: DeliveryIncidentResolutionAction;
      note?: string;
      resolvedBy: Types.ObjectId;
      resolvedAt: Date;
    },
  ): Promise<DeliveryIncidentDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: DeliveryIncidentStatus.OPEN },
        {
          $set: {
            status: DeliveryIncidentStatus.RESOLVED,
            resolutionAction: input.action,
            resolutionNote: input.note,
            resolvedBy: input.resolvedBy,
            resolvedAt: input.resolvedAt,
          },
        },
        { new: true },
      )
      .exec();
  }
}
