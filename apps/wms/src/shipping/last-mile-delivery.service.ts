import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { WmsRole } from '@app/auth';
import { Types } from 'mongoose';
import { GoodsReturnService } from '../goods-return/goods-return.service';
import { DocumentNumberService } from '../document-number/document-number.service';
import { UserRepository } from '../users/repositories/user.repository';
import { UserStatus } from '../users/schemas/user.schema';
import { DeliveryTripRepository } from './delivery-trip.repository';
import { DeliveryIncidentRepository } from './delivery-incident.repository';
import { ShipmentRepository } from './shipment.repository';
import { ShipmentService, type UploadedImageFile } from './shipment.service';
import {
  DeliveryTripDocument,
  DeliveryTripStatus,
} from './schemas/delivery-trip.schema';
import {
  DeliveryIncidentDocument,
  DeliveryIncidentResolutionAction,
  DeliveryIncidentStatus,
  DeliveryIncidentType,
} from './schemas/delivery-incident.schema';
import { CodCollectionMethod, ShipmentStatus } from './schemas/shipment.schema';

const TERMINAL_SHIPMENT_STATUSES = [
  ShipmentStatus.DELIVERED,
  ShipmentStatus.RETURNED,
];

@Injectable()
export class LastMileDeliveryService {
  constructor(
    private readonly tripRepo: DeliveryTripRepository,
    private readonly shipmentRepo: ShipmentRepository,
    private readonly shipmentService: ShipmentService,
    private readonly incidentRepo: DeliveryIncidentRepository,
    private readonly goodsReturnService: GoodsReturnService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly userRepository: UserRepository,
  ) {}

  async requestOtp(
    tripId: string,
    shipmentId: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<{ expiresAt: Date; resendAvailableAt: Date }> {
    const trip = await this.getTripForActor(tripId, actorId, actorRole);
    this.assertTripInTransit(trip);
    this.assertShipmentInTrip(trip, shipmentId);
    return this.shipmentService.requestDeliveryOtp(
      shipmentId,
      tripId,
      this.effectiveShipperId(trip, actorId, actorRole),
    );
  }

  async deliver(
    tripId: string,
    shipmentId: string,
    actorId: string,
    actorRole: WmsRole,
    otp: string,
    codCollectionMethod: CodCollectionMethod | undefined,
    imageFiles: UploadedImageFile[],
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getTripForActor(tripId, actorId, actorRole);
    this.assertTripInTransit(trip);
    this.assertShipmentInTrip(trip, shipmentId);
    const result = await this.shipmentService.deliverForTrip(
      shipmentId,
      tripId,
      this.effectiveShipperId(trip, actorId, actorRole),
      otp,
      codCollectionMethod,
      imageFiles,
    );
    let currentTrip = trip;
    if (result.cashCollectedAmount > 0) {
      const incremented = await this.tripRepo.postShipmentCash(
        tripId,
        new Types.ObjectId(shipmentId),
        result.cashCollectedAmount,
      );
      if (!incremented) {
        const current = await this.getTrip(tripId);
        if (
          !current.cashPostedShipmentIds?.some(
            (postedId) => postedId.toString() === shipmentId,
          )
        ) {
          throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
        }
        currentTrip = current;
      } else {
        currentTrip = incremented;
      }
    }
    return this.refreshCompletion(currentTrip, actorId);
  }

  async recordFailedAttempt(
    tripId: string,
    shipmentId: string,
    actorId: string,
    actorRole: WmsRole,
    reason: string,
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getTripForActor(tripId, actorId, actorRole);
    this.assertTripInTransit(trip);
    this.assertShipmentInTrip(trip, shipmentId);
    await this.shipmentService.recordFailedAttemptForTrip(
      shipmentId,
      tripId,
      this.effectiveShipperId(trip, actorId, actorRole),
      reason,
    );
    return trip;
  }

  async scanReturnPackage(
    tripId: string,
    shipmentId: string,
    barcode: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getTripForActor(tripId, actorId, actorRole);
    this.assertReturnHandoffAllowed(trip);
    this.assertShipmentInTrip(trip, shipmentId);
    await this.shipmentService.scanReturnPackage(
      shipmentId,
      tripId,
      this.effectiveShipperId(trip, actorId, actorRole),
      barcode,
    );
    return trip;
  }

  async completeReturnHandoff(
    tripId: string,
    shipmentId: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getTripForActor(tripId, actorId, actorRole);
    this.assertReturnHandoffAllowed(trip);
    this.assertShipmentInTrip(trip, shipmentId);
    const shipment = await this.shipmentService.completeReturnForTrip(
      shipmentId,
      tripId,
      this.effectiveShipperId(trip, actorId, actorRole),
    );

    const quantitiesBySku = new Map<string, number>();
    for (const shipmentPackage of shipment.packages) {
      for (const allocation of shipmentPackage.allocations) {
        quantitiesBySku.set(
          allocation.sku,
          (quantitiesBySku.get(allocation.sku) ?? 0) + allocation.quantity,
        );
      }
    }
    await this.goodsReturnService.createFromOrderReturned(
      shipment.orderId,
      shipment.orderCode ?? shipment.orderId,
      [...quantitiesBySku].map(([sku, quantity]) => ({ sku, quantity })),
    );
    return this.refreshCompletion(trip, actorId);
  }

  async settleCash(
    tripId: string,
    amount: number,
    actorId: string,
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getTrip(tripId);
    if (trip.status !== DeliveryTripStatus.AWAITING_SETTLEMENT) {
      throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
    }
    const outstanding =
      (trip.cashCollectedAmount ?? 0) - (trip.cashSettledAmount ?? 0);
    if (amount !== outstanding) {
      throw new AppException('DELIVERY_TRIP_SETTLEMENT_MISMATCH');
    }
    const updated = await this.tripRepo.settleCash(
      tripId,
      trip.cashCollectedAmount ?? 0,
      new Types.ObjectId(actorId),
      new Date(),
    );
    if (!updated) throw new AppException('DELIVERY_TRIP_SETTLEMENT_CONFLICT');
    return updated;
  }

  async reportIncident(
    tripId: string,
    input: {
      shipmentId?: string;
      type: DeliveryIncidentType;
      description: string;
    },
    actorId: string,
    actorRole: WmsRole,
  ): Promise<DeliveryIncidentDocument> {
    const trip = await this.getTripForActor(tripId, actorId, actorRole);
    if (
      ![DeliveryTripStatus.IN_TRANSIT, DeliveryTripStatus.PAUSED].includes(
        trip.status,
      )
    ) {
      throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
    }
    if (input.shipmentId) {
      this.assertShipmentInTrip(trip, input.shipmentId);
    }
    const incident = await this.incidentRepo.create({
      incidentNumber: await this.documentNumberService.next('INC'),
      tripId: trip._id,
      shipmentId: input.shipmentId
        ? new Types.ObjectId(input.shipmentId)
        : undefined,
      type: input.type,
      description: input.description,
      reportedBy: new Types.ObjectId(actorId),
      reportedAt: new Date(),
    });
    if (trip.status === DeliveryTripStatus.IN_TRANSIT) {
      await this.tripRepo.transition(
        tripId,
        [DeliveryTripStatus.IN_TRANSIT],
        DeliveryTripStatus.PAUSED,
        {
          by: new Types.ObjectId(actorId),
          at: new Date(),
          note: `Tạm dừng do sự cố ${incident.incidentNumber}`,
        },
      );
    }
    return incident;
  }

  async listIncidents(
    tripId: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<DeliveryIncidentDocument[]> {
    await this.getTripForActor(tripId, actorId, actorRole);
    return this.incidentRepo.findByTripId(tripId);
  }

  async resolveIncident(
    tripId: string,
    incidentId: string,
    input: {
      action: DeliveryIncidentResolutionAction;
      note?: string;
      rescueShipperId?: string;
    },
    actorId: string,
  ): Promise<DeliveryIncidentDocument> {
    const trip = await this.getTrip(tripId);
    if (trip.status !== DeliveryTripStatus.PAUSED) {
      throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
    }
    const incident = await this.incidentRepo.findById(incidentId);
    if (!incident || incident.tripId.toString() !== tripId) {
      throw new AppException('DELIVERY_INCIDENT_NOT_FOUND');
    }
    if (incident.status !== DeliveryIncidentStatus.OPEN) {
      throw new AppException('DELIVERY_INCIDENT_ALREADY_RESOLVED');
    }

    if (input.action === DeliveryIncidentResolutionAction.RESUME) {
      const resumed = await this.tripRepo.transition(
        tripId,
        [DeliveryTripStatus.PAUSED],
        DeliveryTripStatus.IN_TRANSIT,
        {
          by: new Types.ObjectId(actorId),
          at: new Date(),
          note: input.note ?? 'Tiếp tục chuyến sau xử lý sự cố',
        },
      );
      if (!resumed) {
        throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
      }
    } else if (input.action === DeliveryIncidentResolutionAction.RESCUE) {
      if (!input.rescueShipperId) {
        throw new AppException('DELIVERY_INCIDENT_RESCUE_SHIPPER_REQUIRED');
      }
      const rescueShipper = await this.userRepository.findActiveById(
        input.rescueShipperId,
      );
      if (
        !rescueShipper ||
        rescueShipper.role !== WmsRole.SHIPPER ||
        rescueShipper.status !== UserStatus.ACTIVE
      ) {
        throw new AppException('DELIVERY_INCIDENT_RESCUE_SHIPPER_INVALID');
      }
      const newShipperId = new Types.ObjectId(input.rescueShipperId);
      const reassigned = await this.tripRepo.reassign(
        tripId,
        trip.assignedShipperId,
        newShipperId,
      );
      if (!reassigned) {
        throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
      }
      await this.shipmentRepo.reassignActiveTripShipments(
        trip._id,
        newShipperId,
      );
    } else {
      const shipments = await this.shipmentRepo.findManyByIds(
        trip.stops.map((stop) => stop.shipmentId.toString()),
      );
      for (const shipment of shipments) {
        if (shipment.shipmentStatus === ShipmentStatus.IN_TRANSIT) {
          await this.shipmentService.forceReturnForTrip(
            shipment._id.toString(),
            tripId,
            trip.assignedShipperId.toString(),
            input.note ?? 'Manager yêu cầu đưa hàng về kho do sự cố',
          );
        }
      }
    }

    const resolved = await this.incidentRepo.resolve(incidentId, {
      action: input.action,
      note: input.note,
      resolvedBy: new Types.ObjectId(actorId),
      resolvedAt: new Date(),
    });
    if (!resolved) {
      throw new AppException('DELIVERY_INCIDENT_ALREADY_RESOLVED');
    }
    return resolved;
  }

  private async refreshCompletion(
    trip: DeliveryTripDocument,
    actorId: string,
  ): Promise<DeliveryTripDocument> {
    const shipments = await this.shipmentRepo.findManyByIds(
      trip.stops.map((stop) => stop.shipmentId.toString()),
    );
    const allTerminal =
      shipments.length === trip.stops.length &&
      shipments.every((shipment) =>
        TERMINAL_SHIPMENT_STATUSES.includes(shipment.shipmentStatus),
      );
    if (!allTerminal) return trip;

    const hasOutstandingCash =
      (trip.cashCollectedAmount ?? 0) > (trip.cashSettledAmount ?? 0);
    const targetStatus = hasOutstandingCash
      ? DeliveryTripStatus.AWAITING_SETTLEMENT
      : DeliveryTripStatus.COMPLETED;
    const now = new Date();
    const updated = await this.tripRepo.transition(
      trip._id.toString(),
      [DeliveryTripStatus.IN_TRANSIT, DeliveryTripStatus.PAUSED],
      targetStatus,
      {
        by: new Types.ObjectId(actorId),
        at: now,
        note: hasOutstandingCash
          ? 'Hoàn tất điểm dừng, chờ đối soát tiền mặt'
          : 'Hoàn tất toàn bộ điểm dừng',
        extra:
          targetStatus === DeliveryTripStatus.COMPLETED
            ? { completedAt: now }
            : undefined,
      },
    );
    if (updated) return updated;
    const current = await this.getTrip(trip._id.toString());
    if (current.status === targetStatus) return current;
    throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
  }

  private async getTrip(id: string): Promise<DeliveryTripDocument> {
    const trip = await this.tripRepo.findById(id);
    if (!trip) throw new AppException('DELIVERY_TRIP_NOT_FOUND');
    return trip;
  }

  private async getTripForActor(
    id: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getTrip(id);
    if (
      actorRole === WmsRole.SHIPPER &&
      trip.assignedShipperId.toString() !== actorId
    ) {
      throw new AppException('DELIVERY_TRIP_NOT_OWNER');
    }
    return trip;
  }

  private assertTripInTransit(trip: DeliveryTripDocument): void {
    if (trip.status !== DeliveryTripStatus.IN_TRANSIT) {
      throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
    }
  }

  private assertReturnHandoffAllowed(trip: DeliveryTripDocument): void {
    if (
      ![DeliveryTripStatus.IN_TRANSIT, DeliveryTripStatus.PAUSED].includes(
        trip.status,
      )
    ) {
      throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
    }
  }

  private assertShipmentInTrip(
    trip: DeliveryTripDocument,
    shipmentId: string,
  ): void {
    if (!trip.stops.some((stop) => stop.shipmentId.toString() === shipmentId)) {
      throw new AppException('DELIVERY_TRIP_SHIPMENT_MISMATCH');
    }
  }

  private effectiveShipperId(
    trip: DeliveryTripDocument,
    actorId: string,
    actorRole: WmsRole,
  ): string {
    return actorRole === WmsRole.ADMIN
      ? trip.assignedShipperId.toString()
      : actorId;
  }
}
