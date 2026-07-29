import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule as WmsModule } from '../app.module';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { WarehouseItem } from '../stock/schemas/warehouse-item.schema';
import * as mongoose from 'mongoose';

const logger = new Logger('CleanSeedMaterials');

const TEST_SKUS = [
  'MAT-TEA-BLK-ORG-1KG',
  'MAT-TEA-GRN-PEACH-500G',
  'MAT-SUGAR-WHITE_SUGAR-500G',
  'MAT-MILK-FRESH_MILK-STRAWBERRY-1L'
];

async function run() {
  logger.log('Bắt đầu dọn dẹp các sản phẩm test seed MATERIAL...');

  // 1. Dọn dẹp phía WMS
  const wmsApp = await NestFactory.createApplicationContext(WmsModule);
  try {
    const itemModel = wmsApp.get<Model<WarehouseItem>>(
      getModelToken(WarehouseItem.name),
    );
    const items = await itemModel.find({ sku: { $in: TEST_SKUS } }).lean();
    const itemIds = items.map((i) => i._id);

    // Xóa sản phẩm trong WMS
    const deleteItemsRes = await itemModel.deleteMany({ sku: { $in: TEST_SKUS } });
    logger.log(`Đã xóa ${deleteItemsRes.deletedCount} sản phẩm trong WMS DB.`);

    // Xóa barcode đăng ký liên quan
    const conn = wmsApp.get<Connection>(getConnectionToken());
    const db = conn?.db;
    if (db && itemIds.length > 0) {
      const deleteBarcodesRes = await db
        .collection('barcode_registries')
        .deleteMany({ itemId: { $in: itemIds } });
      logger.log(`Đã xóa ${deleteBarcodesRes.deletedCount} barcode registries trong WMS DB.`);
    }
  } catch (err) {
    logger.error('Lỗi khi dọn dẹp WMS:', err);
  } finally {
    await wmsApp.close();
  }

  // 2. Dọn dẹp phía Ecommerce
  const ecomDbUrl = process.env.ECOM_DATABASE_URL || 'mongodb://localhost:27017/ecom_db';
  logger.log(`Đang kết nối tới Ecommerce DB để dọn dẹp...`);
  try {
    const connection = await mongoose.connect(ecomDbUrl);
    const db = connection.connection.db;
    if (db) {
      // Xóa ProductVariant
      const deleteVariantsRes = await db.collection('product_variants').deleteMany({ sku: { $in: TEST_SKUS } });
      logger.log(`Đã xóa ${deleteVariantsRes.deletedCount} ProductVariants trong Ecom DB.`);

      // Xóa các Product trống do gom nhóm
      const deleteProductsRes = await db.collection('products').deleteMany({
        slug: { $in: ['san-pham-kho-mat-tea', 'san-pham-kho-mat-sugar', 'san-pham-kho-mat-milk'] }
      });
      logger.log(`Đã xóa ${deleteProductsRes.deletedCount} Product lớn gom nhóm trong Ecom DB.`);
    }
    await connection.disconnect();
  } catch (err) {
    logger.error('Lỗi khi dọn dẹp Ecommerce DB:', err);
  }

  logger.log('Dọn dẹp các sản phẩm test seed MATERIAL hoàn tất!');
}

run();
