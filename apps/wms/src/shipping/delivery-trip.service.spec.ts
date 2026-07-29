import { WmsRole } from '@app/auth';
import { Types } from 'mongoose';
import { DeliveryTripService } from './delivery-trip.service';
import { DeliveryTripStatus } from './schemas/delivery-trip.schema';
import { ShipmentStatus } from './schemas/shipment.schema';

const makeTripRepo = () => ({
  create: jest.fn(),
  deleteDraft: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  replaceStops: jest.fn(),
  transition: jest.fn(),
});

const makeShipmentRepo = () => ({
  findManyByIds: jest.fn(),
  findByPackageBarcode: jest.fn(),
  reserveForTrip: jest.fn(),
  releaseTripReservation: jest.fn(),
  loadPackage: jest.fn(),
});

const makeShipmentService = () => ({
  startForTrip: jest.fn(),
});

const makeDocumentNumber = () => ({
  next: jest.fn().mockResolvedValue('TRIP-20260730-0001'),
});

describe('DeliveryTripService', () => {
  let service: DeliveryTripService;
  let tripRepo: ReturnType<typeof makeTripRepo>;
  let shipmentRepo: ReturnType<typeof makeShipmentRepo>;
  let shipmentService: ReturnType<typeof makeShipmentService>;
  let documentNumber: ReturnType<typeof makeDocumentNumber>;

  const managerId = new Types.ObjectId().toString();
  const shipperId = new Types.ObjectId().toString();
  const shipmentId = new Types.ObjectId().toString();
  const packageBarcode = 'PKG-20260730-0001';

  beforeEach(() => {
    tripRepo = makeTripRepo();
    shipmentRepo = makeShipmentRepo();
    shipmentService = makeShipmentService();
    documentNumber = makeDocumentNumber();
    service = new DeliveryTripService(
      tripRepo as never,
      shipmentRepo as never,
      shipmentService as never,
      documentNumber as never,
    );
  });

  it('tạo DRAFT và khóa atomic từng shipment READY đúng Shipper', async () => {
    const shipment = {
      _id: new Types.ObjectId(shipmentId),
      shipmentStatus: ShipmentStatus.READY,
      assignedShipperId: new Types.ObjectId(shipperId),
    };
    shipmentRepo.findManyByIds.mockResolvedValue([shipment]);
    shipmentRepo.reserveForTrip.mockResolvedValue(shipment);
    tripRepo.create.mockImplementation((input) =>
      Promise.resolve({
        _id: input.id,
        status: DeliveryTripStatus.DRAFT,
        assignedShipperId: input.assignedShipperId,
        stops: input.stops,
      }),
    );

    const result = await service.create(
      { assignedShipperId: shipperId, shipmentIds: [shipmentId] },
      managerId,
    );

    expect(shipmentRepo.reserveForTrip).toHaveBeenCalledWith(
      shipmentId,
      new Types.ObjectId(shipperId),
      expect.any(Types.ObjectId),
    );
    expect(result.status).toBe(DeliveryTripStatus.DRAFT);
  });

  it('rollback các khóa đã giữ nếu một shipment bị tranh chấp', async () => {
    const secondId = new Types.ObjectId().toString();
    shipmentRepo.findManyByIds.mockResolvedValue([
      {
        _id: new Types.ObjectId(shipmentId),
        shipmentStatus: ShipmentStatus.READY,
        assignedShipperId: new Types.ObjectId(shipperId),
      },
      {
        _id: new Types.ObjectId(secondId),
        shipmentStatus: ShipmentStatus.READY,
        assignedShipperId: new Types.ObjectId(shipperId),
      },
    ]);
    shipmentRepo.reserveForTrip
      .mockResolvedValueOnce({ _id: shipmentId })
      .mockResolvedValueOnce(null);

    await expect(
      service.create(
        {
          assignedShipperId: shipperId,
          shipmentIds: [shipmentId, secondId],
        },
        managerId,
      ),
    ).rejects.toMatchObject({ code: 'DELIVERY_TRIP_SHIPMENT_CONFLICT' });
    expect(shipmentRepo.releaseTripReservation).toHaveBeenCalledWith(
      shipmentId,
      expect.any(Types.ObjectId),
    );
    expect(tripRepo.create).not.toHaveBeenCalled();
  });

  it('Shipper chỉ xem chuyến của chính mình', async () => {
    tripRepo.findAll.mockResolvedValue({ data: [], total: 0 });

    await service.list({}, shipperId, WmsRole.SHIPPER);

    expect(tripRepo.findAll).toHaveBeenCalledWith({
      assignedShipperId: shipperId,
    });
  });

  it('tối ưu route nearest-neighbour khi mọi địa chỉ có tọa độ', async () => {
    const tripId = new Types.ObjectId().toString();
    const secondId = new Types.ObjectId().toString();
    const thirdId = new Types.ObjectId().toString();
    const trip = {
      _id: new Types.ObjectId(tripId),
      assignedShipperId: new Types.ObjectId(shipperId),
      status: DeliveryTripStatus.DRAFT,
      stops: [
        { shipmentId: new Types.ObjectId(shipmentId), routeOrder: 1 },
        { shipmentId: new Types.ObjectId(secondId), routeOrder: 2 },
        { shipmentId: new Types.ObjectId(thirdId), routeOrder: 3 },
      ],
    };
    tripRepo.findById.mockResolvedValue(trip);
    shipmentRepo.findManyByIds.mockResolvedValue([
      {
        _id: new Types.ObjectId(shipmentId),
        recipient: { address: { latitude: 0, longitude: 0 } },
      },
      {
        _id: new Types.ObjectId(secondId),
        recipient: { address: { latitude: 10, longitude: 10 } },
      },
      {
        _id: new Types.ObjectId(thirdId),
        recipient: { address: { latitude: 1, longitude: 1 } },
      },
    ]);
    tripRepo.replaceStops.mockResolvedValue(trip);

    await service.optimizeRoute(tripId);

    expect(tripRepo.replaceStops).toHaveBeenCalledWith(tripId, [
      { shipmentId: new Types.ObjectId(shipmentId), routeOrder: 1 },
      { shipmentId: new Types.ObjectId(thirdId), routeOrder: 2 },
      { shipmentId: new Types.ObjectId(secondId), routeOrder: 3 },
    ]);
  });

  it('quét package thuộc chuyến và chuyển READY sang LOADING', async () => {
    const tripId = new Types.ObjectId().toString();
    const trip = {
      _id: new Types.ObjectId(tripId),
      assignedShipperId: new Types.ObjectId(shipperId),
      status: DeliveryTripStatus.READY,
      stops: [{ shipmentId: new Types.ObjectId(shipmentId), routeOrder: 1 }],
    };
    tripRepo.findById.mockResolvedValue(trip);
    shipmentRepo.findByPackageBarcode.mockResolvedValue({
      _id: new Types.ObjectId(shipmentId),
      packages: [{ barcode: packageBarcode }],
    });
    shipmentRepo.loadPackage.mockResolvedValue({ _id: shipmentId });
    tripRepo.transition.mockResolvedValue({
      ...trip,
      status: DeliveryTripStatus.LOADING,
    });

    const result = await service.scanPackage(
      tripId,
      packageBarcode,
      shipperId,
      WmsRole.SHIPPER,
    );

    expect(shipmentRepo.loadPackage).toHaveBeenCalledWith(
      shipmentId,
      packageBarcode,
      new Types.ObjectId(tripId),
      expect.any(Date),
    );
    expect(result.status).toBe(DeliveryTripStatus.LOADING);
  });

  it('quét lặp cùng package trong cùng chuyến là idempotent', async () => {
    const tripId = new Types.ObjectId().toString();
    const tripObjectId = new Types.ObjectId(tripId);
    const trip = {
      _id: tripObjectId,
      assignedShipperId: new Types.ObjectId(shipperId),
      status: DeliveryTripStatus.LOADING,
      stops: [{ shipmentId: new Types.ObjectId(shipmentId), routeOrder: 1 }],
    };
    tripRepo.findById.mockResolvedValue(trip);
    shipmentRepo.findByPackageBarcode.mockResolvedValue({
      _id: new Types.ObjectId(shipmentId),
      packages: [{ barcode: packageBarcode, loadedTripId: tripObjectId }],
    });

    await expect(
      service.scanPackage(tripId, packageBarcode, shipperId, WmsRole.SHIPPER),
    ).resolves.toBe(trip);
    expect(shipmentRepo.loadPackage).not.toHaveBeenCalled();
  });

  it('chặn bắt đầu khi còn package chưa scan', async () => {
    const tripId = new Types.ObjectId().toString();
    tripRepo.findById.mockResolvedValue({
      _id: new Types.ObjectId(tripId),
      assignedShipperId: new Types.ObjectId(shipperId),
      status: DeliveryTripStatus.LOADING,
      stops: [{ shipmentId: new Types.ObjectId(shipmentId), routeOrder: 1 }],
    });
    shipmentRepo.findManyByIds.mockResolvedValue([
      {
        _id: new Types.ObjectId(shipmentId),
        packages: [{ barcode: packageBarcode }],
      },
    ]);

    await expect(
      service.start(tripId, shipperId, WmsRole.SHIPPER),
    ).rejects.toMatchObject({ code: 'DELIVERY_TRIP_PACKAGES_INCOMPLETE' });
    expect(shipmentService.startForTrip).not.toHaveBeenCalled();
  });

  it('đủ package thì đưa mọi shipment IN_TRANSIT và bắt đầu chuyến', async () => {
    const tripId = new Types.ObjectId().toString();
    const tripObjectId = new Types.ObjectId(tripId);
    const trip = {
      _id: tripObjectId,
      assignedShipperId: new Types.ObjectId(shipperId),
      status: DeliveryTripStatus.LOADING,
      stops: [{ shipmentId: new Types.ObjectId(shipmentId), routeOrder: 1 }],
    };
    tripRepo.findById.mockResolvedValue(trip);
    shipmentRepo.findManyByIds.mockResolvedValue([
      {
        _id: new Types.ObjectId(shipmentId),
        packages: [{ barcode: packageBarcode, loadedTripId: tripObjectId }],
      },
    ]);
    shipmentService.startForTrip.mockResolvedValue({
      shipmentStatus: ShipmentStatus.IN_TRANSIT,
    });
    tripRepo.transition.mockResolvedValue({
      ...trip,
      status: DeliveryTripStatus.IN_TRANSIT,
    });

    const result = await service.start(tripId, shipperId, WmsRole.SHIPPER);

    expect(shipmentService.startForTrip).toHaveBeenCalledWith(
      shipmentId,
      tripId,
      shipperId,
    );
    expect(result.status).toBe(DeliveryTripStatus.IN_TRANSIT);
  });
});
