import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppException, CloudinaryService } from '@app/common';
import { WmsRole } from '@app/auth';
import { EVENTS, QUEUES, type ShipmentEventPayload } from '@app/events';
import { Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import {
  ShipmentRepository,
  QueryShipmentInput,
  CreateShipmentFromGoodsIssueInput,
} from './shipment.repository';
import {
  CodCollectionMethod,
  ShipmentDocument,
  ShipmentStatus,
} from './schemas/shipment.schema';
import { CarrierService } from './carrier.service';
import { CarrierStatus } from './schemas/carrier.schema';
import { DocumentNumberService } from '../document-number/document-number.service';
import { GoodsIssueRepository } from '../goods-issue/goods-issue.repository';
import { GoodsIssueStatus } from '../goods-issue/schemas/goods-issue.schema';
import type { CreateShipmentPackageDto } from './dto/shipment.dto';

// Giới hạn upload ảnh POD — theo đúng ràng buộc thiết kế IMG-01/IMG-09.
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const DELIVERY_OTP_TTL_MS = 10 * 60 * 1000;
const DELIVERY_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const DELIVERY_OTP_MAX_FAILURES = 5;
const DELIVERY_OTP_LOCK_MS = 15 * 60 * 1000;

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

export interface DeliveryForTripResult {
  shipment: ShipmentDocument;
  /** Chỉ >0 ở lần CAS DELIVERED đầu tiên của COD CASH. */
  cashCollectedAmount: number;
}

@Injectable()
export class ShipmentService {
  constructor(
    private readonly repo: ShipmentRepository,
    private readonly carrierService: CarrierService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly goodsIssueRepo: GoodsIssueRepository,
    @InjectQueue(QUEUES.SHIPMENT) private readonly shipmentQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notificationQueue: Queue,
    private readonly cloudinary: CloudinaryService,
    private readonly config: ConfigService,
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

    // Shipment thuộc chuyến giao nội bộ phải đi qua API last-mile để không thể
    // bỏ qua OTP, POD, sổ COD hoặc quy trình quét hoàn bằng endpoint legacy.
    if (shipment.activeTripId) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }

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

  /**
   * Phase chuyến giao: chỉ owner, đúng trip và đã scan đủ package mới đưa
   * Shipment READY → IN_TRANSIT. Retry vẫn đối soát event bằng jobId ổn định.
   */
  async startForTrip(
    id: string,
    tripId: string,
    actorId: string,
  ): Promise<ShipmentDocument> {
    const shipment = await this.repo.findById(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');
    if (shipment.assignedShipperId?.toString() !== actorId) {
      throw new AppException('SHIPMENT_NOT_OWNER');
    }
    if (shipment.activeTripId?.toString() !== tripId) {
      throw new AppException('DELIVERY_TRIP_SHIPMENT_CONFLICT');
    }
    if (
      ![ShipmentStatus.READY, ShipmentStatus.IN_TRANSIT].includes(
        shipment.shipmentStatus,
      )
    ) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }
    if (
      shipment.packages.length === 0 ||
      shipment.packages.some(
        (shipmentPackage) =>
          shipmentPackage.loadedTripId?.toString() !== tripId,
      )
    ) {
      throw new AppException('DELIVERY_TRIP_PACKAGES_INCOMPLETE');
    }

    let current = shipment;
    if (shipment.shipmentStatus === ShipmentStatus.READY) {
      const now = new Date();
      const updated = await this.repo.pushStatus(id, ShipmentStatus.READY, {
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
        historyEntry: {
          status: ShipmentStatus.IN_TRANSIT,
          at: now,
          by: new Types.ObjectId(actorId),
          note: 'Bắt đầu giao theo chuyến nội bộ',
          images: [],
        },
        extra: { shippedAt: now },
      });
      if (!updated) {
        const raced = await this.repo.findById(id);
        if (raced?.shipmentStatus !== ShipmentStatus.IN_TRANSIT) {
          throw new AppException('SHIPMENT_INVALID_TRANSITION');
        }
        current = raced;
      } else {
        current = updated;
      }
    }

    const payload: ShipmentEventPayload = {
      orderId: current.orderId,
      shipmentId: id,
      trackingNumber: current.trackingNumber,
    };
    await this.shipmentQueue.add(EVENTS.SHIPMENT_SHIPPED, payload, {
      jobId: `${EVENTS.SHIPMENT_SHIPPED}:${id}`,
    });
    return current;
  }

  async requestDeliveryOtp(
    id: string,
    tripId: string,
    actorId: string,
  ): Promise<{ expiresAt: Date; resendAvailableAt: Date }> {
    const shipment = await this.repo.findByIdWithDeliveryOtp(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');
    this.assertTripOwner(shipment, tripId, actorId);
    if (shipment.shipmentStatus !== ShipmentStatus.IN_TRANSIT) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }

    const now = new Date();
    if (
      shipment.deliveryOtpLockedUntil &&
      shipment.deliveryOtpLockedUntil.getTime() > now.getTime()
    ) {
      throw new AppException('SHIPMENT_DELIVERY_OTP_LOCKED');
    }
    if (
      shipment.deliveryOtpLastSentAt &&
      now.getTime() - shipment.deliveryOtpLastSentAt.getTime() <
        DELIVERY_OTP_RESEND_COOLDOWN_MS
    ) {
      throw new AppException('SHIPMENT_DELIVERY_OTP_COOLDOWN');
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    const expiresAt = new Date(now.getTime() + DELIVERY_OTP_TTL_MS);
    const updated = await this.repo.setDeliveryOtp(
      id,
      shipment.deliveryOtpLastSentAt,
      {
        tripId: new Types.ObjectId(tripId),
        hash: this.hashDeliveryOtp(id, salt, code),
        salt,
        sentAt: now,
        expiresAt,
      },
    );
    if (!updated) throw new AppException('SHIPMENT_DELIVERY_OTP_COOLDOWN');

    await this.notificationQueue.add(
      EVENTS.SHIPMENT_DELIVERY_OTP_REQUESTED,
      {
        shipmentId: id,
        orderId: shipment.orderId,
        phone: shipment.recipient.phone,
        code,
        expiresInSeconds: DELIVERY_OTP_TTL_MS / 1000,
      },
      {
        jobId: `${EVENTS.SHIPMENT_DELIVERY_OTP_REQUESTED}:${id}:${now.getTime()}`,
      },
    );
    return {
      expiresAt,
      resendAvailableAt: new Date(
        now.getTime() + DELIVERY_OTP_RESEND_COOLDOWN_MS,
      ),
    };
  }

  async deliverForTrip(
    id: string,
    tripId: string,
    actorId: string,
    otp: string,
    codCollectionMethod: CodCollectionMethod | undefined,
    imageFiles: UploadedImageFile[],
  ): Promise<DeliveryForTripResult> {
    if (imageFiles.length === 0) {
      throw new AppException('SHIPMENT_POD_REQUIRED');
    }
    for (const file of imageFiles) this.validateImageFile(file);

    const shipment = await this.repo.findByIdWithDeliveryOtp(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');
    this.assertTripOwner(shipment, tripId, actorId);
    if (shipment.shipmentStatus === ShipmentStatus.DELIVERED) {
      await this.shipmentQueue.add(
        EVENTS.SHIPMENT_DELIVERED,
        {
          orderId: shipment.orderId,
          shipmentId: id,
          trackingNumber: shipment.trackingNumber,
        },
        { jobId: `${EVENTS.SHIPMENT_DELIVERED}:${id}` },
      );
      return {
        shipment,
        cashCollectedAmount:
          shipment.codCollectionMethod === CodCollectionMethod.CASH
            ? shipment.codCollectedAmount
            : 0,
      };
    }
    if (shipment.shipmentStatus !== ShipmentStatus.IN_TRANSIT) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }

    const now = new Date();
    if (
      shipment.deliveryOtpLockedUntil &&
      shipment.deliveryOtpLockedUntil.getTime() > now.getTime()
    ) {
      throw new AppException('SHIPMENT_DELIVERY_OTP_LOCKED');
    }
    if (
      !shipment.deliveryOtpHash ||
      !shipment.deliveryOtpSalt ||
      !shipment.deliveryOtpExpiresAt ||
      shipment.deliveryOtpExpiresAt.getTime() <= now.getTime()
    ) {
      throw new AppException('SHIPMENT_DELIVERY_OTP_EXPIRED');
    }
    if (
      !this.deliveryOtpMatches(
        id,
        shipment.deliveryOtpSalt,
        otp,
        shipment.deliveryOtpHash,
      )
    ) {
      const currentFailures = shipment.deliveryOtpFailedAttempts ?? 0;
      const failedAttempts = currentFailures + 1;
      const lockedUntil =
        failedAttempts >= DELIVERY_OTP_MAX_FAILURES
          ? new Date(now.getTime() + DELIVERY_OTP_LOCK_MS)
          : undefined;
      await this.repo.recordDeliveryOtpFailure(
        id,
        new Types.ObjectId(tripId),
        currentFailures,
        { failedAttempts, lockedUntil },
      );
      throw new AppException(
        lockedUntil
          ? 'SHIPMENT_DELIVERY_OTP_LOCKED'
          : 'SHIPMENT_DELIVERY_OTP_INVALID',
      );
    }

    const isCollectibleCod =
      shipment.paymentMethod === 'COD' && shipment.codAmount > 0;
    if (isCollectibleCod && !codCollectionMethod) {
      throw new AppException('SHIPMENT_COD_METHOD_REQUIRED');
    }
    if (!isCollectibleCod && codCollectionMethod) {
      throw new AppException('SHIPMENT_COD_METHOD_NOT_ALLOWED');
    }

    const podImages: string[] = [];
    for (const file of imageFiles) {
      const { url } = await this.cloudinary.uploadImage(
        file.buffer,
        'wms/shipment-pod',
      );
      podImages.push(url);
    }
    const cashCollectedAmount =
      codCollectionMethod === CodCollectionMethod.CASH ? shipment.codAmount : 0;
    const updated = await this.repo.completeDelivery(
      id,
      new Types.ObjectId(tripId),
      {
        deliveredAt: now,
        actorId: new Types.ObjectId(actorId),
        podImages,
        codCollectionMethod,
        codCollectedAmount: cashCollectedAmount,
      },
    );
    if (!updated) {
      const raced = await this.repo.findById(id);
      if (raced?.shipmentStatus === ShipmentStatus.DELIVERED) {
        await this.shipmentQueue.add(
          EVENTS.SHIPMENT_DELIVERED,
          {
            orderId: raced.orderId,
            shipmentId: id,
            trackingNumber: raced.trackingNumber,
          },
          { jobId: `${EVENTS.SHIPMENT_DELIVERED}:${id}` },
        );
        return {
          shipment: raced,
          cashCollectedAmount:
            raced.codCollectionMethod === CodCollectionMethod.CASH
              ? raced.codCollectedAmount
              : 0,
        };
      }
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }

    await this.shipmentQueue.add(
      EVENTS.SHIPMENT_DELIVERED,
      {
        orderId: updated.orderId,
        shipmentId: id,
        trackingNumber: updated.trackingNumber,
      },
      { jobId: `${EVENTS.SHIPMENT_DELIVERED}:${id}` },
    );
    return { shipment: updated, cashCollectedAmount };
  }

  async recordFailedAttemptForTrip(
    id: string,
    tripId: string,
    actorId: string,
    reason: string,
  ): Promise<ShipmentDocument> {
    const shipment = await this.repo.findById(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');
    this.assertTripOwner(shipment, tripId, actorId);
    if (shipment.shipmentStatus !== ShipmentStatus.IN_TRANSIT) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }
    const currentAttempts = shipment.attempts ?? 0;
    const nextAttempts = currentAttempts + 1;
    const updated = await this.repo.recordFailedDeliveryAttempt(
      id,
      new Types.ObjectId(tripId),
      currentAttempts,
      {
        attemptedAt: new Date(),
        actorId: new Types.ObjectId(actorId),
        reason,
        nextAttempts,
        returnToWarehouse: nextAttempts >= 3,
      },
    );
    if (!updated) throw new AppException('SHIPMENT_INVALID_TRANSITION');
    return updated;
  }

  async forceReturnForTrip(
    id: string,
    tripId: string,
    actorId: string,
    reason: string,
  ): Promise<ShipmentDocument> {
    const shipment = await this.repo.findById(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');
    this.assertTripOwner(shipment, tripId, actorId);
    if (
      [ShipmentStatus.RETURNING, ShipmentStatus.RETURNED].includes(
        shipment.shipmentStatus,
      )
    ) {
      return shipment;
    }
    if (shipment.shipmentStatus !== ShipmentStatus.IN_TRANSIT) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }
    const now = new Date();
    const updated = await this.repo.pushStatus(id, ShipmentStatus.IN_TRANSIT, {
      shipmentStatus: ShipmentStatus.RETURNING,
      historyEntry: {
        status: ShipmentStatus.RETURNING,
        at: now,
        by: new Types.ObjectId(actorId),
        note: reason,
        images: [],
      },
    });
    if (!updated) throw new AppException('SHIPMENT_INVALID_TRANSITION');
    return updated;
  }

  async scanReturnPackage(
    id: string,
    tripId: string,
    actorId: string,
    barcode: string,
  ): Promise<ShipmentDocument> {
    const shipment = await this.repo.findById(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');
    this.assertTripOwner(shipment, tripId, actorId);
    if (shipment.shipmentStatus !== ShipmentStatus.RETURNING) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }
    const shipmentPackage = shipment.packages.find(
      (candidate) => candidate.barcode === barcode,
    );
    if (
      !shipmentPackage ||
      shipmentPackage.loadedTripId?.toString() !== tripId
    ) {
      throw new AppException('DELIVERY_TRIP_PACKAGE_MISMATCH');
    }
    if (shipmentPackage.returnedAt) return shipment;
    const updated = await this.repo.scanReturnedPackage(
      id,
      barcode,
      new Types.ObjectId(tripId),
      new Types.ObjectId(actorId),
      new Date(),
    );
    if (updated) return updated;
    const raced = await this.repo.findById(id);
    const racedPackage = raced?.packages.find(
      (candidate) => candidate.barcode === barcode,
    );
    if (racedPackage?.returnedAt) return raced!;
    throw new AppException('SHIPMENT_RETURN_SCAN_CONFLICT');
  }

  async completeReturnForTrip(
    id: string,
    tripId: string,
    actorId: string,
  ): Promise<ShipmentDocument> {
    const shipment = await this.repo.findById(id);
    if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');
    this.assertTripOwner(shipment, tripId, actorId);
    if (shipment.shipmentStatus === ShipmentStatus.RETURNED) {
      await this.shipmentQueue.add(
        EVENTS.SHIPMENT_RETURNED,
        {
          orderId: shipment.orderId,
          shipmentId: id,
          trackingNumber: shipment.trackingNumber,
        },
        { jobId: `${EVENTS.SHIPMENT_RETURNED}:${id}` },
      );
      return shipment;
    }
    if (shipment.shipmentStatus !== ShipmentStatus.RETURNING) {
      throw new AppException('SHIPMENT_INVALID_TRANSITION');
    }
    if (
      shipment.packages.length === 0 ||
      shipment.packages.some((shipmentPackage) => !shipmentPackage.returnedAt)
    ) {
      throw new AppException('SHIPMENT_RETURN_PACKAGES_INCOMPLETE');
    }
    const now = new Date();
    const updated = await this.repo.pushStatus(id, ShipmentStatus.RETURNING, {
      shipmentStatus: ShipmentStatus.RETURNED,
      historyEntry: {
        status: ShipmentStatus.RETURNED,
        at: now,
        by: new Types.ObjectId(actorId),
        note: 'Đã bàn giao đủ kiện hoàn về kho',
        images: [],
      },
    });
    if (!updated) throw new AppException('SHIPMENT_INVALID_TRANSITION');
    await this.shipmentQueue.add(
      EVENTS.SHIPMENT_RETURNED,
      {
        orderId: updated.orderId,
        shipmentId: id,
        trackingNumber: updated.trackingNumber,
      },
      { jobId: `${EVENTS.SHIPMENT_RETURNED}:${id}` },
    );
    return updated;
  }

  private assertTripOwner(
    shipment: ShipmentDocument,
    tripId: string,
    actorId: string,
  ): void {
    if (shipment.activeTripId?.toString() !== tripId) {
      throw new AppException('DELIVERY_TRIP_SHIPMENT_CONFLICT');
    }
    if (shipment.assignedShipperId?.toString() !== actorId) {
      throw new AppException('SHIPMENT_NOT_OWNER');
    }
  }

  private hashDeliveryOtp(id: string, salt: string, code: string): string {
    const pepper = this.config.getOrThrow<string>('WMS_JWT_SECRET');
    return createHmac('sha256', pepper)
      .update(`${id}:${salt}:${code}`)
      .digest('hex');
  }

  private deliveryOtpMatches(
    id: string,
    salt: string,
    code: string,
    expectedHash: string,
  ): boolean {
    const actual = Buffer.from(this.hashDeliveryOtp(id, salt, code), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
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
