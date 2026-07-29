import { DeliveryTripSchema, DeliveryTripStatus } from './delivery-trip.schema';

describe('DeliveryTripSchema', () => {
  it('khai báo đủ state machine của chuyến giao nội bộ', () => {
    expect(Object.values(DeliveryTripStatus)).toEqual([
      'DRAFT',
      'READY',
      'LOADING',
      'IN_TRANSIT',
      'PAUSED',
      'AWAITING_SETTLEMENT',
      'COMPLETED',
      'CANCELLED',
    ]);
  });

  it('unique tripNumber và index owner/status', () => {
    const indexes = DeliveryTripSchema.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ tripNumber: 1 }, expect.objectContaining({ unique: true })],
        [{ assignedShipperId: 1, status: 1 }, expect.any(Object)],
      ]),
    );
  });
});
