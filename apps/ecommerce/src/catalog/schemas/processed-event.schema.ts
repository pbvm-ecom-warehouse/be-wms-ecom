import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Sổ idempotency: ghi nhận mỗi job event đã xử lý (theo jobId DUY NHẤT của BullMQ).
 * Vì job retry tới 5 lần, consumer phải áp delta đúng MỘT lần — dùng bản ghi này
 * trong cùng transaction với phép $inc để đảm bảo exactly-once (cần replica set).
 * Append-only → chỉ createdAt.
 */
@Schema({
  collection: 'processed_events',
  timestamps: { createdAt: true, updatedAt: false },
})
export class ProcessedEvent {
  @Prop({ required: true, unique: true })
  jobId: string; // khóa idempotency = id job BullMQ

  @Prop({ required: true })
  eventName: string;
}

export type ProcessedEventDocument = HydratedDocument<ProcessedEvent>;
export const ProcessedEventSchema =
  SchemaFactory.createForClass(ProcessedEvent);
