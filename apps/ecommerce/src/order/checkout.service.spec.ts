import { Types } from 'mongoose';
import { EVENTS } from '@app/events';
import { CheckoutService } from './checkout.service';
import { FulfillmentType } from '../catalog/schemas/product-variant.schema';
import { PaymentMethod } from './schemas/order.schema';

const makeCartService = () => ({
  getCart: jest.fn(),
  removeItems: jest.fn(),
  clearCart: jest.fn(),
});

const makeOrderRepo = () => ({
  generateOrderCode: jest.fn(),
  createOrder: jest.fn(),
});

const makeUserRepo = () => ({
  findActiveById: jest.fn(),
});

const makeQueue = () => ({
  add: jest.fn(),
});

describe('CheckoutService print item snapshots', () => {
  it('lưu line id ổn định và blankSku từ SKU CUSTOM_PRINT do server tra catalog', async () => {
    const customerId = new Types.ObjectId().toString();
    const addressId = new Types.ObjectId();
    const cartService = makeCartService();
    const orderRepo = makeOrderRepo();
    const userRepo = makeUserRepo();
    const orderQueue = makeQueue();
    const catalogService = {
      findVariantBySku: jest.fn().mockResolvedValue({
        sku: 'CUP-HRT-PET-500-CLR',
        price: 3800000,
        isActive: true,
        fulfillmentType: FulfillmentType.CUSTOM_PRINT,
      }),
      findDesign: jest.fn().mockResolvedValue({
        file: 'https://cdn.example.com/design.png',
      }),
    };

    orderRepo.generateOrderCode.mockResolvedValue('ORD-20260730-001');
    orderRepo.createOrder.mockImplementation((data) =>
      Promise.resolve({
        _id: new Types.ObjectId(),
        ...data,
      }),
    );
    userRepo.findActiveById.mockResolvedValue({
      addresses: [
        {
          _id: addressId,
          recipientName: 'Khách hàng',
          phone: '0900000000',
          line: '1 Đường A',
          ward: 'Phường A',
          district: 'Quận A',
          province: 'TP.HCM',
        },
      ],
    });

    const service = new CheckoutService(
      cartService as never,
      orderRepo as never,
      userRepo as never,
      { get: jest.fn().mockReturnValue('30') } as never,
      orderQueue as never,
      {} as never,
      catalogService as never,
    );

    await service.checkout(customerId, {
      addressId: addressId.toString(),
      paymentMethod: PaymentMethod.ONLINE,
      directItem: {
        sku: 'CUP-HRT-PET-500-CLR',
        quantity: 5,
        designFile: 'https://cdn.example.com/design.png',
        designId: new Types.ObjectId().toString(),
      },
    });

    const createPayload = orderRepo.createOrder.mock.calls[0][0];
    expect(createPayload.items).toHaveLength(1);
    expect(createPayload.items[0]).toEqual(
      expect.objectContaining({
        orderItemId: expect.stringMatching(/^[a-f\d]{24}$/i),
        sku: 'CUP-HRT-PET-500-CLR',
        blankSku: 'CUP-HRT-PET-500-CLR',
        isPrintItem: true,
        designFile: 'https://cdn.example.com/design.png',
      }),
    );
    expect(orderQueue.add).not.toHaveBeenCalledWith(
      EVENTS.STOCK_RESERVE_REQUESTED,
      expect.anything(),
    );
  });

  it('từ chối CUSTOM_PRINT thiếu design trước khi tạo order/thanh toán', async () => {
    const customerId = new Types.ObjectId().toString();
    const orderRepo = makeOrderRepo();
    const service = new CheckoutService(
      makeCartService() as never,
      orderRepo as never,
      makeUserRepo() as never,
      { get: jest.fn().mockReturnValue('30') } as never,
      makeQueue() as never,
      {} as never,
      {
        findVariantBySku: jest.fn().mockResolvedValue({
          sku: 'CUP-HRT-PET-500-CLR',
          price: 3800000,
          isActive: true,
          fulfillmentType: FulfillmentType.CUSTOM_PRINT,
        }),
      } as never,
    );

    await expect(
      service.checkout(customerId, {
        addressId: new Types.ObjectId().toString(),
        paymentMethod: PaymentMethod.ONLINE,
        directItem: {
          sku: 'CUP-HRT-PET-500-CLR',
          quantity: 5,
        },
      }),
    ).rejects.toMatchObject({ code: 'CART_PRINT_ITEM_REQUIRES_DESIGN' });

    expect(orderRepo.createOrder).not.toHaveBeenCalled();
  });

  it('vẫn phát stock.reserve_requested cho sản phẩm STANDARD', async () => {
    const customerId = new Types.ObjectId().toString();
    const addressId = new Types.ObjectId();
    const orderRepo = makeOrderRepo();
    const userRepo = makeUserRepo();
    const orderQueue = makeQueue();
    orderRepo.generateOrderCode.mockResolvedValue('ORD-20260730-002');
    orderRepo.createOrder.mockImplementation((data) =>
      Promise.resolve({ _id: new Types.ObjectId(), ...data }),
    );
    userRepo.findActiveById.mockResolvedValue({
      addresses: [
        {
          _id: addressId,
          recipientName: 'Khách hàng',
          phone: '0900000000',
          line: '1 Đường A',
          ward: 'Phường A',
          district: 'Quận A',
          province: 'TP.HCM',
        },
      ],
    });
    const service = new CheckoutService(
      makeCartService() as never,
      orderRepo as never,
      userRepo as never,
      { get: jest.fn().mockReturnValue('30') } as never,
      orderQueue as never,
      {} as never,
      {
        findVariantBySku: jest.fn().mockResolvedValue({
          sku: 'MAT-SUGAR-WHITE-1KG',
          price: 50000,
          isActive: true,
          fulfillmentType: FulfillmentType.STANDARD,
        }),
      } as never,
    );

    await service.checkout(customerId, {
      addressId: addressId.toString(),
      paymentMethod: PaymentMethod.ONLINE,
      directItem: { sku: 'MAT-SUGAR-WHITE-1KG', quantity: 2 },
    });

    expect(orderQueue.add).toHaveBeenCalledWith(
      EVENTS.STOCK_RESERVE_REQUESTED,
      expect.objectContaining({
        items: [{ sku: 'MAT-SUGAR-WHITE-1KG', quantity: 2 }],
      }),
    );
  });

  it('không cho dữ liệu design từ client biến variant STANDARD thành hàng in', async () => {
    const customerId = new Types.ObjectId().toString();
    const orderRepo = makeOrderRepo();
    const catalogService = {
      findVariantBySku: jest.fn().mockResolvedValue({
        sku: 'MAT-SUGAR-WHITE-1KG',
        price: 50000,
        isActive: true,
        fulfillmentType: FulfillmentType.STANDARD,
      }),
      findDesign: jest.fn(),
    };
    const service = new CheckoutService(
      makeCartService() as never,
      orderRepo as never,
      makeUserRepo() as never,
      { get: jest.fn().mockReturnValue('30') } as never,
      makeQueue() as never,
      {} as never,
      catalogService as never,
    );

    await expect(
      service.checkout(customerId, {
        addressId: new Types.ObjectId().toString(),
        paymentMethod: PaymentMethod.ONLINE,
        directItem: {
          sku: 'MAT-SUGAR-WHITE-1KG',
          quantity: 1,
          designFile: 'https://attacker.example.com/not-a-print-design.png',
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(catalogService.findDesign).not.toHaveBeenCalled();
    expect(orderRepo.createOrder).not.toHaveBeenCalled();
  });
});
