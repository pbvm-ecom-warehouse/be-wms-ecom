import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type WarehouseLayoutConfigDocument =
  HydratedDocument<WarehouseLayoutConfig>;

@Schema({ collection: 'warehouse_layout_configs', timestamps: true })
export class WarehouseLayoutConfig {
  @Prop({ default: 'SINGLETON', enum: ['SINGLETON'], unique: true })
  key!: 'SINGLETON';

  @Prop({ default: 40, min: 0.1 })
  widthM!: number;

  @Prop({ default: 24, min: 0.1 })
  heightM!: number;

  @Prop({ default: 0.5, min: 0.1 })
  gridM!: number;

  @Prop({ default: 1, min: 1 })
  revision!: number;

  @Prop({ type: SchemaTypes.ObjectId })
  updatedBy?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const WarehouseLayoutConfigSchema = SchemaFactory.createForClass(
  WarehouseLayoutConfig,
);
