import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppException, CloudinaryService } from '@app/common';
import { WmsRole } from '@app/auth';
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
import { DocumentNumberService } from '../document-number/document-number.service';
import { GoodsIssueRepository } from '../goods-issue/goods-issue.repository';
import { GoodsIssueStatus } from '../goods-issue/schemas/goods-issue.schema';
import type { CreateShipmentPackageDto } from './dto/shipment.dto';

// Giới hạn upload ảnh POD — theo đúng ràng buộc thiết kế IMG-01/IMG-09.
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** Bảng transition hợp lệ — key: from, value: các to được phép. */
const VALID_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.PENDING]: [ShipmentStatus.PICKED_UP],
  [ShipmentStatus.READY]: [ShipmentStatus.IN_TRANSIT],
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
    private readonly documentNumberService: DocumentNumberService,
    private readonly goodsIssueRepo: GoodsIssueRepository,
    @InjectQueue(QUEUES.SHIPMENT) private readonly shipmentQueue: Queue,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async createFromGoodsIssue(input: {
    orderId: string;
    orderCode?: string;
    goodsIssueId: string;
    recipient: {
      name: string;
      phone: string;
      address: Record<string, unknown>;
    };
    paymentMethod: 'COD' | 'ONLINE';
    codAmount: number;
    assignedShipperId?: string;
  }): Promise<void> {
    const existing = await this.repo.findByGoodsIssueId(input.goodsIssueId);
    if (existing) return;

    const shipmentNumber = await this.documentNumberService.next('SHP');
    const createInput: CreateShipmentFromGoodsIssueInput = {
      shipmentNumber,
      orderId: input.orderId,
      orderCode: input.orderCode,
      goodsIssueId: new Types.ObjectId(input.goodsIssueId),
      assignedShipperId: input.assignedShipperId
        ? new Types.ObjectId(input.assignedShipperId)
        : undefined,
      recipient: input.recipient,
      paymentMethod: input.paymentMethod,
      codAmount: input.codAmount,
    };
    await this.repo.createFromGoodsIssue(createInput);
  }

  async createPackage(
    id: string,
    dto: CreateShipmentPackageDto,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<ShipmentDocument> {
    const shipment = await this.repo.findById(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');
    if (shipment.shipmentStatus !== ShipmentStatus.PENDING) {
      throw new AppException('SHIPMENT_PACKAGE_NOT_EDITABLE');
    }

    const goodsIssue = await this.goodsIssueRepo.findById(
      shipment.goodsIssueId.toString(),
    );
    if (!goodsIssue) throw new AppException('GOODS_ISSUE_NOT_FOUND');
    if (goodsIssue.status !== GoodsIssueStatus.CONFIRMED) {
      throw new AppException('SHIPMENT_PACKAGE_NOT_READY');
    }
    if (
      actorRole !== WmsRole.ADMIN &&
      goodsIssue.assignedShipperId?.toString() !== actorId
    ) {
      throw new AppException('SHIPMENT_NOT_OWNER');
    }

    const requestIds = new Set(dto.allocations.map((line) => line.itemId));
    if (requestIds.size !== dto.allocations.length) {
      throw new AppException('SHIPMENT_PACKAGE_DUPLICATE_ITEM');
    }

    const requiredByItem = new Map(
      goodsIssue.items.map((line) => [
        line.itemId.toString(),
        { sku: line.sku, quantity: line.quantity },
      ]),
    );
    const allocatedByItem = new Map<string, number>();
    for (const shipmentPackage of shipment.packages ?? []) {
      for (const allocation of shipmentPackage.allocations) {
        const key = allocation.itemId.toString();
        allocatedByItem.set(
          key,
          (allocatedByItem.get(key) ?? 0) + allocation.quantity,
        );
      }
    }

    const allocations = dto.allocations.map((line) => {
      const required = requiredByItem.get(line.itemId);
      if (!required) {
        throw new AppException('SHIPMENT_PACKAGE_ITEM_MISMATCH');
      }
      const nextTotal = (allocatedByItem.get(line.itemId) ?? 0) + line.quantity;
      if (nextTotal > required.quantity) {
        throw new AppException('SHIPMENT_PACKAGE_QTY_EXCEEDS');
      }
      allocatedByItem.set(line.itemId, nextTotal);
      return {
        itemId: new Types.ObjectId(line.itemId),
        sku: required.sku,
        quantity: line.quantity,
      };
    });

    const barcode = await this.documentNumberService.next('PKG');
    const updated = await this.repo.appendPackage(id, shipment.__v ?? 0, {
      barcode,
      allocations,
      createdAt: new Date(),
      createdBy: new Types.ObjectId(actorId),
    });
    if (!updated) throw new AppException('SHIPMENT_PACKAGE_CONFLICT');

    const totals = new Map<string, number>();
    for (const shipmentPackage of updated.packages ?? []) {
      for (const allocation of shipmentPackage.allocations) {
        const key = allocation.itemId.toString();
        totals.set(key, (totals.get(key) ?? 0) + allocation.quantity);
      }
    }
    const isComplete = goodsIssue.items.every(
      (line) => totals.get(line.itemId.toString()) === line.quantity,
    );
    if (!isComplete) return updated;

    const ready = await this.repo.markReady(id, ShipmentStatus.PENDING);
    if (!ready) throw new AppException('SHIPMENT_PACKAGE_CONFLICT');
    return ready;
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

  /**
   * `imageFiles` optional — ảnh POD (proof-of-delivery), chỉ có ý nghĩa khi
   * `toStatus === DELIVERED` (xem AC IMG-09). Nếu SHIPPER gửi kèm ảnh cho
   * status khác thì bị bỏ qua âm thầm — không có statusHistory DELIVERED nào
   * để gắn vào, và không đáng để throw lỗi cho 1 field thừa vô hại.
   */
  async updateStatus(
    id: string,
    toStatus: ShipmentStatus,
    actorId: string,
    options: UpdateStatusOptions,
    imageFiles?: UploadedImageFile[],
  ): Promise<ShipmentDocument> {
    const shipment = await this.repo.findById(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');

    const fromStatus = shipment.shipmentStatus;
    const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }

    // Business rule riêng cho PENDING→PICKED_UP: phải đã /assign carrier trước.
    // State machine ở trên chỉ chặn transition sai thứ tự, không biết gì về carrierId.
    if (
      fromStatus === ShipmentStatus.PENDING &&
      toStatus === ShipmentStatus.PICKED_UP &&
      !shipment.carrierId
    ) {
      throw new AppException('SHIPMENT_NOT_ASSIGNED');
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

    const images: string[] = [];
    if (toStatus === ShipmentStatus.DELIVERED) {
      for (const file of imageFiles ?? []) {
        this.validateImageFile(file);
        const { url } = await this.cloudinary.uploadImage(
          file.buffer,
          'wms/shipment-pod',
        );
        images.push(url);
      }
    }

    const updated = await this.repo.pushStatus(id, fromStatus, {
      shipmentStatus: toStatus,
      historyEntry: {
        status: toStatus,
        at: now,
        by: new Types.ObjectId(actorId),
        note: options.note,
        images,
      },
      extra,
    });
    // Compare-and-swap ở repo (filter shipmentStatus: fromStatus) trả null khi
    // shipment đã bị request khác đổi trạng thái giữa lúc đọc và lúc ghi (mất race) —
    // không còn đúng nghĩa "not found", nên dùng SHIPMENT_INVALID_TRANSITION.
    if (!updated) throw new AppException('SHIPMENT_INVALID_TRANSITION');

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

  private validateImageFile(file: UploadedImageFile): void {
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Chỉ nhận file ảnh (jpeg/png/webp)',
      );
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new AppException('VALIDATION_FAILED', 'File ảnh tối đa 5MB');
    }
  }

  async getById(id: string): Promise<ShipmentDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('SHIPMENT_NOT_FOUND');
    return doc;
  }

  async getByIdForActor(
    id: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<ShipmentDocument> {
    const shipment = await this.getById(id);
    if (
      actorRole === WmsRole.SHIPPER &&
      shipment.assignedShipperId?.toString() !== actorId
    ) {
      throw new AppException('SHIPMENT_NOT_OWNER');
    }
    return shipment;
  }

  list(
    query: QueryShipmentInput,
    actorId?: string,
    actorRole?: WmsRole,
  ): Promise<{ data: ShipmentDocument[]; total: number }> {
    return this.repo.findAll(
      actorRole === WmsRole.SHIPPER && actorId
        ? { ...query, assignedShipperId: actorId }
        : query,
    );
  }
}
