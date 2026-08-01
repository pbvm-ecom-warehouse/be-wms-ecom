import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PackageSpec,
  PackageSpecSchema,
} from '../../stock/schemas/package-spec.schema';

export enum PutAwayTaskStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
}

export enum PutAwayTaskSourceType {
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  GOODS_RETURN = 'GOODS_RETURN',
}

/**
 * Sub-document: 1 dòng cần xếp (map 1-1 với 1 dòng GRN theo item+lô).
 * Không audit riêng — kế thừa từ PutAwayTask cha.
 * Không có shelfId cố định (lệch có chủ đích so với data-model.md): 1 dòng
 * có thể được xếp vào nhiều shelf qua nhiều lần quét — vị trí thực tế tra
 * qua StockMovement(type=PUTAWAY, refId=putAwayTaskId) hoặc InventoryStock hiện tại.
 */
@Schema({ _id: false })
export class PutAwayItem {
  @Prop({ type: Types.ObjectId, required: true })
  itemId!: Types.ObjectId;

  /** Snapshot để task từ hàng hoàn vẫn hiển thị/quét được mà không cần GRN. */
  @Prop()
  sku?: string;

  @Prop({ type: Types.ObjectId, default: null })
  lotId!: Types.ObjectId | null;

  /** Số thùng cần xếp ban đầu — copy từ baseQty của dòng GRN tương ứng. Luôn là số nguyên (số thùng). */
  @Prop({
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'quantity phải là số nguyên',
    },
  })
  quantity!: number;

  /** Còn lại chưa xếp — giảm dần mỗi lần RECEIVER quét xác nhận thành công */
  @Prop({ type: Number, required: true, min: 0 })
  remainingQty!: number;

  /** Kích thước 1 thùng — chỉ dùng để so khớp ô kệ, factor bên trong chỉ để hiển thị. */
  @Prop({ type: PackageSpecSchema })
  packageSpec?: PackageSpec;
}
const PutAwayItemSchema = SchemaFactory.createForClass(PutAwayItem);

/**
 * Lệnh sắp xếp (UC-03). Chứng từ giao dịch — hủy bằng status, KHÔNG soft-delete.
 * Sinh tự động khi GoodsReceiptNote APPROVED.
 */
@Schema({ collection: 'put_away_tasks', timestamps: true })
export class PutAwayTask {
  /**
   * ID chứng từ nguồn. Tên grnId được giữ để tương thích dữ liệu/API cũ;
   * sourceType phân biệt phiếu nhập với hàng hoàn.
   */
  @Prop({ type: Types.ObjectId, required: true })
  grnId!: Types.ObjectId;

  @Prop({
    enum: PutAwayTaskSourceType,
    default: PutAwayTaskSourceType.GOODS_RECEIPT,
  })
  sourceType!: PutAwayTaskSourceType;

  /** Mã nghiệp vụ snapshot (đặc biệt RET-* cho task hàng hoàn). */
  @Prop()
  sourceNumber?: string;

  /** Nguồn nhận tạm được chốt lúc duyệt GRN; đổi cấu hình layout sau đó không làm hỏng task. */
  @Prop({ type: Types.ObjectId, default: null })
  sourceShelfId?: Types.ObjectId | null;

  @Prop({ enum: PutAwayTaskStatus, default: PutAwayTaskStatus.PENDING })
  status!: PutAwayTaskStatus;

  @Prop({ type: [PutAwayItemSchema], required: true })
  items!: PutAwayItem[];

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
}

export type PutAwayTaskDocument = HydratedDocument<PutAwayTask>;
export const PutAwayTaskSchema = SchemaFactory.createForClass(PutAwayTask);
PutAwayTaskSchema.index({ grnId: 1 });
PutAwayTaskSchema.index({ status: 1 });
