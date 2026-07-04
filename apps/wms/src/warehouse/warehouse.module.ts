// apps/wms/src/warehouse/warehouse.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Warehouse, WarehouseSchema } from './schemas/warehouse.schema';
import { Zone, ZoneSchema } from './schemas/zone.schema';
import { Rack, RackSchema } from './schemas/rack.schema';
import { Shelf, ShelfSchema } from './schemas/shelf.schema';
import { WarehouseRepository } from './warehouse.repository';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Zone.name, schema: ZoneSchema },
      { name: Rack.name, schema: RackSchema },
      { name: Shelf.name, schema: ShelfSchema },
    ]),
  ],
  providers: [WarehouseRepository, WarehouseService],
  controllers: [WarehouseController],
  // WarehouseRepository export riêng để PutAwayService gọi thẳng findShelfByCode
  // (trả về null khi không thấy) và tự throw PUTAWAY_SHELF_NOT_FOUND — tránh
  // code lỗi generic SHELF_NOT_FOUND của WarehouseService rò vào domain put-away.
  exports: [WarehouseService, WarehouseRepository],
})
export class WarehouseModule {}
