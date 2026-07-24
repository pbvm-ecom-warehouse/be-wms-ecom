import { Module } from '@nestjs/common';
import { PutAwaySuggestionController } from './put-away-suggestion.controller';
import { PutAwaySuggestionService } from './put-away-suggestion.service';
import { StockModule } from '../stock/stock.module';
import { LocationModule } from '../location/location.module';

@Module({
  imports: [
    StockModule, // StockRepository: findItemBySku, findOccupiedVolume, findShelfIdsWithItem
    LocationModule, // LocationRepository: findShelves
  ],
  controllers: [PutAwaySuggestionController],
  providers: [PutAwaySuggestionService],
})
export class PutAwaySuggestionModule {}
