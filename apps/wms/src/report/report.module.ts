import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WarehouseItem,
  WarehouseItemSchema,
} from '../stock/schemas/warehouse-item.schema';
import {
  StockBalance,
  StockBalanceSchema,
} from '../stock/schemas/stock-balance.schema';
import {
  InventoryStock,
  InventoryStockSchema,
} from '../stock/schemas/inventory-stock.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';
import { ReportRepository } from './report.repository';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';

@Module({
  imports: [
    // Đăng ký lại 4 model đã tồn tại trong StockModule — an toàn vì
    // @nestjs/mongoose tái dùng connection.models[name] nếu đã compile,
    // không đọc chéo DB (vẫn cùng 1 connection wms_db). Không cần Lot/Warehouse
    // ở đây vì 2 collection đó chỉ được $lookup bằng tên thô trong pipeline.
    MongooseModule.forFeature([
      { name: WarehouseItem.name, schema: WarehouseItemSchema },
      { name: StockBalance.name, schema: StockBalanceSchema },
      { name: InventoryStock.name, schema: InventoryStockSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
  ],
  providers: [ReportRepository, ReportService],
  controllers: [ReportController],
})
export class ReportModule {}
