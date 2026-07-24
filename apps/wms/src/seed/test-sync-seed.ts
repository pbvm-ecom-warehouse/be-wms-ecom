import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { StockService } from '../stock/stock.service';
import { ItemType } from '../stock/schemas/warehouse-item.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { ItemAttributeOption } from '../stock/schemas/attribute-option.schema';
import { WmsRole } from '@app/auth';

const logger = new Logger('TestSyncSeed');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const stockService = app.get(StockService);
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const optionModel = app.get<Model<ItemAttributeOption>>(getModelToken(ItemAttributeOption.name));

    // Tìm một user manager để làm actorId
    const user = await userModel.findOne({ role: WmsRole.MANAGER }).lean();
    const actorId = user ? user._id.toString() : '64e83c27e85c2c77dfa81111';

    logger.log(`Sử dụng actorId: ${actorId}`);

    // Truy vấn các attribute option IDs bằng code từ DB
    const codes = ['HRT', 'PET', '500', 'CLR'];
    const options = await optionModel.find({ code: { $in: codes } }).lean();
    
    // Sắp xếp đúng theo thứ tự codes
    const attributeOptionIds = codes.map(c => {
      const opt = options.find(o => o.code === c);
      if (!opt) {
        throw new Error(`Thiếu option ${c} trong DB. Hãy chạy pnpm seed:wms trước.`);
      }
      return opt._id.toString();
    });

    const dto = {
      type: ItemType.CUP_BLANK,
      templateId: 'CUP_BLANK',
      attributeOptionIds,
      name: 'Ly tim nhựa PET 500ml sync test',
      unit: 'cái',
      minQuantity: 10,
    };

    logger.log('Đang gọi createWarehouseItem để tạo mặt hàng...');
    const createdItem = await stockService.createWarehouseItem(dto as any, actorId);
    logger.log(`Tạo thành công mặt hàng WMS. SKU: ${createdItem.sku}`);
  } catch (err: any) {
    logger.error('Lỗi khi chạy test seed:', err.message || err);
  } finally {
    await app.close();
  }
}

run();
