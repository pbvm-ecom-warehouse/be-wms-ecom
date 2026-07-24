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
import { LocationService } from '../location/location.service';
import { StockService } from '../stock/stock.service';
import { SupplierService } from '../supplier/supplier.service';
import { ItemType } from '../stock/schemas/warehouse-item.schema';
import { AttributeOptionKey } from '../stock/schemas/attribute-option.schema';
import { AttributeOptionService } from '../stock/attribute-option/attribute-option.service';

const logger = new Logger('SeedWms');

const SEED_PASSWORD = 'Seed@12345';

const SEED_USERS: { username: string; role: WmsRole; name: string }[] = [
  { username: 'seed_manager', role: WmsRole.MANAGER, name: 'Seed Manager' },
  { username: 'seed_receiver', role: WmsRole.RECEIVER, name: 'Seed Receiver' },
  { username: 'seed_picker', role: WmsRole.PICKER, name: 'Seed Picker' },
  { username: 'seed_printer', role: WmsRole.PRINTER, name: 'Seed Printer' },
  { username: 'seed_counter', role: WmsRole.COUNTER, name: 'Seed Counter' },
  { username: 'seed_shipper', role: WmsRole.SHIPPER, name: 'Seed Shipper' },
];

const SEED_ATTRIBUTE_OPTIONS: {
  key: AttributeOptionKey;
  name: string;
  code: string;
}[] = [
  { key: AttributeOptionKey.CUP_STYLE, name: 'Trái tim', code: 'HRT' },
  { key: AttributeOptionKey.MATERIAL, name: 'Nhựa PET', code: 'PET' },
  { key: AttributeOptionKey.CAPACITY, name: '500ml', code: '500' },
  { key: AttributeOptionKey.COLOR, name: 'Trong suốt', code: 'CLR' },
  { key: AttributeOptionKey.MATERIAL_TYPE, name: 'Trà đen', code: 'BLK' },
  { key: AttributeOptionKey.FLAVOR, name: 'Nguyên bản', code: 'ORG' },
  { key: AttributeOptionKey.SPEC, name: '500g', code: '500G' },
];

/**
 * Seed data cho demo/E2E: admin + 6 role nhân viên. Idempotent — chạy lại
 * không tạo trùng bằng check-then-create (tìm theo username trước khi gọi
 * usersService.create()), không dựa vào bắt lỗi duplicate-key (issue #28:
 * UsersService.create() giờ đã map E11000 → USER_USERNAME_EXISTS/
 * USER_EMAIL_EXISTS, nhưng seed vẫn ưu tiên check-then-create để tránh
 * throw/catch không cần thiết mỗi lần chạy lại).
 */
export async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const { adminId } = await seedUsers(app);
    const optionIds = await seedAttributeOptions(app, adminId);
    await seedZoneAndItems(app, adminId, optionIds);
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
      role: u.role,
    };
    await usersService.create(dto, { sub: adminId, role: WmsRole.ADMIN });
    logger.log(`Tạo ${u.username} (${u.role}) / ${SEED_PASSWORD}`);
  }

  return { adminId };
}

/**
 * Seed option thuộc tính tối thiểu để seedWarehouseAndItems build được SKU
 * qua template thật (issue #25) — không seed đủ 14 key, chỉ seed đúng những
 * option 2 item demo (MATERIAL_TEA, CUP_BLANK) cần. Idempotent qua unique
 * {key, code} — AttributeOptionService.create tự throw STOCK_ATTRIBUTE_CODE_CONFLICT
 * nếu đã tồn tại, bắt và bỏ qua (không phải lỗi seed, là trạng thái mong đợi
 * khi seed chạy lại).
 */
async function seedAttributeOptions(
  app: INestApplicationContext,
  adminId: string,
): Promise<Record<string, string>> {
  const optionSvc = app.get(AttributeOptionService);
  const codeToId: Record<string, string> = {};

  for (const opt of SEED_ATTRIBUTE_OPTIONS) {
    try {
      const created = await optionSvc.create(opt, adminId);
      codeToId[opt.code] = created._id.toString();
    } catch (err) {
      if ((err as { code?: string }).code !== 'STOCK_ATTRIBUTE_CODE_CONFLICT') {
        throw err;
      }
      const existing = await optionSvc.list(opt.key, true);
      const match = existing.find((o) => o.code === opt.code);
      if (match) codeToId[opt.code] = match._id.toString();
    }
  }

  return codeToId;
}

const SEED_ZONE_CODE = 'SEED-A';

/**
 * Seed cây location (zone/rack/2 shelf) + 2 WarehouseItem + 1 Supplier + 2
 * SupplierItem, dùng cho demo script và test tay ở các task sau của S4-05.
 *
 * Idempotent bằng cách kiểm tra NGUYÊN CẢ CÂY qua 1 điều kiện duy nhất: nếu
 * zone "SEED-A" đã tồn tại thì bỏ qua toàn bộ — không tạo lại
 * zone/rack/shelf/item/supplier, và cũng không cần đọc lại id của chúng
 * (không có gì trong plan này tiêu thụ giá trị trả về của seed(), xem
 * task-2-brief.md). Lý do check-1-chỗ là đủ: toàn bộ cây này luôn được tạo
 * cùng nhau trong 1 lần chạy seed — không có kịch bản nào tạo zone mà chưa
 * tạo item/supplier đi kèm — nên không cần duplicate-guard riêng cho từng
 * create() (LocationService.createZone tự chặn trùng qua unique `code`, dùng
 * luôn code đó làm điều kiện idempotency ở đây).
 */
async function seedZoneAndItems(
  app: INestApplicationContext,
  adminId: string,
  optionIds: Record<string, string>,
): Promise<{
  stagingShelfId: string;
  mainShelfId: string;
  itemIds: string[];
  supplierId: string;
} | null> {
  const locationService = app.get(LocationService);
  const stockService = app.get(StockService);
  const supplierService = app.get(SupplierService);

  const zones = await locationService.listZones();
  const existing = zones.find((z) => z.code === SEED_ZONE_CODE);
  if (existing) {
    logger.log('seed data đã tồn tại — bỏ qua toàn bộ zone/item/supplier');
    return null;
  }

  const zone = await locationService.createZone(
    { name: 'Khu A (seed)', code: SEED_ZONE_CODE },
    adminId,
  );
  const zoneId = zone._id.toString();

  const rack = await locationService.createRack(
    { zoneId, name: 'Kệ A1 (seed)', code: 'SEED-A1' },
    adminId,
  );
  const rackId = rack._id.toString();

  const stagingShelf = await locationService.createShelf(
    { rackId, level: 1, code: 'SEED-A1-STAGING', isStaging: true },
    adminId,
  );
  const mainShelf = await locationService.createShelf(
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
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL_TEA',
      attributeOptionIds: [
        optionIds['BLK'], // MATERIAL_TYPE: Trà đen
        optionIds['ORG'], // FLAVOR: Nguyên bản
        optionIds['500G'], // SPEC: 500g
      ],
      name: 'Nguyên liệu seed',
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
      type: ItemType.CUP_BLANK,
      templateId: 'CUP_BLANK',
      attributeOptionIds: [
        optionIds['HRT'], // CUP_STYLE
        optionIds['PET'], // MATERIAL
        optionIds['500'], // CAPACITY
        optionIds['CLR'], // COLOR
      ],
      name: 'Ly nhựa trơn seed',
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

  await supplierService.upsertSupplierItem(
    {
      itemId: material._id.toString(),
      supplierId,
      purchasePrice: 15000,
    },
    adminId,
  );
  await supplierService.upsertSupplierItem(
    {
      itemId: cupBlank._id.toString(),
      supplierId,
      purchasePrice: 3000,
    },
    adminId,
  );

  logger.log(
    `Zone seed: ${zoneId}, shelf staging: ${stagingShelf._id.toString()}, shelf chính: ${mainShelf._id.toString()}`,
  );

  return {
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
