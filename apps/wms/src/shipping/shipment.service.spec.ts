import { Types } from 'mongoose';
import { ShipmentService } from './shipment.service';
import { ShipmentStatus } from './schemas/shipment.schema';
import { CarrierStatus } from './schemas/carrier.schema';
import { EVENTS } from '@app/events';
import { WmsRole } from '@app/auth';
import { createHmac } from 'node:crypto';

const makeRepo = () => ({
  findById: jest.fn(),
  findByIdWithDeliveryOtp: jest.fn(),
  findByGoodsIssueId: jest.fn(),
  createFromGoodsIssue: jest.fn(),
  assignCarrier: jest.fn(),
  appendPackage: jest.fn(),
  markReady: jest.fn(),
  pushStatus: jest.fn(),
  setDeliveryOtp: jest.fn(),
  recordDeliveryOtpFailure: jest.fn(),
  completeDelivery: jest.fn(),
  recordFailedDeliveryAttempt: jest.fn(),
  scanReturnedPackage: jest.fn(),
  findAll: jest.fn(),
});

const makeCarrierService = () => ({
  getById: jest.fn(),
});

const makeQueue = () => ({ add: jest.fn() });
const makeConfig = () => ({
  getOrThrow: jest.fn().mockReturnValue('x'.repeat(32)),
});

const makeCloudinaryService = () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/demo/image/upload/wms/shipment-pod/x.jpg',
    publicId: 'wms/shipment-pod/x',
  }),
});

const makeDocumentNumberService = () => ({
  next: jest.fn((prefix: string) =>
    Promise.resolve(
      prefix === 'SHP' ? 'SHP-20260730-0001' : 'PKG-20260730-0001',
    ),
  ),
});

const makeGoodsIssueRepository = () => ({
  findById: jest.fn(),
});

function fakeImageFile(
  overrides: Partial<{ mimetype: string; size: number; buffer: Buffer }> = {},
) {
  return {
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('fake-image'),
    ...overrides,
  };
}

describe('ShipmentService', () => {
  let svc: ShipmentService;
  let repo: ReturnType<typeof makeRepo>;
  let carrierService: ReturnType<typeof makeCarrierService>;
  let queue: ReturnType<typeof makeQueue>;
  let notificationQueue: ReturnType<typeof makeQueue>;
  let config: ReturnType<typeof makeConfig>;
  let cloudinary: ReturnType<typeof makeCloudinaryService>;
  let documentNumber: ReturnType<typeof makeDocumentNumberService>;
  let goodsIssueRepo: ReturnType<typeof makeGoodsIssueRepository>;
  const actorId = new Types.ObjectId().toString();
  const shipmentId = 'ship1';
  const carrierId = new Types.ObjectId().toString();
  const orderId = 'order-1';

  beforeEach(() => {
    repo = makeRepo();
    carrierService = makeCarrierService();
    queue = makeQueue();
    notificationQueue = makeQueue();
    config = makeConfig();
    cloudinary = makeCloudinaryService();
    documentNumber = makeDocumentNumberService();
    goodsIssueRepo = makeGoodsIssueRepository();
    svc = new ShipmentService(
      repo as never,
      carrierService as never,
      documentNumber as never,
      goodsIssueRepo as never,
      queue as never,
      notificationQueue as never,
      cloudinary as never,
      config as never,
    );
  });

  describe('createPackage', () => {
    const goodsIssueId = new Types.ObjectId();
    const itemId = new Types.ObjectId();
    const packageActorId = new Types.ObjectId().toString();
    const shipment = {
      _id: shipmentId,
      __v: 3,
      goodsIssueId,
      shipmentStatus: ShipmentStatus.PENDING,
      packages: [],
    };
    const goodsIssue = {
      _id: goodsIssueId,
      status: 'CONFIRMED',
      assignedShipperId: new Types.ObjectId(packageActorId),
      items: [{ itemId, sku: 'SKU-1', quantity: 5, remainingQty: 0 }],
    };

    beforeEach(() => {
      repo.findById.mockResolvedValue(shipment);
      goodsIssueRepo.findById.mockResolvedValue(goodsIssue);
    });

    it('append package và chuyển READY khi allocations đã đủ Goods Issue', async () => {
      repo.appendPackage.mockResolvedValue({
        ...shipment,
        packages: [
          {
            barcode: 'PKG-20260730-0001',
            allocations: [{ itemId, sku: 'SKU-1', quantity: 5 }],
          },
        ],
      });
      repo.markReady.mockResolvedValue({
        ...shipment,
        shipmentStatus: ShipmentStatus.READY,
      });

      const result = await svc.createPackage(
        shipmentId,
        { allocations: [{ itemId: itemId.toString(), quantity: 5 }] },
        packageActorId,
        WmsRole.SHIPPER,
      );

      expect(repo.appendPackage).toHaveBeenCalledWith(
        shipmentId,
        3,
        expect.objectContaining({
          barcode: 'PKG-20260730-0001',
          allocations: [{ itemId, sku: 'SKU-1', quantity: 5 }],
        }),
      );
      expect(repo.markReady).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.PENDING,
      );
      expect(result.shipmentStatus).toBe(ShipmentStatus.READY);
    });

    it('chặn allocation vượt số lượng Goods Issue', async () => {
      await expect(
        svc.createPackage(
          shipmentId,
          { allocations: [{ itemId: itemId.toString(), quantity: 6 }] },
          packageActorId,
          WmsRole.SHIPPER,
        ),
      ).rejects.toMatchObject({ code: 'SHIPMENT_PACKAGE_QTY_EXCEEDS' });
      expect(repo.appendPackage).not.toHaveBeenCalled();
    });

    it('chặn Shipper không phải owner đóng kiện', async () => {
      await expect(
        svc.createPackage(
          shipmentId,
          { allocations: [{ itemId: itemId.toString(), quantity: 1 }] },
          new Types.ObjectId().toString(),
          WmsRole.SHIPPER,
        ),
      ).rejects.toMatchObject({ code: 'SHIPMENT_NOT_OWNER' });
    });
  });

  describe('startForTrip', () => {
    it('đưa READY sang IN_TRANSIT và phát shipment.shipped đúng một jobId', async () => {
      const tripId = new Types.ObjectId().toString();
      const shipperId = new Types.ObjectId().toString();
      repo.findById.mockResolvedValue({
        _id: shipmentId,
        orderId,
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.READY,
        packages: [
          {
            barcode: 'PKG-1',
            loadedTripId: new Types.ObjectId(tripId),
          },
        ],
      });
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        orderId,
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
        packages: [],
      });

      const result = await svc.startForTrip(shipmentId, tripId, shipperId);

      expect(repo.pushStatus).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.READY,
        expect.objectContaining({
          shipmentStatus: ShipmentStatus.IN_TRANSIT,
          extra: { shippedAt: expect.any(Date) },
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.SHIPMENT_SHIPPED,
        expect.objectContaining({ orderId, shipmentId }),
        { jobId: `${EVENTS.SHIPMENT_SHIPPED}:${shipmentId}` },
      );
      expect(result.shipmentStatus).toBe(ShipmentStatus.IN_TRANSIT);
    });

    it('chặn khi còn package chưa scan lên trip', async () => {
      const tripId = new Types.ObjectId().toString();
      const shipperId = new Types.ObjectId().toString();
      repo.findById.mockResolvedValue({
        _id: shipmentId,
        orderId,
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.READY,
        packages: [{ barcode: 'PKG-1' }],
      });

      await expect(
        svc.startForTrip(shipmentId, tripId, shipperId),
      ).rejects.toMatchObject({ code: 'DELIVERY_TRIP_PACKAGES_INCOMPLETE' });
      expect(repo.pushStatus).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('last-mile OTP/POD', () => {
    const tripId = new Types.ObjectId().toString();
    const shipperId = new Types.ObjectId().toString();

    it('phát OTP qua notification queue, chỉ lưu hash và không trả plaintext', async () => {
      repo.findByIdWithDeliveryOtp.mockResolvedValue({
        _id: shipmentId,
        orderId,
        recipient: { phone: '0901234567' },
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
      });
      repo.setDeliveryOtp.mockImplementation((_id, _expected, input) =>
        Promise.resolve({
          deliveryOtpExpiresAt: input.expiresAt,
          deliveryOtpLastSentAt: input.sentAt,
        }),
      );

      const result = await svc.requestDeliveryOtp(
        shipmentId,
        tripId,
        shipperId,
      );

      const eventPayload = notificationQueue.add.mock.calls[0][1] as {
        code: string;
      };
      const stored = repo.setDeliveryOtp.mock.calls[0][2] as {
        hash: string;
      };
      expect(eventPayload.code).toMatch(/^\d{6}$/);
      expect(stored.hash).not.toBe(eventPayload.code);
      expect(result).not.toHaveProperty('code');
    });

    it('OTP đúng + POD hợp lệ mới DELIVERED và ghi nhận COD CASH', async () => {
      const code = '123456';
      const salt = 'salt-1';
      const hash = createHmac('sha256', 'x'.repeat(32))
        .update(`${shipmentId}:${salt}:${code}`)
        .digest('hex');
      repo.findByIdWithDeliveryOtp.mockResolvedValue({
        _id: shipmentId,
        orderId,
        recipient: { phone: '0901234567' },
        paymentMethod: 'COD',
        codAmount: 150000,
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
        deliveryOtpHash: hash,
        deliveryOtpSalt: salt,
        deliveryOtpExpiresAt: new Date(Date.now() + 60_000),
        deliveryOtpFailedAttempts: 0,
        packages: [],
      });
      repo.completeDelivery.mockResolvedValue({
        _id: shipmentId,
        orderId,
        shipmentStatus: ShipmentStatus.DELIVERED,
      });

      const result = await svc.deliverForTrip(
        shipmentId,
        tripId,
        shipperId,
        code,
        'CASH',
        [fakeImageFile()],
      );

      expect(cloudinary.uploadImage).toHaveBeenCalledTimes(1);
      expect(repo.completeDelivery).toHaveBeenCalledWith(
        shipmentId,
        new Types.ObjectId(tripId),
        expect.objectContaining({
          codCollectionMethod: 'CASH',
          codCollectedAmount: 150000,
          podImages: [
            'https://res.cloudinary.com/demo/image/upload/wms/shipment-pod/x.jpg',
          ],
        }),
      );
      expect(result.cashCollectedAmount).toBe(150000);
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.SHIPMENT_DELIVERED,
        expect.objectContaining({ orderId, shipmentId }),
        { jobId: `${EVENTS.SHIPMENT_DELIVERED}:${shipmentId}` },
      );
    });

    it('OTP sai tăng bộ đếm và không upload POD', async () => {
      repo.findByIdWithDeliveryOtp.mockResolvedValue({
        _id: shipmentId,
        orderId,
        paymentMethod: 'ONLINE',
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
        deliveryOtpHash: 'not-a-valid-hash',
        deliveryOtpSalt: 'salt',
        deliveryOtpExpiresAt: new Date(Date.now() + 60_000),
        deliveryOtpFailedAttempts: 0,
      });
      repo.recordDeliveryOtpFailure.mockResolvedValue({ _id: shipmentId });

      await expect(
        svc.deliverForTrip(shipmentId, tripId, shipperId, '000000', undefined, [
          fakeImageFile(),
        ]),
      ).rejects.toMatchObject({ code: 'SHIPMENT_DELIVERY_OTP_INVALID' });
      expect(repo.recordDeliveryOtpFailure).toHaveBeenCalled();
      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('OTP sai lần thứ 5 khóa xác nhận giao trong 15 phút', async () => {
      repo.findByIdWithDeliveryOtp.mockResolvedValue({
        _id: shipmentId,
        orderId,
        paymentMethod: 'ONLINE',
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
        deliveryOtpHash: 'not-a-valid-hash',
        deliveryOtpSalt: 'salt',
        deliveryOtpExpiresAt: new Date(Date.now() + 60_000),
        deliveryOtpFailedAttempts: 4,
      });
      repo.recordDeliveryOtpFailure.mockResolvedValue({ _id: shipmentId });

      await expect(
        svc.deliverForTrip(shipmentId, tripId, shipperId, '000000', undefined, [
          fakeImageFile(),
        ]),
      ).rejects.toMatchObject({ code: 'SHIPMENT_DELIVERY_OTP_LOCKED' });
      expect(repo.recordDeliveryOtpFailure).toHaveBeenCalledWith(
        shipmentId,
        new Types.ObjectId(tripId),
        4,
        expect.objectContaining({
          failedAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      );
      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });
  });

  describe('failed delivery and return handoff', () => {
    const tripId = new Types.ObjectId().toString();
    const shipperId = new Types.ObjectId().toString();

    it('lần giao thất bại thứ 3 chuyển shipment sang RETURNING', async () => {
      repo.findById.mockResolvedValue({
        _id: shipmentId,
        orderId,
        attempts: 2,
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
      });
      repo.recordFailedDeliveryAttempt.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.RETURNING,
        attempts: 3,
      });

      await svc.recordFailedAttemptForTrip(
        shipmentId,
        tripId,
        shipperId,
        'Khách không nhận hàng',
      );

      expect(repo.recordFailedDeliveryAttempt).toHaveBeenCalledWith(
        shipmentId,
        new Types.ObjectId(tripId),
        2,
        expect.objectContaining({
          nextAttempts: 3,
          returnToWarehouse: true,
        }),
      );
    });

    it('chặn bàn giao hoàn khi còn kiện chưa quét về kho', async () => {
      repo.findById.mockResolvedValue({
        _id: shipmentId,
        orderId,
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.RETURNING,
        packages: [
          { barcode: 'PKG-1', returnedAt: new Date() },
          { barcode: 'PKG-2' },
        ],
      });

      await expect(
        svc.completeReturnForTrip(shipmentId, tripId, shipperId),
      ).rejects.toMatchObject({
        code: 'SHIPMENT_RETURN_PACKAGES_INCOMPLETE',
      });
      expect(repo.pushStatus).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('quét đủ kiện mới chuyển RETURNED và phát event idempotent', async () => {
      repo.findById.mockResolvedValue({
        _id: shipmentId,
        orderId,
        assignedShipperId: new Types.ObjectId(shipperId),
        activeTripId: new Types.ObjectId(tripId),
        shipmentStatus: ShipmentStatus.RETURNING,
        packages: [
          { barcode: 'PKG-1', returnedAt: new Date() },
          { barcode: 'PKG-2', returnedAt: new Date() },
        ],
      });
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        orderId,
        shipmentStatus: ShipmentStatus.RETURNED,
      });

      await svc.completeReturnForTrip(shipmentId, tripId, shipperId);

      expect(repo.pushStatus).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.RETURNING,
        expect.objectContaining({
          shipmentStatus: ShipmentStatus.RETURNED,
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.SHIPMENT_RETURNED,
        expect.objectContaining({ orderId, shipmentId }),
        { jobId: `${EVENTS.SHIPMENT_RETURNED}:${shipmentId}` },
      );
    });
  });

  describe('createFromGoodsIssue', () => {
    const goodsIssueIdStr = new Types.ObjectId().toString();

    it('bỏ qua nếu đã có Shipment cho goodsIssueId này (idempotent)', async () => {
      repo.findByGoodsIssueId.mockResolvedValue({ _id: shipmentId });
      await svc.createFromGoodsIssue({
        orderId,
        orderCode: 'ORD-20260730-0001',
        goodsIssueId: goodsIssueIdStr,
        recipient: { name: 'A', phone: '090', address: {} },
        paymentMethod: 'COD',
        codAmount: 0,
      });
      expect(repo.createFromGoodsIssue).not.toHaveBeenCalled();
    });

    it('tạo Shipment PENDING khi chưa tồn tại', async () => {
      repo.findByGoodsIssueId.mockResolvedValue(null);
      repo.createFromGoodsIssue.mockResolvedValue({ _id: shipmentId });
      await svc.createFromGoodsIssue({
        orderId,
        orderCode: 'ORD-20260730-0001',
        goodsIssueId: goodsIssueIdStr,
        recipient: { name: 'A', phone: '090', address: {} },
        paymentMethod: 'COD',
        codAmount: 0,
      });
      expect(repo.createFromGoodsIssue).toHaveBeenCalledWith({
        shipmentNumber: 'SHP-20260730-0001',
        orderId,
        orderCode: 'ORD-20260730-0001',
        goodsIssueId: new Types.ObjectId(goodsIssueIdStr),
        recipient: { name: 'A', phone: '090', address: {} },
        paymentMethod: 'COD',
        codAmount: 0,
      });
      expect(documentNumber.next).toHaveBeenCalledWith('SHP');
    });
  });

  describe('assignCarrier', () => {
    it('throw SHIPMENT_NOT_FOUND nếu shipment không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        svc.assignCarrier(shipmentId, carrierId, 'TRACK-1'),
      ).rejects.toMatchObject({ code: 'SHIPMENT_NOT_FOUND' });
    });

    it('throw CARRIER_INACTIVE nếu carrier không ACTIVE', async () => {
      repo.findById.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.PENDING,
      });
      carrierService.getById.mockResolvedValue({
        status: CarrierStatus.INACTIVE,
      });
      await expect(
        svc.assignCarrier(shipmentId, carrierId, 'TRACK-1'),
      ).rejects.toMatchObject({ code: 'CARRIER_INACTIVE' });
    });

    it('gán carrier + trackingNumber khi hợp lệ', async () => {
      repo.findById.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.PENDING,
      });
      carrierService.getById.mockResolvedValue({
        status: CarrierStatus.ACTIVE,
      });
      repo.assignCarrier.mockResolvedValue({ _id: shipmentId, carrierId });
      const result = await svc.assignCarrier(shipmentId, carrierId, 'TRACK-1');
      expect(repo.assignCarrier).toHaveBeenCalledWith(
        shipmentId,
        new Types.ObjectId(carrierId),
        'TRACK-1',
      );
      expect(result).toEqual({ _id: shipmentId, carrierId });
    });
  });

  describe('updateStatus — state machine', () => {
    const baseShipment = (status: ShipmentStatus) => ({
      _id: shipmentId,
      orderId,
      shipmentStatus: status,
      attempts: 0,
      paymentMethod: 'COD',
    });

    it('chặn endpoint legacy với shipment thuộc chuyến nội bộ để không bypass OTP/POD', async () => {
      repo.findById.mockResolvedValue({
        ...baseShipment(ShipmentStatus.IN_TRANSIT),
        activeTripId: new Types.ObjectId(),
      });

      await expect(
        svc.updateStatus(shipmentId, ShipmentStatus.DELIVERED, actorId, {}),
      ).rejects.toMatchObject({ code: 'SHIPMENT_INVALID_TRANSITION' });
      expect(repo.pushStatus).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('throw SHIPMENT_INVALID_TRANSITION cho bước nhảy không hợp lệ (PENDING → DELIVERED)', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.PENDING));
      await expect(
        svc.updateStatus(shipmentId, ShipmentStatus.DELIVERED, actorId, {}),
      ).rejects.toMatchObject({ code: 'SHIPMENT_INVALID_TRANSITION' });
      expect(repo.pushStatus).not.toHaveBeenCalled();
    });

    it('throw SHIPMENT_NOT_ASSIGNED khi PENDING → PICKED_UP mà chưa gán carrierId', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.PENDING));
      await expect(
        svc.updateStatus(shipmentId, ShipmentStatus.PICKED_UP, actorId, {}),
      ).rejects.toMatchObject({ code: 'SHIPMENT_NOT_ASSIGNED' });
      expect(repo.pushStatus).not.toHaveBeenCalled();
    });

    it('PENDING → PICKED_UP: ghi statusHistory, không phát event (đã gán carrierId)', async () => {
      repo.findById.mockResolvedValue({
        ...baseShipment(ShipmentStatus.PENDING),
        carrierId,
      });
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.PICKED_UP,
      });
      await svc.updateStatus(shipmentId, ShipmentStatus.PICKED_UP, actorId, {});
      expect(repo.pushStatus).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.PENDING,
        expect.objectContaining({ shipmentStatus: ShipmentStatus.PICKED_UP }),
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('PICKED_UP → IN_TRANSIT: ghi shippedAt, phát shipment.shipped', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.PICKED_UP));
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
      });
      await svc.updateStatus(
        shipmentId,
        ShipmentStatus.IN_TRANSIT,
        actorId,
        {},
      );
      expect(repo.pushStatus).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.PICKED_UP,
        expect.objectContaining({
          shipmentStatus: ShipmentStatus.IN_TRANSIT,
          extra: expect.objectContaining({ shippedAt: expect.any(Date) }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.SHIPMENT_SHIPPED,
        { orderId, shipmentId },
        expect.anything(),
      );
    });

    it('FAILED → IN_TRANSIT (retry): KHÔNG phát lại shipment.shipped', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.FAILED));
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
      });
      await svc.updateStatus(
        shipmentId,
        ShipmentStatus.IN_TRANSIT,
        actorId,
        {},
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('IN_TRANSIT → DELIVERED: ghi deliveredAt, phát shipment.delivered', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.IN_TRANSIT));
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.DELIVERED,
      });
      await svc.updateStatus(shipmentId, ShipmentStatus.DELIVERED, actorId, {});
      expect(repo.pushStatus).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.IN_TRANSIT,
        expect.objectContaining({
          shipmentStatus: ShipmentStatus.DELIVERED,
          extra: expect.objectContaining({ deliveredAt: expect.any(Date) }),
          historyEntry: expect.objectContaining({ images: [] }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.SHIPMENT_DELIVERED,
        { orderId, shipmentId },
        expect.anything(),
      );
    });

    it('DELIVERED không có ảnh POD → images rỗng, không gọi CloudinaryService', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.IN_TRANSIT));
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.DELIVERED,
      });
      await svc.updateStatus(shipmentId, ShipmentStatus.DELIVERED, actorId, {});
      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('DELIVERED kèm ảnh POD → upload Cloudinary vào wms/shipment-pod, lưu URL vào historyEntry', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.IN_TRANSIT));
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.DELIVERED,
      });

      await svc.updateStatus(
        shipmentId,
        ShipmentStatus.DELIVERED,
        actorId,
        {},
        [fakeImageFile()],
      );

      expect(cloudinary.uploadImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        'wms/shipment-pod',
      );
      expect(repo.pushStatus).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.IN_TRANSIT,
        expect.objectContaining({
          historyEntry: expect.objectContaining({
            images: [
              'https://res.cloudinary.com/demo/image/upload/wms/shipment-pod/x.jpg',
            ],
          }),
        }),
      );
    });

    it('ảnh POD sai mimetype → throw VALIDATION_FAILED, không gọi pushStatus', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.IN_TRANSIT));

      await expect(
        svc.updateStatus(shipmentId, ShipmentStatus.DELIVERED, actorId, {}, [
          fakeImageFile({ mimetype: 'application/pdf' }),
        ]),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(repo.pushStatus).not.toHaveBeenCalled();
    });

    it('ảnh POD vượt quá 5MB → throw VALIDATION_FAILED, không gọi pushStatus', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.IN_TRANSIT));

      await expect(
        svc.updateStatus(shipmentId, ShipmentStatus.DELIVERED, actorId, {}, [
          fakeImageFile({ size: 6 * 1024 * 1024 }),
        ]),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(repo.pushStatus).not.toHaveBeenCalled();
    });

    it('gửi ảnh kèm status khác DELIVERED (vd IN_TRANSIT) → bỏ qua âm thầm, không gọi CloudinaryService', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.PICKED_UP));
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.IN_TRANSIT,
      });

      await svc.updateStatus(
        shipmentId,
        ShipmentStatus.IN_TRANSIT,
        actorId,
        {},
        [fakeImageFile()],
      );

      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
      expect(repo.pushStatus).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.PICKED_UP,
        expect.objectContaining({
          historyEntry: expect.objectContaining({ images: [] }),
        }),
      );
    });

    it('IN_TRANSIT → FAILED: attempts += 1, ghi failReason, không phát event', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.IN_TRANSIT));
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.FAILED,
        attempts: 1,
      });
      await svc.updateStatus(shipmentId, ShipmentStatus.FAILED, actorId, {
        failReason: 'Khách vắng nhà',
      });
      expect(repo.pushStatus).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.IN_TRANSIT,
        expect.objectContaining({
          shipmentStatus: ShipmentStatus.FAILED,
          extra: expect.objectContaining({
            attempts: 1,
            failReason: 'Khách vắng nhà',
          }),
        }),
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('FAILED → RETURNING: ghi statusHistory, chưa phát event (hàng chưa về kho)', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.FAILED));
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.RETURNING,
      });
      await svc.updateStatus(shipmentId, ShipmentStatus.RETURNING, actorId, {});
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('RETURNING → RETURNED: phát shipment.returned', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.RETURNING));
      repo.pushStatus.mockResolvedValue({
        _id: shipmentId,
        shipmentStatus: ShipmentStatus.RETURNED,
      });
      await svc.updateStatus(shipmentId, ShipmentStatus.RETURNED, actorId, {});
      expect(queue.add).toHaveBeenCalledWith(
        EVENTS.SHIPMENT_RETURNED,
        { orderId, shipmentId },
        expect.anything(),
      );
    });

    it('throw SHIPMENT_INVALID_TRANSITION từ trạng thái terminal (DELIVERED → bất kỳ)', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.DELIVERED));
      await expect(
        svc.updateStatus(shipmentId, ShipmentStatus.RETURNING, actorId, {}),
      ).rejects.toMatchObject({ code: 'SHIPMENT_INVALID_TRANSITION' });
    });

    it('throw SHIPMENT_INVALID_TRANSITION khi pushStatus trả null do compare-and-swap mất race (shipment đã đổi trạng thái ở nơi khác)', async () => {
      repo.findById.mockResolvedValue(baseShipment(ShipmentStatus.IN_TRANSIT));
      repo.pushStatus.mockResolvedValue(null);
      await expect(
        svc.updateStatus(shipmentId, ShipmentStatus.DELIVERED, actorId, {}),
      ).rejects.toMatchObject({ code: 'SHIPMENT_INVALID_TRANSITION' });
      expect(repo.pushStatus).toHaveBeenCalledWith(
        shipmentId,
        ShipmentStatus.IN_TRANSIT,
        expect.objectContaining({ shipmentStatus: ShipmentStatus.DELIVERED }),
      );
    });
  });

  describe('getById', () => {
    it('throw SHIPMENT_NOT_FOUND khi không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.getById(shipmentId)).rejects.toMatchObject({
        code: 'SHIPMENT_NOT_FOUND',
      });
    });
  });

  describe('list', () => {
    it('ủy quyền cho repo.findAll', async () => {
      repo.findAll.mockResolvedValue({ data: [], total: 0 });
      const result = await svc.list({});
      expect(repo.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual({ data: [], total: 0 });
    });
  });
});
