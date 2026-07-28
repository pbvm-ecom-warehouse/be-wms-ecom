import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePurchaseOrderItemDto } from './purchase-order.dto';

describe('CreatePurchaseOrderItemDto', () => {
  it('không cho đặt số thùng lẻ', async () => {
    const dto = plainToInstance(CreatePurchaseOrderItemDto, {
      itemId: '507f1f77bcf86cd799439011',
      expectedQty: 1.5,
      unit: 'thùng',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'expectedQty',
          constraints: expect.objectContaining({ isInt: expect.any(String) }),
        }),
      ]),
    );
  });
});
