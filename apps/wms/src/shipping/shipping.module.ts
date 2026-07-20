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
    // SHIPMENT: consume goods.issued (auto-sinh Shipment) · produce shipment.shipped/delivered/returned
    BullModule.registerQueue({ name: QUEUES.SHIPMENT }),
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
