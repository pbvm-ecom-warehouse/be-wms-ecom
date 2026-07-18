import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PaymentUrlResponseDto {
  @Expose()
  @ApiProperty({
    example: 'https://checkout.payos.vn/pay/...',
  })
  payUrl!: string;
}

export class PaymentReturnResponseDto {
  @Expose()
  @ApiProperty({ example: true })
  success!: boolean;

  @Expose()
  @ApiProperty({ example: 'ORD-20260626-001' })
  orderCode!: string;

  @Expose()
  @ApiProperty({ example: 'Thanh toán đơn hàng thành công' })
  message!: string;
}

export class PayosWebhookResponseDto {
  @Expose()
  @ApiProperty({ example: true })
  success!: boolean;
}
