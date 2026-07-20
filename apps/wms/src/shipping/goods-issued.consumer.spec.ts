import { GoodsIssuedConsumer } from './goods-issued.consumer';
import { EVENTS } from '@app/events';

describe('GoodsIssuedConsumer', () => {
  let consumer: GoodsIssuedConsumer;
  let shipmentService: { createFromGoodsIssue: jest.Mock };
  let goodsIssueRepo: { findById: jest.Mock };

  beforeEach(() => {
    shipmentService = { createFromGoodsIssue: jest.fn() };
    goodsIssueRepo = { findById: jest.fn() };
    consumer = new GoodsIssuedConsumer(
      shipmentService as never,
      goodsIssueRepo as never,
    );
  });

  it('tạo Shipment từ snapshot GoodsIssue khi nhận goods.issued', async () => {
    goodsIssueRepo.findById.mockResolvedValue({
      _id: 'gi1',
      orderId: 'order-1',
      warehouseId: 'wh1',
      shippingAddress: { street: '123' },
      recipient: { name: 'A', phone: '090' },
      paymentMethod: 'COD',
      codAmount: 0,
    });
    const job = {
      name: EVENTS.GOODS_ISSUED,
      data: { orderId: 'order-1', goodsIssueId: 'gi1' },
    } as never;

    await consumer.process(job);

    expect(shipmentService.createFromGoodsIssue).toHaveBeenCalledWith({
      orderId: 'order-1',
      goodsIssueId: 'gi1',
      fulfillWarehouseId: 'wh1',
      recipient: { name: 'A', phone: '090', address: { street: '123' } },
      paymentMethod: 'COD',
      codAmount: 0,
    });
  });

  it('bỏ qua nếu không tìm thấy GoodsIssue (log warning, không throw)', async () => {
    goodsIssueRepo.findById.mockResolvedValue(null);
    const job = {
      name: EVENTS.GOODS_ISSUED,
      data: { orderId: 'order-1', goodsIssueId: 'gi1' },
    } as never;

    await consumer.process(job);

    expect(shipmentService.createFromGoodsIssue).not.toHaveBeenCalled();
  });

  it('bỏ qua job không phải goods.issued', async () => {
    const job = { name: 'some.other.event', data: {} } as never;
    await consumer.process(job);
    expect(shipmentService.createFromGoodsIssue).not.toHaveBeenCalled();
  });
});
