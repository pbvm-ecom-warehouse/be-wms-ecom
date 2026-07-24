import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule as WmsModule } from '../app.module';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { WarehouseItem } from '../stock/schemas/warehouse-item.schema';
import * as mongoose from 'mongoose';

const logger = new Logger('TestSyncCleanup');

async function run() {
  // 1. Dọn dẹp WMS DB
  const wmsApp = await NestFactory.createApplicationContext(WmsModule);
  let skuToClean = '';
  try {
    const itemModel = wmsApp.get<Model<WarehouseItem>>(
      getModelToken(WarehouseItem.name),
    );
    const items = await itemModel
      .find({
        $or: [{ sku: 'CUP-HRT-PET-500-CLR' }, { name: /sync test/i }],
      })
      .lean();
    skuToClean = 'CUP-HRT-PET-500-CLR';

    // Xóa trong WMS
    await itemModel.deleteMany({
      $or: [{ sku: 'CUP-HRT-PET-500-CLR' }, { name: /sync test/i }],
    });
    logger.log(`Đã xóa mặt hàng WMS SKU: CUP-HRT-PET-500-CLR`);

    // Xóa barcode registry để giải phóng
    const conn = wmsApp.get<Connection>(getConnectionToken());
    const db = conn?.db;
    if (db) {
      await db
        .collection('barcode_registries')
        .deleteMany({ itemId: { $in: items.map((i) => i._id) } });
      await db
        .collection('barcode_registries')
        .deleteMany({ barcode: '2000000000015' });
    }
  } finally {
    await wmsApp.close();
  }

  // 2. Dọn dẹp Ecom DB
  if (skuToClean) {
    const ecomDbUrl =
      process.env.ECOM_DATABASE_URL || 'mongodb://localhost:27017/ecom_db';
    logger.log(`Kết nối tới Ecom DB để dọn dẹp SKU: ${skuToClean}`);
    const connection = await mongoose.connect(ecomDbUrl);
    try {
      const db = connection.connection.db;
      if (db) {
        await db.collection('product_variants').deleteOne({ sku: skuToClean });
        logger.log(
          `Đã dọn dẹp ProductVariant với SKU: ${skuToClean} trong Ecom DB`,
        );
      }
    } catch (e) {
      logger.error('Lỗi dọn dẹp Ecom DB:', e);
    } finally {
      await connection.disconnect();
    }
  }
  logger.log('Hoàn tất dọn dẹp test data.');
}

run();
