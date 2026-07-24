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
  { key: AttributeOptionKey.MATERIAL_TYPE, name: 'Đường trắng', code: 'WHT' },
  { key: AttributeOptionKey.FLAVOR, name: 'Nguyên bản', code: 'ORG' },
  { key: AttributeOptionKey.SPEC, name: '500g', code: '500G' },
  // Category value — code phải khớp SkuTemplate.category trong
  // sku-template.registry.ts (AttributeOptionService.create validate điều
  // này), thiếu thì bước chọn category khi tạo item MATERIAL/PACKAGING sẽ rỗng.
  { key: AttributeOptionKey.MATERIAL_CATEGORY, name: 'Trà', code: 'TEA' },
  { key: AttributeOptionKey.MATERIAL_CATEGORY, name: 'Sữa', code: 'MILK' },
  { key: AttributeOptionKey.MATERIAL_CATEGORY, name: 'Đường', code: 'SUGAR' },
  {
    key: AttributeOptionKey.MATERIAL_CATEGORY,
    name: 'Topping',
    code: 'TOPPING',
  },
  { key: AttributeOptionKey.MATERIAL_CATEGORY, name: 'Syrup', code: 'SYRUP' },
  { key: AttributeOptionKey.MATERIAL_CATEGORY, name: 'Bột', code: 'POWDER' },
  { key: AttributeOptionKey.PACKAGING_CATEGORY, name: 'Nắp ly', code: 'LID' },
  {
    key: AttributeOptionKey.PACKAGING_CATEGORY,
    name: 'Ống hút',
    code: 'STRAW',
  },
  { key: AttributeOptionKey.PACKAGING_CATEGORY, name: 'Túi', code: 'BAG' },
  { key: AttributeOptionKey.PACKAGING_CATEGORY, name: 'Hộp', code: 'BOX' },
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
 * Seed option thuộc tính để seedWarehouseAndItems build được SKU qua template
 * thật (issue #25), cộng với toàn bộ category value (MATERIAL_CATEGORY/
 * PACKAGING_CATEGORY) mà sku-template.registry.ts cần — thiếu category value
 * nào thì bước chọn category khi tạo item MATERIAL/PACKAGING qua UI sẽ rỗng
 * cho category đó. Idempotent qua unique {key, code} —
 * AttributeOptionService.create tự throw STOCK_ATTRIBUTE_CODE_CONFLICT nếu đã
 * tồn tại, bắt và bỏ qua (không phải lỗi seed, là trạng thái mong đợi khi seed
 * chạy lại).
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
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['TEA'], // MATERIAL_CATEGORY: Trà
        optionIds['BLK'], // MATERIAL_TYPE: Trà đen
        optionIds['ORG'], // FLAVOR: Nguyên bản
        optionIds['500G'], // SPEC: 500g
      ],
      name: 'Trà đen nguyên bản',
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
      name: 'Ly nhựa PET 500ml trong suốt',
      unit: 'cái',
      isPerishable: false,
      minQuantity: 20,
      depth: 8,
      width: 8,
      height: 15,
    },
    adminId,
  );
  const sugar = await stockService.createWarehouseItem(
    {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['SUGAR'], // MATERIAL_CATEGORY: Đường
        optionIds['WHT'], // MATERIAL_TYPE: Đường trắng
        optionIds['500G'], // SPEC: 500g
      ],
      name: 'Đường trắng tinh luyện',
      unit: 'kg',
      isPerishable: false,
      minQuantity: 15,
      depth: 10,
      width: 8,
      height: 12,
    },
    adminId,
  );
  const straw = await stockService.createWarehouseItem(
    {
      type: ItemType.PACKAGING,
      templateId: 'PACKAGING',
      attributeOptionIds: [
        optionIds['STRAW'], // PACKAGING_CATEGORY: Ống hút
      ],
      name: 'Ống hút nhựa tiêu chuẩn',
      unit: 'cái',
      isPerishable: false,
      minQuantity: 50,
      depth: 1,
      width: 1,
      height: 20,
    },
    adminId,
  );

  const SEED_SUPPLIERS: {
    code: string;
    name: string;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    taxCode: string;
    note: string;
  }[] = [
    {
      code: 'SEED-NCC-001',
      name: 'Công ty TNHH Trà Thái Nguyên',
      contactName: 'Nguyễn Văn An',
      phone: '0901234567',
      email: 'kinhdoanh@trathainguyen.vn',
      address: '123 Lê Văn Lương, Quận 7, TP.HCM',
      taxCode: '0300123456',
      note: 'Cung cấp nguyên liệu trà các loại',
    },
    {
      code: 'SEED-NCC-002',
      name: 'Công ty CP Bao Bì Việt Thành',
      contactName: 'Trần Thị Bích',
      phone: '0912345678',
      email: 'sales@vietthanhpack.com',
      address: '45 Nguyễn Văn Linh, Quận 7, TP.HCM',
      taxCode: '0301987654',
      note: 'Cung cấp bao bì, ống hút, hộp giấy',
    },
    {
      code: 'SEED-NCC-003',
      name: 'Công ty TNHH Nhựa Đại Đồng Tiến',
      contactName: 'Lê Hoàng Cường',
      phone: '0913456789',
      email: 'contact@daidongtien.com.vn',
      address: '89 Tân Kỳ Tân Quý, Tân Phú, TP.HCM',
      taxCode: '0302345678',
      note: 'Sản xuất ly nhựa, cốc nhựa PET/PP',
    },
    {
      code: 'SEED-NCC-004',
      name: 'Công ty CP Đường Tân Thịnh Phát',
      contactName: 'Phạm Thị Dung',
      phone: '0914567890',
      email: 'order@tanthinhphat-sugar.vn',
      address: '01 Đường 3/2, Biên Hòa, Đồng Nai',
      taxCode: '3600456789',
      note: 'Cung cấp đường tinh luyện các loại',
    },
    {
      code: 'SEED-NCC-005',
      name: 'Công ty TNHH Sữa Nông Trại Xanh',
      contactName: 'Hoàng Văn Em',
      phone: '0915678901',
      email: 'b2b@nongtraixanhmilk.vn',
      address: '10 Tân Trào, Quận 7, TP.HCM',
      taxCode: '0300588569',
      note: 'Cung cấp sữa tươi, sữa đặc, kem béo',
    },
    {
      code: 'SEED-NCC-006',
      name: 'Công ty TNHH Hương Liệu Á Châu',
      contactName: 'Vũ Thị Phương',
      phone: '0916789012',
      email: 'info@achauflavor.com',
      address: '22 Phan Văn Trị, Gò Vấp, TP.HCM',
      taxCode: '0303456789',
      note: 'Cung cấp syrup, hương liệu, topping',
    },
    {
      code: 'SEED-NCC-007',
      name: 'Công ty CP Giấy Bao Bì Phương Nam',
      contactName: 'Đặng Văn Giang',
      phone: '0917890123',
      email: 'sales@phuongnampaper.com',
      address: '15 Nguyễn Thị Minh Khai, Quận 1, TP.HCM',
      taxCode: '0301234567',
      note: 'Cung cấp túi giấy, hộp giấy đựng đồ uống',
    },
    {
      code: 'SEED-NCC-008',
      name: 'Công ty TNHH Bột Thực Phẩm Miền Nam',
      contactName: 'Bùi Thị Hoa',
      phone: '0918901234',
      email: 'contact@mnfoodpowder.vn',
      address: '77 Quốc lộ 1A, Bình Tân, TP.HCM',
      taxCode: '0304567890',
      note: 'Cung cấp bột trân châu, bột pha chế',
    },
    {
      code: 'SEED-NCC-009',
      name: 'Công ty CP Cơ Khí In Ấn Minh Phát',
      contactName: 'Ngô Văn Inh',
      phone: '0919012345',
      email: 'inanh@minhphat.com.vn',
      address: '33 Lũy Bán Bích, Tân Phú, TP.HCM',
      taxCode: '0305678901',
      note: 'Cung cấp nắp ly, tem nhãn in sẵn',
    },
    {
      code: 'SEED-NCC-010',
      name: 'Công ty TNHH Xuất Nhập Khẩu Kim Long',
      contactName: 'Đỗ Thị Kim',
      phone: '0920123456',
      email: 'xnk@kimlongimex.vn',
      address: '5 Điện Biên Phủ, Bình Thạnh, TP.HCM',
      taxCode: '0306789012',
      note: 'Nhập khẩu nguyên liệu trà, topping từ Đài Loan',
    },
  ];

  const supplierIds: string[] = [];
  for (const s of SEED_SUPPLIERS) {
    const supplier = await supplierService.createSupplier(s, adminId);
    supplierIds.push(supplier._id.toString());
  }
  const [supplierId, supplier2Id] = supplierIds;

  await supplierService.upsertSupplierItem(
    {
      itemId: material._id.toString(),
      supplierId,
      supplierItemCode: 'NL-TRA-DEN-500G',
      purchasePrice: 15000,
      leadTimeDays: 3,
      minOrderQty: 20,
    },
    adminId,
  );
  await supplierService.upsertSupplierItem(
    {
      itemId: cupBlank._id.toString(),
      supplierId: supplierIds[2],
      supplierItemCode: 'LY-TRON-500ML',
      purchasePrice: 3000,
      leadTimeDays: 5,
      minOrderQty: 100,
    },
    adminId,
  );
  await supplierService.upsertSupplierItem(
    {
      itemId: sugar._id.toString(),
      supplierId: supplierIds[3],
      supplierItemCode: 'DUONG-500G',
      purchasePrice: 12000,
      leadTimeDays: 2,
      minOrderQty: 30,
    },
    adminId,
  );
  await supplierService.upsertSupplierItem(
    {
      itemId: straw._id.toString(),
      supplierId: supplier2Id,
      supplierItemCode: 'ONGHUT-STD',
      purchasePrice: 200,
      leadTimeDays: 7,
      minOrderQty: 500,
    },
    adminId,
  );

  logger.log(
    `Zone seed: ${zoneId}, shelf staging: ${stagingShelf._id.toString()}, shelf chính: ${mainShelf._id.toString()}`,
  );

  return {
    stagingShelfId: stagingShelf._id.toString(),
    mainShelfId: mainShelf._id.toString(),
    itemIds: [
      material._id.toString(),
      cupBlank._id.toString(),
      sugar._id.toString(),
      straw._id.toString(),
    ],
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
