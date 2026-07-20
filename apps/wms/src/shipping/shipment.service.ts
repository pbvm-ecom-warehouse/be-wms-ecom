import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppException } from '@app/common';
import { EVENTS, QUEUES, type ShipmentEventPayload } from '@app/events';
import { Types } from 'mongoose';
import {
  ShipmentRepository,
  QueryShipmentInput,
  CreateShipmentFromGoodsIssueInput,
} from './shipment.repository';
import { ShipmentDocument, ShipmentStatus } from './schemas/shipment.schema';
import { CarrierService } from './carrier.service';
import { CarrierStatus } from './schemas/carrier.schema';

/** Bảng transition hợp lệ — key: from, value: các to được phép. */
const VALID_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.PENDING]: [ShipmentStatus.PICKED_UP],
  [ShipmentStatus.PICKED_UP]: [ShipmentStatus.IN_TRANSIT],
  [ShipmentStatus.IN_TRANSIT]: [
    ShipmentStatus.DELIVERED,
    ShipmentStatus.FAILED,
  ],
  [ShipmentStatus.FAILED]: [
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.RETURNING,
  ],
  [ShipmentStatus.RETURNING]: [ShipmentStatus.RETURNED],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.RETURNED]: [],
};

export interface UpdateStatusOptions {
  note?: string;
  failReason?: string;
}

@Injectable()
export class ShipmentService {
  constructor(
    private readonly repo: ShipmentRepository,
    private readonly carrierService: CarrierService,
    @InjectQueue(QUEUES.SHIPMENT) private readonly shipmentQueue: Queue,
  ) {}

  async createFromGoodsIssue(input: {
    orderId: string;
    goodsIssueId: string;
    fulfillWarehouseId: string;
    recipient: {
      name: string;
      phone: string;
      address: Record<string, unknown>;
    };
    paymentMethod: 'COD' | 'ONLINE';
    codAmount: number;
  }): Promise<void> {
    const existing = await this.repo.findByGoodsIssueId(input.goodsIssueId);
    if (existing) return;

    const createInput: CreateShipmentFromGoodsIssueInput = {
      orderId: input.orderId,
      goodsIssueId: new Types.ObjectId(input.goodsIssueId),
      fulfillWarehouseId: new Types.ObjectId(input.fulfillWarehouseId),
      recipient: input.recipient,
      paymentMethod: input.paymentMethod,
      codAmount: input.codAmount,
    };
    await this.repo.createFromGoodsIssue(createInput);
  }

  async assignCarrier(
    id: string,
    carrierId: string,
    trackingNumber: string,
  ): Promise<ShipmentDocument> {
    const shipment = await this.repo.findById(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');

    const carrier = await this.carrierService.getById(carrierId);
    if (carrier.status !== CarrierStatus.ACTIVE) {
      throw new AppException('CARRIER_INACTIVE');
    }

    const updated = await this.repo.assignCarrier(
      id,
      new Types.ObjectId(carrierId),
      trackingNumber,
    );
    if (!updated) throw new AppException('SHIPMENT_NOT_FOUND');
    return updated;
  }

  async updateStatus(
    id: string,
    toStatus: ShipmentStatus,
    actorId: string,
    options: UpdateStatusOptions,
  ): Promise<ShipmentDocument> {
    const shipment = await this.repo.findById(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');

    const fromStatus = shipment.shipmentStatus;
    const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }

    const now = new Date();
    const extra: Record<string, unknown> = {};
    if (
      toStatus === ShipmentStatus.IN_TRANSIT &&
      fromStatus === ShipmentStatus.PICKED_UP
    ) {
      extra['shippedAt'] = now;
    }
    if (toStatus === ShipmentStatus.DELIVERED) {
      extra['deliveredAt'] = now;
    }
    if (toStatus === ShipmentStatus.FAILED) {
      extra['attempts'] = shipment.attempts + 1;
      if (options.failReason) extra['failReason'] = options.failReason;
    }

    const updated = await this.repo.pushStatus(id, {
      shipmentStatus: toStatus,
      historyEntry: {
        status: toStatus,
        at: now,
        by: new Types.ObjectId(actorId),
        note: options.note,
      },
      extra,
    });
    if (!updated) throw new AppException('SHIPMENT_NOT_FOUND');

    // Chỉ 3 mốc phát event sang Ecom — theo docs/shipping/data-model.md
    // §Quan hệ với Order. Retry FAILED→IN_TRANSIT KHÔNG bắn lại shipment.shipped
    // (Order đã SHIPPED rồi, bắn lại là dư thừa).
    const payload: ShipmentEventPayload = {
      orderId: shipment.orderId,
      shipmentId: id,
      trackingNumber: shipment.trackingNumber,
    };
    // jobId ổn định theo shipmentId+status — tránh bắn trùng event nếu job retry/duplicate.
    if (
      toStatus === ShipmentStatus.IN_TRANSIT &&
      fromStatus === ShipmentStatus.PICKED_UP
    ) {
      await this.shipmentQueue.add(EVENTS.SHIPMENT_SHIPPED, payload, {
        jobId: `${EVENTS.SHIPMENT_SHIPPED}:${id}`,
      });
    } else if (toStatus === ShipmentStatus.DELIVERED) {
      await this.shipmentQueue.add(EVENTS.SHIPMENT_DELIVERED, payload, {
        jobId: `${EVENTS.SHIPMENT_DELIVERED}:${id}`,
      });
    } else if (toStatus === ShipmentStatus.RETURNED) {
      await this.shipmentQueue.add(EVENTS.SHIPMENT_RETURNED, payload, {
        jobId: `${EVENTS.SHIPMENT_RETURNED}:${id}`,
      });
    }

    return updated;
  }

  async getById(id: string): Promise<ShipmentDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('SHIPMENT_NOT_FOUND');
    return doc;
  }

  list(
    query: QueryShipmentInput,
  ): Promise<{ data: ShipmentDocument[]; total: number }> {
    return this.repo.findAll(query);
  }
}
