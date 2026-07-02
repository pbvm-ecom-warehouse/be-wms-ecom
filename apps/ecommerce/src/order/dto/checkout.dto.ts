import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PaymentMethod } from '../schemas/order.schema';

export class CheckoutDto {
  @ApiProperty({
    example: '64abc...',
    description:
      'ObjectId của địa chỉ giao hàng trong sổ địa chỉ của khách hàng',
  })
  @IsString()
  @IsNotEmpty()
  addressId: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.COD })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
