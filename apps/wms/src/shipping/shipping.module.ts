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
import { DocumentNumberModule } from '../document-number/document-number.module';
import {
  DeliveryTrip,
  DeliveryTripSchema,
} from './schemas/delivery-trip.schema';
import { DeliveryTripRepository } from './delivery-trip.repository';
import { DeliveryTripService } from './delivery-trip.service';
import { DeliveryTripController } from './delivery-trip.controller';
import {
  DeliveryIncident,
  DeliveryIncidentSchema,
} from './schemas/delivery-incident.schema';
import { DeliveryIncidentRepository } from './delivery-incident.repository';
import { LastMileDeliveryService } from './last-mile-delivery.service';
import { LastMileDeliveryController } from './last-mile-delivery.controller';
import { GoodsReturnModule } from '../goods-return/goods-return.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // SHIPMENT: produce shipment.shipped/delivered/returned (ShipmentService)
    // SHIPMENT_INTERNAL: consume goods.issued (auto-sinh Shipment) — queue riêng,
    // tránh cạnh tranh job với apps/ecommerce/src/order/order.consumer.ts trên QUEUES.SHIPMENT
    BullModule.registerQueue(
      { name: QUEUES.SHIPMENT },
      { name: QUEUES.SHIPMENT_INTERNAL },
      { name: QUEUES.NOTIFICATION },
    ),
    MongooseModule.forFeature([
      { name: Carrier.name, schema: CarrierSchema },
      { name: Shipment.name, schema: ShipmentSchema },
      { name: DeliveryTrip.name, schema: DeliveryTripSchema },
      { name: DeliveryIncident.name, schema: DeliveryIncidentSchema },
    ]),
    GoodsIssueModule, // GoodsIssueRepository — đọc snapshot recipient/paymentMethod/codAmount
    DocumentNumberModule,
    GoodsReturnModule,
    UsersModule,
  ],
  providers: [
    CarrierRepository,
    CarrierService,
    ShipmentRepository,
    ShipmentService,
    DeliveryTripRepository,
    DeliveryTripService,
    DeliveryIncidentRepository,
    LastMileDeliveryService,
    GoodsIssuedConsumer,
  ],
  controllers: [
    CarrierController,
    ShipmentController,
    DeliveryTripController,
    LastMileDeliveryController,
  ],
  exports: [CarrierService, ShipmentService, DeliveryTripService],
})
export class ShippingModule {}
