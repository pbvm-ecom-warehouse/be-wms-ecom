import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Shipment,
  ShipmentDocument,
  ShipmentStatus,
} from './schemas/shipment.schema';

export interface CreateShipmentFromGoodsIssueInput {
  orderId: string;
  goodsIssueId: Types.ObjectId;
  fulfillWarehouseId: Types.ObjectId;
  recipient: { name: string; phone: string; address: Record<string, unknown> };
  paymentMethod: 'COD' | 'ONLINE';
  codAmount: number;
}

export interface QueryShipmentInput {
  shipmentStatus?: ShipmentStatus;
  orderId?: string;
  carrierId?: string;
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

  findByGoodsIssueId(goodsIssueId: string): Promise<ShipmentDocument | null> {
    return this.model.findOne({ goodsIssueId }).exec();
  }

  async createFromGoodsIssue(
    input: CreateShipmentFromGoodsIssueInput,
  ): Promise<ShipmentDocument> {
    const [doc] = await this.model.create([
      {
        orderId: input.orderId,
        goodsIssueId: input.goodsIssueId,
        fulfillWarehouseId: input.fulfillWarehouseId,
        shipmentStatus: ShipmentStatus.PENDING,
        recipient: input.recipient,
        paymentMethod: input.paymentMethod,
        codAmount: input.codAmount,
      },
    ]);
    return doc;
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

  /** Ghi status mới + append statusHistory + set field thời điểm tương ứng nếu có. */
  pushStatus(
    id: string,
    update: {
      shipmentStatus: ShipmentStatus;
      historyEntry: {
        status: ShipmentStatus;
        at: Date;
        by?: Types.ObjectId;
        note?: string;
      };
      extra?: Record<string, unknown>;
    },
  ): Promise<ShipmentDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id },
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
