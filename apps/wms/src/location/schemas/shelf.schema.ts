import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'shelves', timestamps: true })
export class Shelf {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  rackId!: Types.ObjectId;

  @Prop({ required: true })
  level!: number;

  /** Giá trị barcode vị trí — dán tem ở mỗi shelf, quét khi put-away/pick */
  @Prop({ required: true })
  code!: string;

  @Prop()
  innerDepth?: number;

  @Prop()
  innerWidth?: number;

  @Prop()
  innerHeight?: number;

  /** Override fill factor mặc định hệ thống (0–1). null = dùng mặc định */
  @Prop({ type: Number, default: null })
  fillFactor?: number | null;

  /** true = shelf "khu nhận hàng" (staging), nơi hàng nằm tạm sau GRN */
  @Prop({ default: false })
  isStaging!: boolean;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type ShelfDocument = HydratedDocument<Shelf>;
export const ShelfSchema = SchemaFactory.createForClass(Shelf);
ShelfSchema.index({ rackId: 1, deletedAt: 1 });
// code là barcode vị trí — unique toàn hệ thống khi chưa xoá
ShelfSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// App = 1 kho duy nhất → tối đa 1 staging shelf toàn hệ thống (trước đây chỉ
// là quy ước ngầm scoped theo warehouseId, giờ siết thành ràng buộc DB thật).
ShelfSchema.index(
  { isStaging: 1 },
  {
    unique: true,
    partialFilterExpression: { isStaging: true, deletedAt: null },
  },
);
