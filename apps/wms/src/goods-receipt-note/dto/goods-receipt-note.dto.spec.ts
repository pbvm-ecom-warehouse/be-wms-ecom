import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateGoodsReceiptNoteDto,
  CreateGoodsReceiptNoteItemDto,
} from './goods-receipt-note.dto';

describe('CreateGoodsReceiptNoteItemDto', () => {
  it('không cho nhận số thùng lẻ', async () => {
    const dto = plainToInstance(CreateGoodsReceiptNoteItemDto, {
      itemId: '507f1f77bcf86cd799439011',
      actualQty: 1.5,
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'actualQty',
          constraints: expect.objectContaining({ isInt: expect.any(String) }),
        }),
      ]),
    );
  });
});

describe('CreateGoodsReceiptNoteDto multipart', () => {
  it('parse items JSON string trước khi validate', async () => {
    const dto = plainToInstance(CreateGoodsReceiptNoteDto, {
      purchaseOrderId: '507f1f77bcf86cd799439011',
      items: JSON.stringify([
        {
          itemId: '507f191e810c19729de860ea',
          actualQty: 2,
          manufacturedDate: '2026-07-28',
        },
      ]),
    });

    const errors = await validate(dto);

    expect(errors).toEqual([]);
    expect(dto.items).toEqual([
      expect.objectContaining({
        itemId: '507f191e810c19729de860ea',
        actualQty: 2,
        manufacturedDate: '2026-07-28',
      }),
    ]);
  });
});
