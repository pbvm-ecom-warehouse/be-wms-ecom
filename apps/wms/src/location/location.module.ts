import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Zone, ZoneSchema } from './schemas/zone.schema';
import { Rack, RackSchema } from './schemas/rack.schema';
import { Shelf, ShelfSchema } from './schemas/shelf.schema';
import {
  RackTemplate,
  RackTemplateSchema,
} from './schemas/rack-template.schema';
import { Aisle, AisleSchema } from './schemas/aisle.schema';
import { Gate, GateSchema } from './schemas/gate.schema';
import { LocationRepository } from './location.repository';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Zone.name, schema: ZoneSchema },
      { name: Rack.name, schema: RackSchema },
      { name: Shelf.name, schema: ShelfSchema },
      { name: RackTemplate.name, schema: RackTemplateSchema },
      { name: Aisle.name, schema: AisleSchema },
      { name: Gate.name, schema: GateSchema },
    ]),
    // LocationService.getShelfContents cần StockRepository để join tồn kho
    // thật vào shelf — chiều phụ thuộc mới Location → Stock, KHÔNG ngược lại
    // (StockModule không import LocationModule) nên không tạo vòng lặp.
    StockModule,
  ],
  providers: [LocationRepository, LocationService],
  controllers: [LocationController],
  // LocationRepository export riêng để PutAwayService gọi thẳng findShelfByCode
  // (trả về null khi không thấy) và tự throw PUTAWAY_SHELF_NOT_FOUND — tránh
  // code lỗi generic SHELF_NOT_FOUND của LocationService rò vào domain put-away.
  exports: [LocationService, LocationRepository],
})
export class LocationModule {}
