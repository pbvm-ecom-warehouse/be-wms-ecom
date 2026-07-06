import { Module } from '@nestjs/common';
import { PutAwaySuggestionController } from './put-away-suggestion.controller';
import { PutAwaySuggestionService } from './put-away-suggestion.service';
import { StockModule } from '../stock/stock.module';
import { WarehouseModule } from '../warehouse/warehouse.module';

@Module({
  imports: [
    StockModule, // StockRepository: findItemBySku, findOccupiedVolumeByWarehouse, findShelfIdsWithItem
    WarehouseModule, // WarehouseRepository: findShelvesByWarehouse
  ],
  controllers: [PutAwaySuggestionController],
  providers: [PutAwaySuggestionService],
})
export class PutAwaySuggestionModule {}
