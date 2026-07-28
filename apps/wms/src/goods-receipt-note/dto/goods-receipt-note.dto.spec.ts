import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGoodsReceiptNoteItemDto } from './goods-receipt-note.dto';

describe('CreateGoodsReceiptNoteItemDto', () => {
  it('không cho nhận số thùng lẻ', async () => {
    const dto = plainToInstance(CreateGoodsReceiptNoteItemDto, {
      itemId: '507f1f77bcf86cd799439011',
      actualQty: 1.5,
      packageCount: 1.5,
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'packageCount',
          constraints: expect.objectContaining({ isInt: expect.any(String) }),
        }),
      ]),
    );
  });
});
