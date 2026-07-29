import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { WmsRole } from '@app/auth';
import { Types } from 'mongoose';
import { DocumentNumberService } from '../document-number/document-number.service';
import type {
  CreateDeliveryTripDto,
  QueryDeliveryTripDto,
} from './dto/delivery-trip.dto';
import {
  DeliveryTripDocument,
  DeliveryTripStatus,
} from './schemas/delivery-trip.schema';
import {
  DeliveryTripRepository,
  type QueryDeliveryTripInput,
} from './delivery-trip.repository';
import { ShipmentRepository } from './shipment.repository';
import { ShipmentService } from './shipment.service';
import { ShipmentStatus } from './schemas/shipment.schema';

interface Coordinate {
  latitude: number;
  longitude: number;
}

@Injectable()
export class DeliveryTripService {
  constructor(
    private readonly repo: DeliveryTripRepository,
    private readonly shipmentRepo: ShipmentRepository,
    private readonly shipmentService: ShipmentService,
    private readonly documentNumberService: DocumentNumberService,
  ) {}

  async create(
    dto: CreateDeliveryTripDto,
    actorId: string,
  ): Promise<DeliveryTripDocument> {
    this.assertUniqueIds(dto.shipmentIds);
    const shipments = await this.shipmentRepo.findManyByIds(dto.shipmentIds);
    const shipmentById = new Map(
      shipments.map((shipment) => [shipment._id.toString(), shipment]),
    );
    const shipperObjectId = new Types.ObjectId(dto.assignedShipperId);

    for (const shipmentId of dto.shipmentIds) {
      const shipment = shipmentById.get(shipmentId);
      if (!shipment) throw new AppException('SHIPMENT_NOT_FOUND');
      if (
        shipment.shipmentStatus !== ShipmentStatus.READY ||
        shipment.assignedShipperId?.toString() !== dto.assignedShipperId ||
        shipment.activeTripId
      ) {
        throw new AppException('DELIVERY_TRIP_SHIPMENT_CONFLICT');
      }
    }

    const tripId = new Types.ObjectId();
    const reservedIds: string[] = [];
    try {
      for (const shipmentId of dto.shipmentIds) {
        const reserved = await this.shipmentRepo.reserveForTrip(
          shipmentId,
          shipperObjectId,
          tripId,
        );
        if (!reserved) {
          throw new AppException('DELIVERY_TRIP_SHIPMENT_CONFLICT');
        }
        reservedIds.push(shipmentId);
      }

      const tripNumber = await this.documentNumberService.next('TRIP');
      return await this.repo.create({
        id: tripId,
        tripNumber,
        assignedShipperId: shipperObjectId,
        stops: dto.shipmentIds.map((shipmentId, index) => ({
          shipmentId: new Types.ObjectId(shipmentId),
          routeOrder: index + 1,
        })),
        createdBy: new Types.ObjectId(actorId),
        now: new Date(),
      });
    } catch (error) {
      await Promise.allSettled(
        reservedIds.map((shipmentId) =>
          this.shipmentRepo.releaseTripReservation(shipmentId, tripId),
        ),
      );
      await this.repo.deleteDraft(tripId);
      throw error;
    }
  }

  async getById(id: string): Promise<DeliveryTripDocument> {
    const trip = await this.repo.findById(id);
    if (!trip) throw new AppException('DELIVERY_TRIP_NOT_FOUND');
    return trip;
  }

  async getByIdForActor(
    id: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getById(id);
    this.assertOwner(trip, actorId, actorRole);
    return trip;
  }

  list(
    query: QueryDeliveryTripDto,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<{ data: DeliveryTripDocument[]; total: number }> {
    const repoQuery: QueryDeliveryTripInput =
      actorRole === WmsRole.SHIPPER
        ? { ...query, assignedShipperId: actorId }
        : query;
    return this.repo.findAll(repoQuery);
  }

  async updateRoute(
    id: string,
    shipmentIds: string[],
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getById(id);
    if (trip.status !== DeliveryTripStatus.DRAFT) {
      throw new AppException('DELIVERY_TRIP_ROUTE_LOCKED');
    }
    this.assertSameShipmentSet(trip, shipmentIds);
    const updated = await this.repo.replaceStops(
      id,
      shipmentIds.map((shipmentId, index) => ({
        shipmentId: new Types.ObjectId(shipmentId),
        routeOrder: index + 1,
      })),
    );
    if (!updated) throw new AppException('DELIVERY_TRIP_ROUTE_LOCKED');
    return updated;
  }

  /**
   * Nearest-neighbour ổn định, lấy điểm đầu đang chọn làm mốc. Nếu bất kỳ địa
   * chỉ nào thiếu tọa độ số thì giữ nguyên thứ tự thủ công, không đoán tuyến.
   */
  async optimizeRoute(id: string): Promise<DeliveryTripDocument> {
    const trip = await this.getById(id);
    if (trip.status !== DeliveryTripStatus.DRAFT) {
      throw new AppException('DELIVERY_TRIP_ROUTE_LOCKED');
    }
    const orderedStops = [...trip.stops].sort(
      (left, right) => left.routeOrder - right.routeOrder,
    );
    const shipmentIds = orderedStops.map((stop) => stop.shipmentId.toString());
    const shipments = await this.shipmentRepo.findManyByIds(shipmentIds);
    const byId = new Map(
      shipments.map((shipment) => [shipment._id.toString(), shipment]),
    );
    const coordinates = new Map<string, Coordinate>();
    for (const shipmentId of shipmentIds) {
      const shipment = byId.get(shipmentId);
      const coordinate = shipment
        ? this.readCoordinate(shipment.recipient?.address)
        : undefined;
      if (!coordinate) return this.updateRoute(id, shipmentIds);
      coordinates.set(shipmentId, coordinate);
    }
    if (shipmentIds.length < 3) return this.updateRoute(id, shipmentIds);

    const optimized = [shipmentIds[0]];
    const remaining = new Set(shipmentIds.slice(1));
    while (remaining.size > 0) {
      const currentId = optimized[optimized.length - 1];
      const current = coordinates.get(currentId)!;
      const nextId = [...remaining].sort((leftId, rightId) => {
        const distanceDiff =
          this.distanceSquared(current, coordinates.get(leftId)!) -
          this.distanceSquared(current, coordinates.get(rightId)!);
        return distanceDiff || leftId.localeCompare(rightId);
      })[0];
      optimized.push(nextId);
      remaining.delete(nextId);
    }
    return this.updateRoute(id, optimized);
  }

  async markReady(id: string, actorId: string): Promise<DeliveryTripDocument> {
    const trip = await this.getById(id);
    if (trip.status === DeliveryTripStatus.READY) return trip;
    if (trip.status !== DeliveryTripStatus.DRAFT || trip.stops.length === 0) {
      throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
    }
    const updated = await this.repo.transition(
      id,
      [DeliveryTripStatus.DRAFT],
      DeliveryTripStatus.READY,
      {
        by: new Types.ObjectId(actorId),
        at: new Date(),
        note: 'Đã chốt lộ trình, chờ chất kiện',
      },
    );
    if (!updated) throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
    return updated;
  }

  async scanPackage(
    id: string,
    barcode: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getById(id);
    this.assertOwner(trip, actorId, actorRole);
    if (
      ![DeliveryTripStatus.READY, DeliveryTripStatus.LOADING].includes(
        trip.status,
      )
    ) {
      throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
    }

    const shipment = await this.shipmentRepo.findByPackageBarcode(barcode);
    if (!shipment) throw new AppException('SHIPMENT_PACKAGE_NOT_FOUND');
    if (
      !trip.stops.some(
        (stop) => stop.shipmentId.toString() === shipment._id.toString(),
      )
    ) {
      throw new AppException('DELIVERY_TRIP_PACKAGE_MISMATCH');
    }

    const shipmentPackage = shipment.packages.find(
      (candidate) => candidate.barcode === barcode,
    );
    if (!shipmentPackage) throw new AppException('SHIPMENT_PACKAGE_NOT_FOUND');
    const tripId = trip._id;
    if (shipmentPackage.loadedTripId) {
      if (shipmentPackage.loadedTripId.toString() !== tripId.toString()) {
        throw new AppException('DELIVERY_TRIP_PACKAGE_ALREADY_LOADED');
      }
      return this.ensureLoading(trip, actorId);
    }

    const loaded = await this.shipmentRepo.loadPackage(
      shipment._id.toString(),
      barcode,
      tripId,
      new Date(),
    );
    if (!loaded) {
      const current = await this.shipmentRepo.findByPackageBarcode(barcode);
      const currentPackage = current?.packages.find(
        (candidate) => candidate.barcode === barcode,
      );
      if (currentPackage?.loadedTripId?.toString() !== tripId.toString()) {
        throw new AppException('DELIVERY_TRIP_PACKAGE_ALREADY_LOADED');
      }
    }
    return this.ensureLoading(trip, actorId);
  }

  async start(
    id: string,
    actorId: string,
    actorRole: WmsRole,
  ): Promise<DeliveryTripDocument> {
    const trip = await this.getById(id);
    this.assertOwner(trip, actorId, actorRole);
    if (trip.status === DeliveryTripStatus.IN_TRANSIT) return trip;
    if (
      ![DeliveryTripStatus.READY, DeliveryTripStatus.LOADING].includes(
        trip.status,
      )
    ) {
      throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
    }

    const shipmentIds = trip.stops.map((stop) => stop.shipmentId.toString());
    const shipments = await this.shipmentRepo.findManyByIds(shipmentIds);
    if (shipments.length !== shipmentIds.length) {
      throw new AppException('SHIPMENT_NOT_FOUND');
    }
    const tripId = trip._id.toString();
    const everyPackageLoaded =
      shipments.every((shipment) => shipment.packages.length > 0) &&
      shipments.every((shipment) =>
        shipment.packages.every(
          (shipmentPackage) =>
            shipmentPackage.loadedTripId?.toString() === tripId,
        ),
      );
    if (!everyPackageLoaded) {
      throw new AppException('DELIVERY_TRIP_PACKAGES_INCOMPLETE');
    }

    const shipmentActorId =
      actorRole === WmsRole.ADMIN ? trip.assignedShipperId.toString() : actorId;
    for (const shipmentId of shipmentIds) {
      await this.shipmentService.startForTrip(shipmentId, id, shipmentActorId);
    }
    const startedAt = new Date();
    const updated = await this.repo.transition(
      id,
      [DeliveryTripStatus.READY, DeliveryTripStatus.LOADING],
      DeliveryTripStatus.IN_TRANSIT,
      {
        by: new Types.ObjectId(actorId),
        at: startedAt,
        note: 'Đã chất đủ kiện và bắt đầu giao',
        extra: { startedAt },
      },
    );
    if (updated) return updated;
    const current = await this.getById(id);
    if (current.status === DeliveryTripStatus.IN_TRANSIT) return current;
    throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
  }

  private async ensureLoading(
    trip: DeliveryTripDocument,
    actorId: string,
  ): Promise<DeliveryTripDocument> {
    if (trip.status === DeliveryTripStatus.LOADING) return trip;
    const updated = await this.repo.transition(
      trip._id.toString(),
      [DeliveryTripStatus.READY],
      DeliveryTripStatus.LOADING,
      {
        by: new Types.ObjectId(actorId),
        at: new Date(),
        note: 'Bắt đầu chất kiện lên chuyến',
      },
    );
    if (updated) return updated;
    const current = await this.getById(trip._id.toString());
    if (current.status === DeliveryTripStatus.LOADING) return current;
    throw new AppException('DELIVERY_TRIP_INVALID_TRANSITION');
  }

  private assertOwner(
    trip: DeliveryTripDocument,
    actorId: string,
    actorRole: WmsRole,
  ): void {
    if (
      actorRole === WmsRole.SHIPPER &&
      trip.assignedShipperId.toString() !== actorId
    ) {
      throw new AppException('DELIVERY_TRIP_NOT_OWNER');
    }
  }

  private assertUniqueIds(ids: string[]): void {
    if (new Set(ids).size !== ids.length) {
      throw new AppException('DELIVERY_TRIP_DUPLICATE_SHIPMENT');
    }
  }

  private assertSameShipmentSet(
    trip: DeliveryTripDocument,
    shipmentIds: string[],
  ): void {
    this.assertUniqueIds(shipmentIds);
    const currentIds = new Set(
      trip.stops.map((stop) => stop.shipmentId.toString()),
    );
    if (
      currentIds.size !== shipmentIds.length ||
      shipmentIds.some((shipmentId) => !currentIds.has(shipmentId))
    ) {
      throw new AppException('DELIVERY_TRIP_ROUTE_MISMATCH');
    }
  }

  private readCoordinate(
    address?: Record<string, unknown>,
  ): Coordinate | undefined {
    if (!address) return undefined;
    const location =
      address['location'] &&
      typeof address['location'] === 'object' &&
      !Array.isArray(address['location'])
        ? (address['location'] as Record<string, unknown>)
        : undefined;
    const latitude =
      this.readNumber(address['latitude']) ??
      this.readNumber(address['lat']) ??
      this.readNumber(location?.['latitude']) ??
      this.readNumber(location?.['lat']);
    const longitude =
      this.readNumber(address['longitude']) ??
      this.readNumber(address['lng']) ??
      this.readNumber(location?.['longitude']) ??
      this.readNumber(location?.['lng']);
    return latitude === undefined || longitude === undefined
      ? undefined
      : { latitude, longitude };
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private distanceSquared(left: Coordinate, right: Coordinate): number {
    return (
      (left.latitude - right.latitude) ** 2 +
      (left.longitude - right.longitude) ** 2
    );
  }
}
