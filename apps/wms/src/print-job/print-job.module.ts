import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import { PrintJob, PrintJobSchema } from './schemas/print-job.schema';
import { PrintJobRepository } from './print-job.repository';
import { PrintJobService } from './print-job.service';
import { PrintJobController } from './print-job.controller';
import { PrintJobConsumer } from './print-job.consumer';
import { LocationModule } from '../location/location.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    // PRINT: consume print.requested (khớp print-job.consumer.ts)
    // STOCK: produce stock.changed khi reserve CUP_BLANK lúc tạo job (khớp
    //   apps/ecommerce/src/catalog/stock.consumer.ts @Processor(QUEUES.STOCK))
    // SHIPMENT: produce print.completed (khớp
    //   apps/ecommerce/src/order/order.consumer.ts @Processor(QUEUES.SHIPMENT))
    BullModule.registerQueue(
      { name: QUEUES.PRINT },
      { name: QUEUES.STOCK },
      { name: QUEUES.SHIPMENT },
    ),
    MongooseModule.forFeature([
      { name: PrintJob.name, schema: PrintJobSchema },
    ]),
    LocationModule, // findShelfByCode
    StockModule, // StockRepository + StockTransactionHelper
  ],
  providers: [PrintJobRepository, PrintJobService, PrintJobConsumer],
  controllers: [PrintJobController],
  exports: [PrintJobService],
})
export class PrintJobModule {}
