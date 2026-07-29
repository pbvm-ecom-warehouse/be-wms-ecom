import { Types } from 'mongoose';
import { ShipmentRepository } from './shipment.repository';
import { ShipmentStatus } from './schemas/shipment.schema';

describe('ShipmentRepository', () => {
  it('upsert theo goodsIssueId để event đồng thời không tạo vận đơn hoặc đổi mã', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: 'shipment-1' });
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({ exec }),
    };
    const repo = new ShipmentRepository(model as never);
    const goodsIssueId = new Types.ObjectId();
    const recipient = { name: 'A', phone: '090', address: { line: '1' } };

    await repo.createFromGoodsIssue({
      shipmentNumber: 'SHP-20260730-0001',
      orderId: 'order-id',
      orderCode: 'ORD-20260730-0001',
      goodsIssueId,
      recipient,
      paymentMethod: 'COD',
      codAmount: 100000,
    });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { goodsIssueId },
      {
        $setOnInsert: {
          shipmentNumber: 'SHP-20260730-0001',
          orderId: 'order-id',
          orderCode: 'ORD-20260730-0001',
          goodsIssueId,
          shipmentStatus: ShipmentStatus.PENDING,
          recipient,
          paymentMethod: 'COD',
          codAmount: 100000,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
