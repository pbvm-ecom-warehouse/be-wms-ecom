import { WmsRole } from '@app/auth';
import { Types } from 'mongoose';
import { LastMileDeliveryService } from './last-mile-delivery.service';
import {
  DeliveryIncidentResolutionAction,
  DeliveryIncidentStatus,
  DeliveryIncidentType,
} from './schemas/delivery-incident.schema';
import {
  DeliveryTripStatus,
  type DeliveryTripDocument,
} from './schemas/delivery-trip.schema';
import { ShipmentStatus } from './schemas/shipment.schema';
import { UserStatus } from '../users/schemas/user.schema';

const makeTripRepo = () => ({
  findById: jest.fn(),
  transition: jest.fn(),
  postShipmentCash: jest.fn(),
  settleCash: jest.fn(),
  reassign: jest.fn(),
});
const makeShipmentRepo = () => ({
  findManyByIds: jest.fn(),
  reassignActiveTripShipments: jest.fn(),
});
const makeShipmentService = () => ({
  deliverForTrip: jest.fn(),
  recordFailedAttemptForTrip: jest.fn(),
  scanReturnPackage: jest.fn(),
  completeReturnForTrip: jest.fn(),
  forceReturnForTrip: jest.fn(),
});
const makeIncidentRepo = () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByTripId: jest.fn(),
  resolve: jest.fn(),
});
const makeGoodsReturnService = () => ({
  createFromOrderReturned: jest.fn(),
});
const makeDocumentNumber = () => ({
  next: jest.fn().mockResolvedValue('INC-20260730-0001'),
});
const makeUserRepository = () => ({ findActiveById: jest.fn() });

describe('LastMileDeliveryService', () => {
  let service: LastMileDeliveryService;
  let tripRepo: ReturnType<typeof makeTripRepo>;
  let shipmentRepo: ReturnType<typeof makeShipmentRepo>;
  let shipmentService: ReturnType<typeof makeShipmentService>;
  let incidentRepo: ReturnType<typeof makeIncidentRepo>;
  let goodsReturnService: ReturnType<typeof makeGoodsReturnService>;
  let documentNumber: ReturnType<typeof makeDocumentNumber>;
  let userRepository: ReturnType<typeof makeUserRepository>;

  const tripId = new Types.ObjectId().toString();
  const shipperId = new Types.ObjectId().toString();
  const shipmentId = new Types.ObjectId().toString();

  const trip = {
    _id: new Types.ObjectId(tripId),
    assignedShipperId: new Types.ObjectId(shipperId),
    status: DeliveryTripStatus.IN_TRANSIT,
    cashCollectedAmount: 0,
    cashSettledAmount: 0,
    stops: [{ shipmentId: new Types.ObjectId(shipmentId), routeOrder: 1 }],
  } as DeliveryTripDocument;

  beforeEach(() => {
    tripRepo = makeTripRepo();
    shipmentRepo = makeShipmentRepo();
    shipmentService = makeShipmentService();
    incidentRepo = makeIncidentRepo();
    goodsReturnService = makeGoodsReturnService();
    documentNumber = makeDocumentNumber();
    userRepository = makeUserRepository();
    service = new LastMileDeliveryService(
      tripRepo as never,
      shipmentRepo as never,
      shipmentService as never,
      incidentRepo as never,
      goodsReturnService as never,
      documentNumber as never,
      userRepository as never,
    );
    tripRepo.findById.mockResolvedValue(trip);
  });

  it('giao COD CASH cuối chuyến → AWAITING_SETTLEMENT', async () => {
    shipmentService.deliverForTrip.mockResolvedValue({
      shipment: {
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.DELIVERED,
      },
      cashCollectedAmount: 150000,
    });
    tripRepo.postShipmentCash.mockResolvedValue({
      ...trip,
      cashCollectedAmount: 150000,
    });
    shipmentRepo.findManyByIds.mockResolvedValue([
      { _id: shipmentId, shipmentStatus: ShipmentStatus.DELIVERED },
    ]);
    tripRepo.transition.mockResolvedValue({
      ...trip,
      status: DeliveryTripStatus.AWAITING_SETTLEMENT,
      cashCollectedAmount: 150000,
    });

    const result = await service.deliver(
      tripId,
      shipmentId,
      shipperId,
      WmsRole.SHIPPER,
      '123456',
      'CASH',
      [{ buffer: Buffer.from('x'), mimetype: 'image/png', size: 1 }],
    );

    expect(tripRepo.postShipmentCash).toHaveBeenCalledWith(
      tripId,
      new Types.ObjectId(shipmentId),
      150000,
    );
    expect(result.status).toBe(DeliveryTripStatus.AWAITING_SETTLEMENT);
  });

  it('Manager phải đối soát đúng số tiền mặt', async () => {
    tripRepo.findById.mockResolvedValue({
      ...trip,
      status: DeliveryTripStatus.AWAITING_SETTLEMENT,
      cashCollectedAmount: 150000,
      cashSettledAmount: 0,
    });

    await expect(
      service.settleCash(tripId, 149000, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ code: 'DELIVERY_TRIP_SETTLEMENT_MISMATCH' });
    expect(tripRepo.settleCash).not.toHaveBeenCalled();
  });

  it('quét đủ kiện hoàn mới handoff và tạo GoodsReturn cho Receiver', async () => {
    const returningTrip = {
      ...trip,
      status: DeliveryTripStatus.PAUSED,
    };
    tripRepo.findById.mockResolvedValue(returningTrip);
    shipmentService.completeReturnForTrip.mockResolvedValue({
      _id: shipmentId,
      orderId: 'order-1',
      orderCode: 'ORD-1',
      shipmentStatus: ShipmentStatus.RETURNED,
      packages: [
        {
          allocations: [{ sku: 'SKU-1', quantity: 2 }],
        },
      ],
    });
    shipmentRepo.findManyByIds.mockResolvedValue([
      { _id: shipmentId, shipmentStatus: ShipmentStatus.RETURNED },
    ]);
    tripRepo.transition.mockResolvedValue({
      ...returningTrip,
      status: DeliveryTripStatus.COMPLETED,
    });

    await service.completeReturnHandoff(
      tripId,
      shipmentId,
      shipperId,
      WmsRole.SHIPPER,
    );

    expect(goodsReturnService.createFromOrderReturned).toHaveBeenCalledWith(
      'order-1',
      'ORD-1',
      [{ sku: 'SKU-1', quantity: 2 }],
    );
  });

  it('báo sự cố tạo audit và tạm dừng chuyến đang chạy', async () => {
    const incident = {
      _id: new Types.ObjectId(),
      incidentNumber: 'INC-20260730-0001',
      tripId: new Types.ObjectId(tripId),
      type: DeliveryIncidentType.VEHICLE_BREAKDOWN,
      status: DeliveryIncidentStatus.OPEN,
    };
    incidentRepo.create.mockResolvedValue(incident);
    tripRepo.transition.mockResolvedValue({
      ...trip,
      status: DeliveryTripStatus.PAUSED,
    });

    const result = await service.reportIncident(
      tripId,
      {
        type: DeliveryIncidentType.VEHICLE_BREAKDOWN,
        description: 'Xe hỏng giữa đường',
      },
      shipperId,
      WmsRole.SHIPPER,
    );

    expect(result).toBe(incident);
    expect(incidentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        incidentNumber: 'INC-20260730-0001',
        tripId: new Types.ObjectId(tripId),
        reportedBy: new Types.ObjectId(shipperId),
      }),
    );
    expect(tripRepo.transition).toHaveBeenCalledWith(
      tripId,
      [DeliveryTripStatus.IN_TRANSIT],
      DeliveryTripStatus.PAUSED,
      expect.objectContaining({ by: new Types.ObjectId(shipperId) }),
    );
  });

  it('Manager chỉ chuyển cứu hộ cho user SHIPPER đang ACTIVE', async () => {
    const managerId = new Types.ObjectId().toString();
    const incidentId = new Types.ObjectId().toString();
    const rescueShipperId = new Types.ObjectId().toString();
    const pausedTrip = {
      ...trip,
      status: DeliveryTripStatus.PAUSED,
    };
    tripRepo.findById.mockResolvedValue(pausedTrip);
    incidentRepo.findById.mockResolvedValue({
      _id: new Types.ObjectId(incidentId),
      tripId: new Types.ObjectId(tripId),
      status: DeliveryIncidentStatus.OPEN,
    });
    userRepository.findActiveById.mockResolvedValue({
      _id: new Types.ObjectId(rescueShipperId),
      role: WmsRole.SHIPPER,
      status: UserStatus.ACTIVE,
    });
    tripRepo.reassign.mockResolvedValue({
      ...pausedTrip,
      assignedShipperId: new Types.ObjectId(rescueShipperId),
      status: DeliveryTripStatus.IN_TRANSIT,
    });
    incidentRepo.resolve.mockResolvedValue({
      _id: new Types.ObjectId(incidentId),
      tripId: new Types.ObjectId(tripId),
      status: DeliveryIncidentStatus.RESOLVED,
      resolutionAction: DeliveryIncidentResolutionAction.RESCUE,
    });

    await service.resolveIncident(
      tripId,
      incidentId,
      {
        action: DeliveryIncidentResolutionAction.RESCUE,
        rescueShipperId,
      },
      managerId,
    );

    expect(tripRepo.reassign).toHaveBeenCalledWith(
      tripId,
      trip.assignedShipperId,
      new Types.ObjectId(rescueShipperId),
    );
    expect(shipmentRepo.reassignActiveTripShipments).toHaveBeenCalledWith(
      trip._id,
      new Types.ObjectId(rescueShipperId),
    );
  });
});
