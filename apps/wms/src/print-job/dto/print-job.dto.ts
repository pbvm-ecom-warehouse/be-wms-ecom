import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Types } from 'mongoose';
import {
  PrintJobLineStatus,
  PrintJobStatus,
} from '../schemas/print-job.schema';

export class ConsumePrintJobItemDto {
  @ApiProperty({
    example: 'CUP-BLANK-500',
    description: 'Barcode quét SKU CUP_BLANK',
  })
  @IsString()
  @MinLength(1)
  itemBarcode!: string;

  @ApiProperty({
    example: 'A1-2',
    description: 'Barcode quét vị trí shelf lấy CUP_BLANK',
  })
  @IsString()
  @MinLength(1)
  shelfCode!: string;

  @ApiProperty({ example: 20, description: 'Số lượng CUP_BLANK tiêu thụ' })
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CompletePrintJobItemDto {
  @ApiProperty({
    example: 'A1-2',
    description: 'Barcode quét vị trí shelf nhập CUP_PRINTED',
  })
  @IsString()
  @MinLength(1)
  shelfCode!: string;

  @ApiProperty({
    example: 20,
    description:
      'Số lượng CUP_PRINTED nhập kho — phải bằng đúng reservedQty của dòng',
  })
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/.../proof.png',
    description: 'Ảnh chụp sản phẩm thực tế đã in thành công (Dành cho in mẫu)',
  })
  @IsString()
  @IsOptional()
  proofImage?: string;
}

export class QueryPrintJobDto {
  @ApiPropertyOptional({ enum: PrintJobStatus })
  @IsOptional()
  @IsEnum(PrintJobStatus)
  status?: PrintJobStatus;

  @ApiPropertyOptional({ description: 'Lọc lệnh in mẫu (true) hoặc chính thức (false)' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : undefined)
  isSample?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PrintJobItemResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { inputItemId?: Types.ObjectId } }) =>
    obj.inputItemId?.toString(),
  )
  @ApiProperty()
  inputItemId!: string;

  @Expose()
  @Transform(({ obj }: { obj: { outputItemId?: Types.ObjectId } }) =>
    obj.outputItemId?.toString(),
  )
  @ApiProperty()
  outputItemId!: string;

  @Expose()
  @ApiProperty()
  sku!: string;

  @Expose()
  @ApiPropertyOptional()
  designFile?: string;

  @Expose()
  @ApiProperty()
  quantity!: number;

  @Expose()
  @ApiProperty()
  reservedQty!: number;

  @Expose()
  @ApiProperty()
  remainingQty!: number;

  @Expose()
  @ApiProperty({ enum: PrintJobLineStatus })
  lineStatus!: PrintJobLineStatus;
}

export class PrintJobResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  orderId!: string;

  /**
   * True nếu đây là lệnh in BẢN MẪU (orderId kết thúc bằng "-sample").
   * Được lưu trực tiếp trong DB — thợ in dùng trường này để phân biệt mục đích lệnh in.
   */
  @Expose()
  @ApiProperty({ description: 'true = in bản mẫu, false = in chính thức' })
  isSample!: boolean;

  @Expose()
  @ApiProperty({ enum: PrintJobStatus })
  status!: PrintJobStatus;

  @Expose()
  @Transform(({ obj }: { obj: { confirmedBy?: Types.ObjectId } }) =>
    obj.confirmedBy ? obj.confirmedBy.toString() : null,
  )
  @ApiPropertyOptional()
  confirmedBy!: string | null;

  @Expose()
  @Type(() => PrintJobItemResponseDto)
  @ApiProperty({ type: [PrintJobItemResponseDto] })
  items!: PrintJobItemResponseDto[];

  @Expose()
  @ApiPropertyOptional({ type: Object, description: 'Chi tiết đơn hàng gốc từ Ecom' })
  orderDetail?: Record<string, any>;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
