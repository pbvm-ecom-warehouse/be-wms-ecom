import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PaymentUrlResponseDto {
  @Expose()
  @ApiProperty({
    example:
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=...',
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

export class VnpayIpnResponseDto {
  @Expose()
  @ApiProperty({ example: '00' })
  RspCode!: string;

  @Expose()
  @ApiProperty({ example: 'Confirm success' })
  Message!: string;
}
