import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import { Carrier, CarrierSchema } from './schemas/carrier.schema';
import { Shipment, ShipmentSchema } from './schemas/shipment.schema';
import { CarrierRepository } from './carrier.repository';
import { CarrierService } from './carrier.service';
import { CarrierController } from './carrier.controller';
import { ShipmentRepository } from './shipment.repository';
import { ShipmentService } from './shipment.service';
import { ShipmentController } from './shipment.controller';
import { GoodsIssuedConsumer } from './goods-issued.consumer';
import { GoodsIssueModule } from '../goods-issue/goods-issue.module';

@Module({
  imports: [
    // SHIPMENT: produce shipment.shipped/delivered/returned (ShipmentService)
    // SHIPMENT_INTERNAL: consume goods.issued (auto-sinh Shipment) — queue riêng,
    // tránh cạnh tranh job với apps/ecommerce/src/order/order.consumer.ts trên QUEUES.SHIPMENT
    BullModule.registerQueue(
      { name: QUEUES.SHIPMENT },
      { name: QUEUES.SHIPMENT_INTERNAL },
    ),
    MongooseModule.forFeature([
      { name: Carrier.name, schema: CarrierSchema },
      { name: Shipment.name, schema: ShipmentSchema },
    ]),
    GoodsIssueModule, // GoodsIssueRepository — đọc snapshot recipient/paymentMethod/codAmount
  ],
  providers: [
    CarrierRepository,
    CarrierService,
    ShipmentRepository,
    ShipmentService,
    GoodsIssuedConsumer,
  ],
  controllers: [CarrierController, ShipmentController],
  exports: [CarrierService, ShipmentService],
})
export class ShippingModule {}
