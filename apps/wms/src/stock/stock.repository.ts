import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WarehouseItem } from './schemas/warehouse-item.schema';

@Injectable()
export class StockRepository {
  constructor(
    @InjectModel(WarehouseItem.name)
    private readonly model: Model<WarehouseItem>,
  ) {}

  /** Lấy sku của một mặt hàng theo id — dùng khi publish stock.changed. */
  findSkuById(itemId: string) {
    return this.model.findById(itemId).select('sku').lean().exec();
  }
}
