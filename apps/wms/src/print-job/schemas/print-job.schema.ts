import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PrintStage } from '@app/events';
import { HydratedDocument, Types } from 'mongoose';

export enum PrintJobStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PrintJobLineStatus {
  PENDING = 'PENDING',
  CONSUMED = 'CONSUMED',
  COMPLETED = 'COMPLETED',
}

/** Sub-document: 1 dòng in (1 design). Không audit riêng — kế thừa từ PrintJob cha. */
@Schema({ _id: false })
export class PrintJobItem {
  /** ID dòng đơn bên Ecommerce — dùng map output về đúng dòng khi hoàn tất. */
  @Prop({ required: true })
  orderItemId!: string;

  /** WarehouseItem CUP_BLANK dùng làm nguyên liệu */
  @Prop({ type: Types.ObjectId, required: true })
  inputItemId!: Types.ObjectId;

  /** WarehouseItem CUP_PRINTED đầu ra — mỗi design = 1 SKU riêng (per-design) */
  @Prop({ type: Types.ObjectId, required: true })
  outputItemId!: Types.ObjectId;

  /** Denormalized từ WarehouseItem (output).sku — để hiển thị, không dùng để tính lại */
  @Prop({ required: true })
  sku!: string;

  @Prop()
  designFile?: string;

  /** Số lượng yêu cầu từ đơn */
  @Prop({ type: Number, required: true, min: 0 })
  quantity!: number;

  /** Số thực đã giữ (reserved) — có thể < quantity nếu CUP_BLANK không đủ lúc tạo job */
  @Prop({ type: Number, required: true, min: 0 })
  reservedQty!: number;

  /** Còn lại chưa consume — giảm dần mỗi lần PRINTER quét xác nhận tiêu thụ, khởi tạo = reservedQty */
  @Prop({ type: Number, required: true, min: 0 })
  remainingQty!: number;

  @Prop({ enum: PrintJobLineStatus, default: PrintJobLineStatus.PENDING })
  lineStatus!: PrintJobLineStatus;
}
const PrintJobItemSchema = SchemaFactory.createForClass(PrintJobItem);

/**
 * Lệnh in ly make-to-order (UC-04). Sinh tự động khi nhận print.requested.
 * Chứng từ giao dịch — hủy bằng status, KHÔNG soft-delete.
 */
@Schema({ collection: 'print_jobs', timestamps: true })
export class PrintJob {
  /** id đơn hàng bên Ecom — KHÔNG phải ObjectId nội bộ WMS */
  @Prop({ required: true })
  orderId!: string;

  /** SAMPLE và PRODUCTION của cùng orderId là hai lệnh độc lập. */
  @Prop({ type: String, enum: PrintStage, required: true })
  stage!: PrintStage;

  @Prop({ enum: PrintJobStatus, default: PrintJobStatus.PENDING })
  status!: PrintJobStatus;

  /** PRINTER xác nhận in xong toàn bộ job — set khi status chuyển COMPLETED */
  @Prop({ type: Types.ObjectId })
  confirmedBy?: Types.ObjectId;

  @Prop({ type: [PrintJobItemSchema], required: true })
  items!: PrintJobItem[];

  /** Toàn bộ thông tin đơn hàng từ Ecom để thợ in xem chi tiết sản phẩm / metadata */
  @Prop({ type: Object })
  orderDetail?: Record<string, any>;
}

export type PrintJobDocument = HydratedDocument<PrintJob>;
export const PrintJobSchema = SchemaFactory.createForClass(PrintJob);

PrintJobSchema.index(
  { orderId: 1, stage: 1 },
  { unique: true, name: 'orderId_1_stage_1' },
);
PrintJobSchema.index({ status: 1 });
