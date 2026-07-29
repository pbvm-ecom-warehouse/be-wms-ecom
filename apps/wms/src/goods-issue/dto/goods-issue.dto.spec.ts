import { plainToInstance } from 'class-transformer';
import { Types } from 'mongoose';
import { GoodsIssueResponseDto } from './goods-issue.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

describe('GoodsIssueResponseDto business codes', () => {
  it('trả mã phiếu và orderCode trong response list/detail', () => {
    const dto = plainToInstance(
      GoodsIssueResponseDto,
      {
        _id: new Types.ObjectId(),
        goodsIssueNumber: 'GI-20260730-0001',
        orderId: 'internal-order-id',
        orderCode: 'ORD-20260730-0001',
        status: 'PENDING',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      TO_OPTS,
    );

    expect(dto.goodsIssueNumber).toBe('GI-20260730-0001');
    expect(dto.orderCode).toBe('ORD-20260730-0001');
    expect(dto.orderId).toBe('internal-order-id');
  });

  it('trả null rõ ràng cho chứng từ legacy chưa backfill', () => {
    const dto = plainToInstance(
      GoodsIssueResponseDto,
      {
        _id: new Types.ObjectId(),
        orderId: 'legacy-order-id',
        status: 'PENDING',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      TO_OPTS,
    );

    expect(dto.goodsIssueNumber).toBeNull();
    expect(dto.orderCode).toBeNull();
  });
});
