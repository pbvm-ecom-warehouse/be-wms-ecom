import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum LotStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
}

/**
 * Lô hàng — chỉ dùng cho WarehouseItem.isPerishable = true.
 * Hàng hết hạn: ExpiredLotScanService (cron) đặt status = EXPIRED, CHỈ tăng
 * StockBalance.expired (KHÔNG đụng onHand/InventoryStock — hàng vẫn nằm vật
 * lý trên kệ), rồi bắn stock.expired event. available = onHand-reserved-expired
 * giảm đúng 1 lần. Dọn hàng vật lý thật (trừ onHand) vẫn là ScrapNote thủ công
 * (UC-08) — xem ScrapNoteService.approveScrapNote (dòng có lotId trừ lại
 * expired để available không đổi lần 2).
 */
@Schema({ collection: 'lots', timestamps: true })
export class Lot {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  itemId!: Types.ObjectId;

  @Prop({ required: true })
  lotNumber!: string;

  @Prop({ type: Date, required: true })
  expiryDate!: Date;

  @Prop({ type: Date })
  manufacturedDate?: Date;

  @Prop({ type: Date, required: true })
  receivedDate!: Date;

  @Prop({ enum: LotStatus, default: LotStatus.ACTIVE })
  status!: LotStatus;
}

export type LotDocument = HydratedDocument<Lot>;
export const LotSchema = SchemaFactory.createForClass(Lot);

// lotNumber unique per item (cùng item không được có 2 lô cùng số)
LotSchema.index({ itemId: 1, lotNumber: 1 }, { unique: true });
LotSchema.index({ expiryDate: 1, status: 1 }); // hỗ trợ cron expired scan
