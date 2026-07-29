import { Types } from 'mongoose';
import {
  DeliveryTripRepository,
  type CreateDeliveryTripInput,
} from './delivery-trip.repository';
import { DeliveryTripStatus } from './schemas/delivery-trip.schema';

describe('DeliveryTripRepository', () => {
  it('tạo chuyến với id đã giữ trước để khóa shipment cùng tripId', async () => {
    const created = { _id: new Types.ObjectId() };
    const model = { create: jest.fn().mockResolvedValue(created) };
    const repo = new DeliveryTripRepository(model as never);
    const input: CreateDeliveryTripInput = {
      id: new Types.ObjectId(),
      tripNumber: 'TRIP-20260730-0001',
      assignedShipperId: new Types.ObjectId(),
      stops: [
        { shipmentId: new Types.ObjectId(), routeOrder: 1 },
        { shipmentId: new Types.ObjectId(), routeOrder: 2 },
      ],
      createdBy: new Types.ObjectId(),
      now: new Date(),
    };

    await expect(repo.create(input)).resolves.toBe(created);
    expect(model.create).toHaveBeenCalledWith({
      _id: input.id,
      tripNumber: input.tripNumber,
      assignedShipperId: input.assignedShipperId,
      stops: input.stops,
      status: DeliveryTripStatus.DRAFT,
      statusHistory: [
        {
          status: DeliveryTripStatus.DRAFT,
          at: input.now,
          by: input.createdBy,
          note: 'Tạo chuyến giao hàng',
        },
      ],
    });
  });

  it('đổi trạng thái bằng compare-and-swap và append lịch sử', async () => {
    const exec = jest.fn().mockResolvedValue({ status: 'READY' });
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({ exec }),
    };
    const repo = new DeliveryTripRepository(model as never);
    const by = new Types.ObjectId();
    const at = new Date();

    await repo.transition(
      'trip-1',
      [DeliveryTripStatus.DRAFT],
      DeliveryTripStatus.READY,
      { by, at, note: 'Đã chốt lộ trình' },
    );

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'trip-1',
        status: { $in: [DeliveryTripStatus.DRAFT] },
      },
      {
        $set: { status: DeliveryTripStatus.READY },
        $push: {
          statusHistory: {
            status: DeliveryTripStatus.READY,
            at,
            by,
            note: 'Đã chốt lộ trình',
          },
        },
      },
      { new: true },
    );
  });
});
