import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DeliveryTrip,
  DeliveryTripDocument,
  DeliveryTripStatus,
} from './schemas/delivery-trip.schema';

export interface CreateDeliveryTripInput {
  id: Types.ObjectId;
  tripNumber: string;
  assignedShipperId: Types.ObjectId;
  stops: { shipmentId: Types.ObjectId; routeOrder: number }[];
  createdBy: Types.ObjectId;
  now: Date;
}

export interface QueryDeliveryTripInput {
  status?: DeliveryTripStatus;
  assignedShipperId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class DeliveryTripRepository {
  constructor(
    @InjectModel(DeliveryTrip.name)
    private readonly model: Model<DeliveryTrip>,
  ) {}

  create(input: CreateDeliveryTripInput): Promise<DeliveryTripDocument> {
    return this.model.create({
      _id: input.id,
      tripNumber: input.tripNumber,
      assignedShipperId: input.assignedShipperId,
      stops: input.stops,
      status: DeliveryTripStatus.DRAFT,
      statusHistory: [
        {
          status: DeliveryTripStatus.DRAFT,
          at: input.now,
          by: input.createdBy,
          note: 'Tạo chuyến giao hàng',
        },
      ],
    });
  }

  findById(id: string): Promise<DeliveryTripDocument | null> {
    return this.model.findById(id).exec();
  }

  deleteDraft(id: Types.ObjectId): Promise<unknown> {
    return this.model
      .deleteOne({ _id: id, status: DeliveryTripStatus.DRAFT })
      .exec();
  }

  replaceStops(
    id: string,
    stops: { shipmentId: Types.ObjectId; routeOrder: number }[],
  ): Promise<DeliveryTripDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: DeliveryTripStatus.DRAFT },
        { $set: { stops } },
        { new: true },
      )
      .exec();
  }

  transition(
    id: string,
    fromStatuses: DeliveryTripStatus[],
    toStatus: DeliveryTripStatus,
    input: {
      by: Types.ObjectId;
      at: Date;
      note?: string;
      extra?: Record<string, unknown>;
    },
  ): Promise<DeliveryTripDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: { $in: fromStatuses } },
        {
          $set: { status: toStatus, ...input.extra },
          $push: {
            statusHistory: {
              status: toStatus,
              at: input.at,
              by: input.by,
              note: input.note,
            },
          },
        },
        { new: true },
      )
      .exec();
  }

  postShipmentCash(
    id: string,
    shipmentId: Types.ObjectId,
    amount: number,
  ): Promise<DeliveryTripDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: {
            $in: [DeliveryTripStatus.IN_TRANSIT, DeliveryTripStatus.PAUSED],
          },
          cashPostedShipmentIds: { $ne: shipmentId },
        },
        {
          $inc: { cashCollectedAmount: amount },
          $addToSet: { cashPostedShipmentIds: shipmentId },
        },
        { new: true },
      )
      .exec();
  }

  settleCash(
    id: string,
    expectedAmount: number,
    actorId: Types.ObjectId,
    settledAt: Date,
  ): Promise<DeliveryTripDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: DeliveryTripStatus.AWAITING_SETTLEMENT,
          cashCollectedAmount: expectedAmount,
        },
        {
          $set: {
            status: DeliveryTripStatus.COMPLETED,
            cashSettledAmount: expectedAmount,
            settledAt,
            settledBy: actorId,
            completedAt: settledAt,
          },
          $push: {
            statusHistory: {
              status: DeliveryTripStatus.COMPLETED,
              at: settledAt,
              by: actorId,
              note: `Đã đối soát tiền mặt: ${expectedAmount}`,
            },
          },
        },
        { new: true },
      )
      .exec();
  }

  reassign(
    id: string,
    expectedShipperId: Types.ObjectId,
    newShipperId: Types.ObjectId,
  ): Promise<DeliveryTripDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: DeliveryTripStatus.PAUSED,
          assignedShipperId: expectedShipperId,
        },
        {
          $set: {
            assignedShipperId: newShipperId,
            status: DeliveryTripStatus.IN_TRANSIT,
          },
        },
        { new: true },
      )
      .exec();
  }

  async findAll(
    query: QueryDeliveryTripInput,
  ): Promise<{ data: DeliveryTripDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;
    if (query.assignedShipperId) {
      filter['assignedShipperId'] = new Types.ObjectId(query.assignedShipperId);
    }

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { data, total };
  }
}
