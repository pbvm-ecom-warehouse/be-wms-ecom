import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Snapshot quy cách thùng dùng trong chứng từ nhập/xuất nguyên thùng.
 * Đây là sub-document, không phải master data: sửa WarehouseItem/PO sau này
 * không được làm đổi lại GRN/PutAwayTask đã phát sinh.
 */
@Schema({ _id: false })
export class PackageSpec {
  @Prop({ required: true })
  unit!: string;

  @Prop({ type: Number, required: true, min: 1 })
  factor!: number;

  @Prop({ type: Number, required: true, min: 1 })
  depthCm!: number;

  @Prop({ type: Number, required: true, min: 1 })
  widthCm!: number;

  @Prop({ type: Number, required: true, min: 1 })
  heightCm!: number;

  @Prop({ type: Number, required: true, min: 1 })
  volumeCm3!: number;
}

export const PackageSpecSchema = SchemaFactory.createForClass(PackageSpec);
