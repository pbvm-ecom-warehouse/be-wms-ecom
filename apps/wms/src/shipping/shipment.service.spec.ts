import { Types } from 'mongoose';
import { ShipmentService } from './shipment.service';
import { ShipmentStatus } from './schemas/shipment.schema';
import { CarrierStatus } from './schemas/carrier.schema';
import { EVENTS } from '@app/events';

const makeRepo = () => ({
  findById: jest.fn(),
  findByGoodsIssueId: jest.fn(),
  createFromGoodsIssue: jest.fn(),
  assignCarrier: jest.fn(),
  pushStatus: jest.fn(),
  findAll: jest.fn(),
});

const makeCarrierService = () => ({
  getById: jest.fn(),
});

const makeQueue = () => ({ add: jest.fn() });

const makeCloudinaryService = () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/demo/image/upload/wms/shipment-pod/x.jpg',
    publicId: 'wms/shipment-pod/x',
  }),
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
  let cloudinary: ReturnType<typeof makeCloudinaryService>;
  const actorId = new Types.ObjectId().toString();
  const shipmentId = 'ship1';
  const carrierId = new Types.ObjectId().toString();
  const orderId = 'order-1';

  beforeEach(() => {
    repo = makeRepo();
    carrierService = makeCarrierService();
    queue = makeQueue();
    cloudinary = makeCloudinaryService();
    svc = new ShipmentService(
      repo as never,
      carrierService as never,
      queue as never,
      cloudinary as never,
    );
  });

  describe('createFromGoodsIssue', () => {
    const goodsIssueIdStr = new Types.ObjectId().toString();

    it('bỏ qua nếu đã có Shipment cho goodsIssueId này (idempotent)', async () => {
      repo.findByGoodsIssueId.mockResolvedValue({ _id: shipmentId });
      await svc.createFromGoodsIssue({
        orderId,
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
        goodsIssueId: goodsIssueIdStr,
        recipient: { name: 'A', phone: '090', address: {} },
        paymentMethod: 'COD',
        codAmount: 0,
      });
      expect(repo.createFromGoodsIssue).toHaveBeenCalledWith({
        orderId,
        goodsIssueId: new Types.ObjectId(goodsIssueIdStr),
        recipient: { name: 'A', phone: '090', address: {} },
        paymentMethod: 'COD',
        codAmount: 0,
      });
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
