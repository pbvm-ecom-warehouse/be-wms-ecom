import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Zone, ZoneSchema } from './schemas/zone.schema';
import { Rack, RackSchema } from './schemas/rack.schema';
import { Shelf, ShelfSchema } from './schemas/shelf.schema';
import { LocationRepository } from './location.repository';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Zone.name, schema: ZoneSchema },
      { name: Rack.name, schema: RackSchema },
      { name: Shelf.name, schema: ShelfSchema },
    ]),
  ],
  providers: [LocationRepository, LocationService],
  controllers: [LocationController],
  // LocationRepository export riêng để PutAwayService gọi thẳng findShelfByCode
  // (trả về null khi không thấy) và tự throw PUTAWAY_SHELF_NOT_FOUND — tránh
  // code lỗi generic SHELF_NOT_FOUND của LocationService rò vào domain put-away.
  exports: [LocationService, LocationRepository],
})
export class LocationModule {}
