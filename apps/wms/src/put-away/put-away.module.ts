import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PutAwayTask, PutAwayTaskSchema } from './schemas/put-away-task.schema';
import { PutAwayRepository } from './put-away.repository';
import { PutAwayService } from './put-away.service';
import { PutAwayController } from './put-away.controller';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PutAwayTask.name, schema: PutAwayTaskSchema },
    ]),
    WarehouseModule, // findShelfByCode + findStagingShelf
    StockModule, // StockRepository (upsertInventory/insertMovement) + StockTransactionHelper + BarcodeService
  ],
  providers: [PutAwayRepository, PutAwayService],
  controllers: [PutAwayController],
  exports: [PutAwayService],
})
export class PutAwayModule {}
