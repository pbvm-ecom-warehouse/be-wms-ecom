import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WmsRole } from '@app/auth';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { User } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { StockService } from '../stock/stock.service';
import { SupplierService } from '../supplier/supplier.service';
import { ItemType } from '../stock/schemas/warehouse-item.schema';

const logger = new Logger('SeedWms');

const SEED_PASSWORD = 'Seed@12345';

const SEED_USERS: { username: string; role: WmsRole; name: string }[] = [
  { username: 'seed_manager', role: WmsRole.MANAGER, name: 'Seed Manager' },
  { username: 'seed_receiver', role: WmsRole.RECEIVER, name: 'Seed Receiver' },
  { username: 'seed_picker', role: WmsRole.PICKER, name: 'Seed Picker' },
  { username: 'seed_printer', role: WmsRole.PRINTER, name: 'Seed Printer' },
  { username: 'seed_counter', role: WmsRole.COUNTER, name: 'Seed Counter' },
];

/**
 * Seed data cho demo/E2E: admin + 5 role nhân viên. Idempotent — chạy lại
 * không tạo trùng (check-then-create, KHÔNG bắt lỗi duplicate-key vì
 * AuthService/UserRepository không map E11000 sang AppException — bắt lỗi
 * đó sẽ để lộ raw Mongo error ra ngoài).
 */
export async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const { adminId } = await seedUsers(app);
    await seedWarehouseAndItems(app, adminId);
    logger.log('Seed hoàn tất.');
  } finally {
    await app.close();
  }
}

async function seedUsers(
  app: INestApplicationContext,
): Promise<{ adminId: string }> {
  const authService = app.get(AuthService);
  const usersService = app.get(UsersService);
  // UserRepository không có method tìm theo username "trần trụi" (chỉ có
  // findActiveByUsername — lọc thêm status: ACTIVE, không hợp cho
  // existence-check trước khi user được tạo/kích hoạt). Theo brief: KHÔNG
  // thêm method mới vào repository cho nhu cầu một-lần-dùng này — lấy thẳng
  // Mongoose model qua app.get(getModelToken(...)) để query read-only.
  const userModel = app.get<Model<User>>(getModelToken(User.name));

  let admin = await userModel.findOne({ username: 'seed_admin' }).exec();
  if (!admin) {
    const dto: CreateUserDto = {
      username: 'seed_admin',
      password: SEED_PASSWORD,
      name: 'Seed Admin',
    };
    // bootstrapAdmin chỉ chạy được khi collection users rỗng — nếu đã có user
    // khác (kể cả từ lần seed trước bị dở dang) nó sẽ throw AUTH_BOOTSTRAP_FORBIDDEN.
    // Đây là hành vi mong muốn của AuthService, không phải bug của seed script.
    await authService.bootstrapAdmin(dto);
    admin = await userModel.findOne({ username: 'seed_admin' }).exec();
    logger.log(`Tạo admin: seed_admin / ${SEED_PASSWORD}`);
  } else {
    logger.log('admin đã tồn tại — bỏ qua.');
  }
  if (!admin) {
    throw new Error('Không thể tạo hoặc tìm thấy seed_admin sau bootstrap.');
  }
  const adminId = admin._id.toString();

  for (const u of SEED_USERS) {
    const existing = await userModel.findOne({ username: u.username }).exec();
    if (existing) {
      logger.log(`${u.username} đã tồn tại — bỏ qua.`);
      continue;
    }
    const dto: CreateUserDto = {
      username: u.username,
      password: SEED_PASSWORD,
      name: u.name,
      roles: [u.role],
    };
    await usersService.create(dto, { sub: adminId, roles: [WmsRole.ADMIN] });
    logger.log(`Tạo ${u.username} (${u.role}) / ${SEED_PASSWORD}`);
  }

  return { adminId };
}

const SEED_WAREHOUSE_NAME = 'Kho trung tâm (seed)';

/**
 * Seed cây warehouse (zone/rack/2 shelf) + 2 WarehouseItem + 1 Supplier + 2
 * SupplierItem, dùng cho demo script và test tay ở các task sau của S4-05.
 *
 * Idempotent bằng cách kiểm tra NGUYÊN CẢ CÂY qua 1 điều kiện duy nhất: nếu
 * warehouse "Kho trung tâm (seed)" đã tồn tại thì bỏ qua toàn bộ — không tạo
 * lại zone/rack/shelf/item/supplier, và cũng không cần đọc lại id của chúng
 * (không có gì trong plan này tiêu thụ giá trị trả về của seed(), xem
 * task-2-brief.md). Lý do check-1-chỗ là đủ: toàn bộ cây này luôn được tạo
 * cùng nhau trong 1 lần chạy seed — không có kịch bản nào tạo warehouse mà
 * chưa tạo item/supplier đi kèm — nên không cần duplicate-guard riêng cho
 * từng create() (WarehouseService.createWarehouse không có unique code để tự
 * chặn trùng — xem comment trong warehouse.service.ts).
 */
async function seedWarehouseAndItems(
  app: INestApplicationContext,
  adminId: string,
): Promise<{
  warehouseId: string;
  stagingShelfId: string;
  mainShelfId: string;
  itemIds: string[];
  supplierId: string;
} | null> {
  const warehouseService = app.get(WarehouseService);
  const stockService = app.get(StockService);
  const supplierService = app.get(SupplierService);

  const existingWarehouses = await warehouseService.listWarehouses();
  const existing = existingWarehouses.find(
    (w) => w.name === SEED_WAREHOUSE_NAME,
  );
  if (existing) {
    logger.log('seed data đã tồn tại — bỏ qua toàn bộ warehouse/item/supplier');
    return null;
  }

  const warehouse = await warehouseService.createWarehouse(
    { name: SEED_WAREHOUSE_NAME, address: '1 Đường Kho, Q9, TP.HCM' },
    adminId,
  );
  const warehouseId = warehouse._id.toString();

  const zone = await warehouseService.createZone(
    { warehouseId, name: 'Khu A (seed)', code: 'SEED-A' },
    adminId,
  );
  const zoneId = zone._id.toString();

  const rack = await warehouseService.createRack(
    { zoneId, name: 'Kệ A1 (seed)', code: 'SEED-A1' },
    adminId,
  );
  const rackId = rack._id.toString();

  const stagingShelf = await warehouseService.createShelf(
    { rackId, level: 1, code: 'SEED-A1-STAGING', isStaging: true },
    adminId,
  );
  const mainShelf = await warehouseService.createShelf(
    {
      rackId,
      level: 2,
      code: 'SEED-A1-T2',
      innerDepth: 120,
      innerWidth: 80,
      innerHeight: 50,
      fillFactor: 0.8,
    },
    adminId,
  );

  const material = await stockService.createWarehouseItem(
    {
      sku: 'SEED-MAT-001',
      barcode: 'SEED-MAT-001-BC',
      name: 'Nguyên liệu seed',
      type: ItemType.MATERIAL,
      unit: 'kg',
      isPerishable: false,
      minQuantity: 10,
      depth: 10,
      width: 8,
      height: 12,
    },
    adminId,
  );
  const cupBlank = await stockService.createWarehouseItem(
    {
      sku: 'SEED-CUP-BLANK-001',
      barcode: 'SEED-CUP-BLANK-001-BC',
      name: 'Ly nhựa trơn seed',
      type: ItemType.CUP_BLANK,
      unit: 'cái',
      isPerishable: false,
      minQuantity: 20,
      depth: 8,
      width: 8,
      height: 15,
    },
    adminId,
  );

  const supplier = await supplierService.createSupplier(
    { code: 'SEED-NCC-001', name: 'Nhà cung cấp seed' },
    adminId,
  );
  const supplierId = supplier._id.toString();

  // upsertSupplierItem chỉ nhận 1 tham số (dto) — không có actorId (xem
  // controller thật: async upsertSupplierItem(@Body() dto) không có @CurrentUser).
  await supplierService.upsertSupplierItem({
    itemId: material._id.toString(),
    supplierId,
    purchasePrice: 15000,
  });
  await supplierService.upsertSupplierItem({
    itemId: cupBlank._id.toString(),
    supplierId,
    purchasePrice: 3000,
  });

  logger.log(
    `Kho seed: ${warehouseId}, shelf staging: ${stagingShelf._id.toString()}, shelf chính: ${mainShelf._id.toString()}`,
  );

  return {
    warehouseId,
    stagingShelfId: stagingShelf._id.toString(),
    mainShelfId: mainShelf._id.toString(),
    itemIds: [material._id.toString(), cupBlank._id.toString()],
    supplierId,
  };
}

// Guard này để file import được (Task 2-5 mở rộng cùng file, hoặc test import
// hàm seed()) mà không tự động chạy — chỉ chạy khi gọi trực tiếp qua ts-node.
if (require.main === module) {
  seed().catch((err: unknown) => {
    logger.error('Seed thất bại:', err);
    process.exit(1);
  });
}
