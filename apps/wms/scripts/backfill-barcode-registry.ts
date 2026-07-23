import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { WarehouseItem } from '../src/stock/schemas/warehouse-item.schema';
import { BarcodeRegistryEntry } from '../src/stock/schemas/barcode-registry.schema';

const logger = new Logger('BackfillBarcodeRegistry');

const DRY_RUN = !process.argv.includes('--apply');

type CodeOwner = { itemId: string; sku: string; kind: 'PRIMARY' | 'ALTERNATE' };

/**
 * Backfill barcode_registry từ dữ liệu barcode/altBarcodes cũ trên WarehouseItem.
 * KHÔNG tự chọn item thắng khi 1 mã bị nhiều item dùng chung (issue #25: "báo
 * toàn bộ collision và không tự chọn item thắng") — collision bị bỏ qua, chỉ
 * report để xử lý tay. Mặc định --dry-run (chỉ in báo cáo, không ghi DB).
 */
export async function backfillBarcodeRegistry(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const itemModel = app.get<Model<WarehouseItem>>(
      getModelToken(WarehouseItem.name),
    );
    const registryModel = app.get<Model<BarcodeRegistryEntry>>(
      getModelToken(BarcodeRegistryEntry.name),
    );

    const items = await itemModel.find({}).lean();

    // code → danh sách item sở hữu mã đó (kể cả trùng barcode chính lẫn altBarcodes)
    const codeOwners = new Map<string, CodeOwner[]>();

    for (const item of items) {
      const itemId = String(item._id);
      if (item.barcode) {
        const list = codeOwners.get(item.barcode) ?? [];
        list.push({ itemId, sku: item.sku, kind: 'PRIMARY' });
        codeOwners.set(item.barcode, list);
      }
      for (const alt of item.altBarcodes ?? []) {
        const list = codeOwners.get(alt) ?? [];
        list.push({ itemId, sku: item.sku, kind: 'ALTERNATE' });
        codeOwners.set(alt, list);
      }
    }

    const collisions: { code: string; owners: CodeOwner[] }[] = [];
    const clean: {
      code: string;
      itemId: string;
      kind: 'PRIMARY' | 'ALTERNATE';
    }[] = [];

    for (const [code, owners] of codeOwners.entries()) {
      const distinctItemIds = new Set(owners.map((o) => o.itemId));
      if (distinctItemIds.size > 1) {
        collisions.push({ code, owners });
      } else {
        clean.push({ code, itemId: owners[0].itemId, kind: owners[0].kind });
      }
    }

    logger.log(`Tổng số mã quét được: ${codeOwners.size}`);
    logger.log(`Mã sạch (1 item sở hữu): ${clean.length}`);
    logger.log(
      `Mã COLLISION (nhiều item cùng dùng 1 mã): ${collisions.length}`,
    );

    if (collisions.length > 0) {
      logger.warn(
        'Danh sách collision — KHÔNG tự chọn item thắng, cần xử lý tay:',
      );
      for (const c of collisions) {
        logger.warn(`  code=${c.code}`);
        for (const o of c.owners) {
          logger.warn(`    - itemId=${o.itemId} sku=${o.sku} kind=${o.kind}`);
        }
      }
    }

    if (DRY_RUN) {
      logger.log(
        '[DRY RUN] Không ghi gì vào barcode_registry. Chạy lại với --apply để ghi các mã sạch.',
      );
    } else {
      logger.log(`Ghi ${clean.length} entry sạch vào barcode_registry...`);
      for (const entry of clean) {
        await registryModel.updateOne(
          { code: entry.code },
          {
            $setOnInsert: {
              code: entry.code,
              itemId: entry.itemId,
              kind: entry.kind,
            },
          },
          { upsert: true },
        );
      }
      logger.log('Xong.');
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  backfillBarcodeRegistry().catch((err: unknown) => {
    logger.error('Backfill thất bại:', err);
    process.exit(1);
  });
}
