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
    return this.model
      .findOneAndUpdate(
        { goodsIssueId: input.goodsIssueId },
        {
          $setOnInsert: {
            shipmentNumber: input.shipmentNumber,
            orderId: input.orderId,
            orderCode: input.orderCode,
            goodsIssueId: input.goodsIssueId,
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
