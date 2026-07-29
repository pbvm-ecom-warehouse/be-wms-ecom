import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsInt, IsNumber, Min } from 'class-validator';

export class UpdateRackTemplateDto {
  @ApiProperty({ example: 10, description: 'Chiều rộng chuẩn mọi rack (mét)' })
  @IsNumber()
  @Min(0.1)
  widthM!: number;

  @ApiProperty({ example: 1.5, description: 'Chiều sâu chuẩn mọi rack (mét)' })
  @IsNumber()
  @Min(0.1)
  depthM!: number;

  @ApiProperty({
    example: 3,
    description: 'Tổng chiều cao chuẩn của mọi rack (mét)',
  })
  @IsNumber()
  @Min(0.1)
  heightM!: number;

  @ApiProperty({ example: 3, description: 'Số tầng chuẩn mọi rack' })
  @IsInt()
  @Min(1)
  levelCount!: number;

  @ApiProperty({ example: 3, description: 'Số khoang chuẩn mọi rack' })
  @IsInt()
  @Min(1)
  bayCount!: number;
}

export class RackTemplateResponseDto {
  @Expose()
  @ApiProperty()
  widthM!: number;

  @Expose()
  @ApiProperty()
  depthM!: number;

  @Expose()
  @ApiProperty()
  heightM!: number;

  @Expose()
  @ApiProperty()
  levelCount!: number;

  @Expose()
  @ApiProperty()
  bayCount!: number;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
