import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Shipment,
  ShipmentDocument,
  ShipmentStatus,
} from './schemas/shipment.schema';

export interface CreateShipmentFromGoodsIssueInput {
  shipmentNumber: string;
  orderId: string;
  orderCode?: string;
  goodsIssueId: Types.ObjectId;
  assignedShipperId?: Types.ObjectId;
  recipient: { name: string; phone: string; address: Record<string, unknown> };
  paymentMethod: 'COD' | 'ONLINE';
  codAmount: number;
}

export interface QueryShipmentInput {
  shipmentStatus?: ShipmentStatus;
  orderId?: string;
  carrierId?: string;
  assignedShipperId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ShipmentRepository {
  constructor(
    @InjectModel(Shipment.name) private readonly model: Model<Shipment>,
  ) {}

  findById(id: string): Promise<ShipmentDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  findByIdWithDeliveryOtp(id: string): Promise<ShipmentDocument | null> {
    return this.model
      .findOne({ _id: id })
      .select('+deliveryOtpHash +deliveryOtpSalt')
      .exec();
  }

  findManyByIds(ids: string[]): Promise<ShipmentDocument[]> {
    return this.model.find({ _id: { $in: ids } }).exec();
  }

  findByPackageBarcode(barcode: string): Promise<ShipmentDocument | null> {
    return this.model.findOne({ 'packages.barcode': barcode }).exec();
  }

  findByGoodsIssueId(goodsIssueId: string): Promise<ShipmentDocument | null> {
    return this.model.findOne({ goodsIssueId }).exec();
  }

  async createFromGoodsIssue(
    input: CreateShipmentFromGoodsIssueInput,
  ): Promise<ShipmentDocument> {
    return this.model
      .findOneAndUpdate(
        { goodsIssueId: input.goodsIssueId },
        {
          $setOnInsert: {
            shipmentNumber: input.shipmentNumber,
            orderId: input.orderId,
            orderCode: input.orderCode,
            goodsIssueId: input.goodsIssueId,
            ...(input.assignedShipperId
              ? { assignedShipperId: input.assignedShipperId }
              : {}),
            shipmentStatus: ShipmentStatus.PENDING,
            recipient: input.recipient,
            paymentMethod: input.paymentMethod,
            codAmount: input.codAmount,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  appendPackage(
    id: string,
    expectedVersion: number,
    shipmentPackage: {
      barcode: string;
      allocations: { itemId: Types.ObjectId; sku: string; quantity: number }[];
      createdAt: Date;
      createdBy: Types.ObjectId;
    },
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          shipmentStatus: ShipmentStatus.PENDING,
          __v: expectedVersion,
        },
        {
          $push: { packages: shipmentPackage },
          $inc: { __v: 1 },
        },
        { new: true },
      )
      .exec();
  }

  markReady(
    id: string,
    fromStatus: ShipmentStatus,
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, shipmentStatus: fromStatus },
        { $set: { shipmentStatus: ShipmentStatus.READY } },
        { new: true },
      )
      .exec();
  }

  reserveForTrip(
    id: string,
    assignedShipperId: Types.ObjectId,
    tripId: Types.ObjectId,
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          shipmentStatus: ShipmentStatus.READY,
          assignedShipperId,
          activeTripId: { $exists: false },
        },
        { $set: { activeTripId: tripId } },
        { new: true },
      )
      .exec();
  }

  releaseTripReservation(
    id: string,
    tripId: Types.ObjectId,
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          shipmentStatus: ShipmentStatus.READY,
          activeTripId: tripId,
        },
        { $unset: { activeTripId: 1 } },
        { new: true },
      )
      .exec();
  }

  loadPackage(
    shipmentId: string,
    barcode: string,
    tripId: Types.ObjectId,
    loadedAt: Date,
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: shipmentId,
          activeTripId: tripId,
          shipmentStatus: ShipmentStatus.READY,
          packages: {
            $elemMatch: {
              barcode,
              loadedTripId: { $exists: false },
            },
          },
        },
        {
          $set: {
            'packages.$.loadedTripId': tripId,
            'packages.$.loadedAt': loadedAt,
          },
        },
        { new: true },
      )
      .exec();
  }

  setDeliveryOtp(
    id: string,
    expectedLastSentAt: Date | undefined,
    input: {
      tripId: Types.ObjectId;
      hash: string;
      salt: string;
      sentAt: Date;
      expiresAt: Date;
    },
  ): Promise<ShipmentDocument | null> {
    const lastSentFilter = expectedLastSentAt
      ? { deliveryOtpLastSentAt: expectedLastSentAt }
      : { deliveryOtpLastSentAt: { $exists: false } };
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          activeTripId: input.tripId,
          shipmentStatus: ShipmentStatus.IN_TRANSIT,
          ...lastSentFilter,
        },
        {
          $set: {
            deliveryOtpHash: input.hash,
            deliveryOtpSalt: input.salt,
            deliveryOtpLastSentAt: input.sentAt,
            deliveryOtpExpiresAt: input.expiresAt,
            deliveryOtpFailedAttempts: 0,
          },
          $unset: { deliveryOtpLockedUntil: 1 },
        },
        { new: true },
      )
      .exec();
  }

  recordDeliveryOtpFailure(
    id: string,
    tripId: Types.ObjectId,
    expectedAttempts: number,
    input: { failedAttempts: number; lockedUntil?: Date },
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          activeTripId: tripId,
          shipmentStatus: ShipmentStatus.IN_TRANSIT,
          deliveryOtpFailedAttempts: expectedAttempts,
        },
        {
          $set: {
            deliveryOtpFailedAttempts: input.failedAttempts,
            ...(input.lockedUntil
              ? { deliveryOtpLockedUntil: input.lockedUntil }
              : {}),
          },
        },
        { new: true },
      )
      .exec();
  }

  completeDelivery(
    id: string,
    tripId: Types.ObjectId,
    input: {
      deliveredAt: Date;
      actorId: Types.ObjectId;
      podImages: string[];
      codCollectionMethod?: string;
      codCollectedAmount: number;
    },
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          activeTripId: tripId,
          shipmentStatus: ShipmentStatus.IN_TRANSIT,
        },
        {
          $set: {
            shipmentStatus: ShipmentStatus.DELIVERED,
            deliveredAt: input.deliveredAt,
            codCollectionMethod: input.codCollectionMethod,
            codCollectedAmount: input.codCollectedAmount,
          },
          $unset: {
            deliveryOtpHash: 1,
            deliveryOtpSalt: 1,
            deliveryOtpExpiresAt: 1,
            deliveryOtpLockedUntil: 1,
          },
          $push: {
            statusHistory: {
              status: ShipmentStatus.DELIVERED,
              at: input.deliveredAt,
              by: input.actorId,
              note: 'Giao thành công, đã xác thực OTP và POD',
              images: input.podImages,
            },
          },
        },
        { new: true },
      )
      .exec();
  }

  recordFailedDeliveryAttempt(
    id: string,
    tripId: Types.ObjectId,
    expectedAttempts: number,
    input: {
      attemptedAt: Date;
      actorId: Types.ObjectId;
      reason: string;
      nextAttempts: number;
      returnToWarehouse: boolean;
    },
  ): Promise<ShipmentDocument | null> {
    const nextStatus = input.returnToWarehouse
      ? ShipmentStatus.RETURNING
      : ShipmentStatus.IN_TRANSIT;
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          activeTripId: tripId,
          shipmentStatus: ShipmentStatus.IN_TRANSIT,
          attempts: expectedAttempts,
        },
        {
          $set: {
            shipmentStatus: nextStatus,
            attempts: input.nextAttempts,
            failReason: input.reason,
          },
          $push: {
            statusHistory: {
              status: input.returnToWarehouse
                ? ShipmentStatus.RETURNING
                : ShipmentStatus.FAILED,
              at: input.attemptedAt,
              by: input.actorId,
              note: input.reason,
              images: [],
            },
          },
        },
        { new: true },
      )
      .exec();
  }

  scanReturnedPackage(
    id: string,
    barcode: string,
    tripId: Types.ObjectId,
    actorId: Types.ObjectId,
    returnedAt: Date,
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          activeTripId: tripId,
          shipmentStatus: ShipmentStatus.RETURNING,
          packages: {
            $elemMatch: {
              barcode,
              loadedTripId: tripId,
              returnedAt: { $exists: false },
            },
          },
        },
        {
          $set: {
            'packages.$.returnedAt': returnedAt,
            'packages.$.returnedBy': actorId,
          },
        },
        { new: true },
      )
      .exec();
  }

  reassignActiveTripShipments(
    tripId: Types.ObjectId,
    assignedShipperId: Types.ObjectId,
  ): Promise<unknown> {
    return this.model
      .updateMany(
        {
          activeTripId: tripId,
          shipmentStatus: {
            $in: [ShipmentStatus.READY, ShipmentStatus.IN_TRANSIT],
          },
        },
        { $set: { assignedShipperId } },
      )
      .exec();
  }

  assignCarrier(
    id: string,
    carrierId: Types.ObjectId,
    trackingNumber: string,
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, shipmentStatus: ShipmentStatus.PENDING },
        { $set: { carrierId, trackingNumber } },
        { new: true },
      )
      .exec();
  }

  /**
   * Ghi status mới + append statusHistory + set field thời điểm tương ứng nếu có.
   * Compare-and-swap: filter kèm `shipmentStatus: fromStatus` — chỉ ghi nếu document
   * vẫn đang ở đúng trạng thái mà caller đọc được lúc đầu, tránh race giữa 2 request
   * cùng cập nhật 1 shipment (vd double-submit /status). Trả null nếu đã đổi trạng thái
   * bởi request khác (mất race) — caller tự quyết định throw gì.
   */
  pushStatus(
    id: string,
    fromStatus: ShipmentStatus,
    update: {
      shipmentStatus: ShipmentStatus;
      historyEntry: {
        status: ShipmentStatus;
        at: Date;
        by?: Types.ObjectId;
        note?: string;
        images: string[];
      };
      extra?: Record<string, unknown>;
    },
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, shipmentStatus: fromStatus },
        {
          $set: { shipmentStatus: update.shipmentStatus, ...update.extra },
          $push: { statusHistory: update.historyEntry },
        },
        { new: true },
      )
      .exec();
  }

  async findAll(
    query: QueryShipmentInput,
  ): Promise<{ data: ShipmentDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.shipmentStatus) filter['shipmentStatus'] = query.shipmentStatus;
    if (query.orderId) filter['orderId'] = query.orderId;
    if (query.carrierId) filter['carrierId'] = query.carrierId;
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
