import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum PutAwayTaskStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
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

  @Prop({ type: Types.ObjectId, default: null })
  lotId!: Types.ObjectId | null;

  /** Số lượng cần xếp ban đầu — copy từ baseQty của dòng GRN tương ứng */
  @Prop({ type: Number, required: true, min: 0 })
  quantity!: number;

  /** Còn lại chưa xếp — giảm dần mỗi lần RECEIVER quét xác nhận thành công */
  @Prop({ type: Number, required: true, min: 0 })
  remainingQty!: number;
}
const PutAwayItemSchema = SchemaFactory.createForClass(PutAwayItem);

/**
 * Lệnh sắp xếp (UC-03). Chứng từ giao dịch — hủy bằng status, KHÔNG soft-delete.
 * Sinh tự động khi GoodsReceiptNote CONFIRMED.
 */
@Schema({ collection: 'put_away_tasks', timestamps: true })
export class PutAwayTask {
  @Prop({ type: Types.ObjectId, required: true })
  grnId!: Types.ObjectId;

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
