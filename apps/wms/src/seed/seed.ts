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
import { AisleType } from '../location/schemas/aisle.schema';
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
  { key: AttributeOptionKey.CUP_STYLE, name: 'Trụ tròn', code: 'RND' },
  { key: AttributeOptionKey.MATERIAL, name: 'Nhựa PET', code: 'PET' },
  { key: AttributeOptionKey.MATERIAL, name: 'Nhựa PP', code: 'PP' },
  { key: AttributeOptionKey.CAPACITY, name: '500ml', code: '500' },
  { key: AttributeOptionKey.CAPACITY, name: '700ml', code: '700' },
  { key: AttributeOptionKey.COLOR, name: 'Trong suốt', code: 'CLR' },
  { key: AttributeOptionKey.COLOR, name: 'Trắng sữa', code: 'WHT' },
  { key: AttributeOptionKey.MATERIAL_TYPE, name: 'Trà đen', code: 'BLK' },
  { key: AttributeOptionKey.MATERIAL_TYPE, name: 'Trà xanh', code: 'GRN' },
  {
    key: AttributeOptionKey.MATERIAL_TYPE,
    name: 'Đường trắng',
    code: 'WHITE_SUGAR',
  },
  {
    key: AttributeOptionKey.MATERIAL_TYPE,
    name: 'Sữa tươi',
    code: 'FRESH_MILK',
  },
  {
    key: AttributeOptionKey.MATERIAL_TYPE,
    name: 'Sữa đặc',
    code: 'CONDENSED_MILK',
  },
  {
    key: AttributeOptionKey.MATERIAL_TYPE,
    name: 'Trân châu đen',
    code: 'PEARL',
  },
  {
    key: AttributeOptionKey.MATERIAL_TYPE,
    name: 'Topping trái cây',
    code: 'FRUIT_TOPPING',
  },
  {
    key: AttributeOptionKey.MATERIAL_TYPE,
    name: 'Bột pha chế',
    code: 'MIX_POWDER',
  },
  {
    key: AttributeOptionKey.MATERIAL_TYPE,
    name: 'Syrup đường đen',
    code: 'BROWN_SYRUP',
  },
  { key: AttributeOptionKey.FLAVOR, name: 'Nguyên bản', code: 'ORG' },
  { key: AttributeOptionKey.FLAVOR, name: 'Vị đào', code: 'PEACH' },
  { key: AttributeOptionKey.FLAVOR, name: 'Vị dâu', code: 'STRAWBERRY' },
  { key: AttributeOptionKey.SPEC, name: '500g', code: '500G' },
  { key: AttributeOptionKey.SPEC, name: '1kg', code: '1KG' },
  { key: AttributeOptionKey.SPEC, name: '1 lít', code: '1L' },
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

  // Chừa 2m phía trên zone làm lối đi (aisle) để access point của rack nối
  // được vào — validateLayout (warehouse-layout.validator.ts) chặn rack
  // không có access point nằm trong 1 aisle nào (RACK_ACCESS_POINT_NOT_CONNECTED).
  const zone = await locationService.createZone(
    {
      name: 'Khu A (seed)',
      code: SEED_ZONE_CODE,
      xM: 0,
      yM: 2,
      widthM: 20,
      heightM: 10,
    },
    adminId,
  );
  const zoneId = zone._id.toString();

  await locationService.createAisle(
    {
      code: 'SEED-AISLE-A1',
      type: AisleType.MAIN,
      xM: 0,
      yM: 0,
      widthM: 20,
      heightM: 2,
    },
    adminId,
  );

  // RackTemplate mặc định widthM:10/depthM:1.5 (rack-template.schema.ts) — đặt
  // rack sát mép trên zone (yM:2) và access point ngay phía trên nó (yM:1),
  // nằm trong aisle vừa tạo (y: 0 → 2).
  const rack = await locationService.createRack(
    {
      zoneId,
      name: 'Kệ A1 (seed)',
      code: 'SEED-A1',
      xM: 0,
      yM: 2,
      accessPointXM: 5,
      accessPointYM: 1,
    },
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

  // Đơn vị cơ sở seed để mặc định là "thùng" — khớp thói quen mua/nhập hàng
  // thực tế (đặt NCC theo thùng), altUnits khai "cái"/"kg"/"g"/"ml" lẻ để vẫn
  // quy đổi được khi cần xuất/kiểm lẻ dưới 1 thùng.
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
      unit: 'thùng',
      altUnits: [{ unit: 'kg', factor: 20 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 40,
      width: 30,
      height: 30,
    },
    adminId,
  );
  const teaGreen = await stockService.createWarehouseItem(
    {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['TEA'], // MATERIAL_CATEGORY: Trà
        optionIds['GRN'], // MATERIAL_TYPE: Trà xanh
        optionIds['ORG'], // FLAVOR: Nguyên bản
        optionIds['500G'], // SPEC: 500g
      ],
      name: 'Trà xanh nguyên bản (nhập khẩu)',
      unit: 'thùng',
      altUnits: [{ unit: 'kg', factor: 20 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 40,
      width: 30,
      height: 30,
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
      unit: 'thùng',
      altUnits: [{ unit: 'cái', factor: 1000 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 50,
      width: 40,
      height: 60,
    },
    adminId,
  );
  const cupBlank700 = await stockService.createWarehouseItem(
    {
      type: ItemType.CUP_BLANK,
      templateId: 'CUP_BLANK',
      attributeOptionIds: [
        optionIds['RND'], // CUP_STYLE
        optionIds['PP'], // MATERIAL
        optionIds['700'], // CAPACITY
        optionIds['WHT'], // COLOR
      ],
      name: 'Ly nhựa PP 700ml trắng sữa',
      unit: 'thùng',
      altUnits: [{ unit: 'cái', factor: 1000 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 50,
      width: 40,
      height: 65,
    },
    adminId,
  );
  const sugar = await stockService.createWarehouseItem(
    {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['SUGAR'], // MATERIAL_CATEGORY: Đường
        optionIds['WHITE_SUGAR'], // MATERIAL_TYPE: Đường trắng
        optionIds['1KG'], // SPEC: 1kg
      ],
      name: 'Đường trắng tinh luyện',
      unit: 'thùng',
      altUnits: [{ unit: 'kg', factor: 25 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 40,
      width: 30,
      height: 30,
    },
    adminId,
  );
  const freshMilk = await stockService.createWarehouseItem(
    {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['MILK'], // MATERIAL_CATEGORY: Sữa
        optionIds['FRESH_MILK'], // MATERIAL_TYPE: Sữa tươi
        optionIds['1L'], // SPEC: 1 lít
      ],
      name: 'Sữa tươi không đường',
      unit: 'thùng',
      altUnits: [{ unit: 'lít', factor: 12 }],
      isPerishable: true,
      nearExpiryDays: 15,
      minQuantity: 3,
      depth: 30,
      width: 25,
      height: 25,
    },
    adminId,
  );
  const condensedMilk = await stockService.createWarehouseItem(
    {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['MILK'], // MATERIAL_CATEGORY: Sữa
        optionIds['CONDENSED_MILK'], // MATERIAL_TYPE: Sữa đặc
        optionIds['500G'], // SPEC: 500g
      ],
      name: 'Sữa đặc có đường',
      unit: 'thùng',
      altUnits: [{ unit: 'lon', factor: 24 }],
      isPerishable: true,
      nearExpiryDays: 30,
      minQuantity: 2,
      depth: 30,
      width: 25,
      height: 20,
    },
    adminId,
  );
  const brownSyrup = await stockService.createWarehouseItem(
    {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['SYRUP'], // MATERIAL_CATEGORY: Syrup
        optionIds['BROWN_SYRUP'], // MATERIAL_TYPE: Syrup đường đen
        optionIds['1L'], // SPEC: 1 lít
      ],
      name: 'Syrup đường đen',
      unit: 'thùng',
      altUnits: [{ unit: 'chai', factor: 12 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 30,
      width: 25,
      height: 25,
    },
    adminId,
  );
  const pearlTopping = await stockService.createWarehouseItem(
    {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['TOPPING'], // MATERIAL_CATEGORY: Topping
        optionIds['PEARL'], // MATERIAL_TYPE: Trân châu đen
        optionIds['1KG'], // SPEC: 1kg
      ],
      name: 'Trân châu đen',
      unit: 'thùng',
      altUnits: [{ unit: 'kg', factor: 10 }],
      isPerishable: true,
      nearExpiryDays: 60,
      minQuantity: 2,
      depth: 35,
      width: 30,
      height: 25,
    },
    adminId,
  );
  const peachTopping = await stockService.createWarehouseItem(
    {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['TOPPING'], // MATERIAL_CATEGORY: Topping
        optionIds['FRUIT_TOPPING'], // MATERIAL_TYPE: Topping trái cây
        optionIds['PEACH'], // FLAVOR: Vị đào
        optionIds['1KG'], // SPEC: 1kg
      ],
      name: 'Topping đào miếng',
      unit: 'thùng',
      altUnits: [{ unit: 'kg', factor: 10 }],
      isPerishable: true,
      nearExpiryDays: 90,
      minQuantity: 2,
      depth: 35,
      width: 30,
      height: 25,
    },
    adminId,
  );
  const mixPowder = await stockService.createWarehouseItem(
    {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL',
      attributeOptionIds: [
        optionIds['POWDER'], // MATERIAL_CATEGORY: Bột
        optionIds['MIX_POWDER'], // MATERIAL_TYPE: Bột pha chế
        optionIds['STRAWBERRY'], // FLAVOR: Vị dâu
        optionIds['1KG'], // SPEC: 1kg
      ],
      name: 'Bột pha chế vị dâu',
      unit: 'thùng',
      altUnits: [{ unit: 'kg', factor: 10 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 35,
      width: 30,
      height: 25,
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
      unit: 'thùng',
      altUnits: [{ unit: 'cái', factor: 5000 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 30,
      width: 20,
      height: 40,
    },
    adminId,
  );
  const paperBag = await stockService.createWarehouseItem(
    {
      type: ItemType.PACKAGING,
      templateId: 'PACKAGING',
      attributeOptionIds: [
        optionIds['BAG'], // PACKAGING_CATEGORY: Túi
      ],
      name: 'Túi giấy đựng đồ uống',
      unit: 'thùng',
      altUnits: [{ unit: 'cái', factor: 1000 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 40,
      width: 30,
      height: 30,
    },
    adminId,
  );
  const paperBox = await stockService.createWarehouseItem(
    {
      type: ItemType.PACKAGING,
      templateId: 'PACKAGING',
      attributeOptionIds: [
        optionIds['BOX'], // PACKAGING_CATEGORY: Hộp
      ],
      name: 'Hộp giấy đựng đồ uống',
      unit: 'thùng',
      altUnits: [{ unit: 'cái', factor: 500 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 40,
      width: 30,
      height: 30,
    },
    adminId,
  );
  const cupLid = await stockService.createWarehouseItem(
    {
      type: ItemType.PACKAGING,
      templateId: 'PACKAGING',
      attributeOptionIds: [
        optionIds['LID'], // PACKAGING_CATEGORY: Nắp ly
      ],
      name: 'Nắp ly nhựa in sẵn',
      unit: 'thùng',
      altUnits: [{ unit: 'cái', factor: 1000 }],
      isPerishable: false,
      minQuantity: 2,
      depth: 40,
      width: 30,
      height: 25,
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
      code: 'NCC-TTN-001',
      name: 'Công ty TNHH Trà Thái Nguyên',
      contactName: 'Nguyễn Văn An',
      phone: '0901234567',
      email: 'kinhdoanh@trathainguyen.vn',
      address: '123 Lê Văn Lương, Quận 7, TP.HCM',
      taxCode: '0300123456',
      note: 'Cung cấp nguyên liệu trà các loại',
    },
    {
      code: 'NCC-VTH-001',
      name: 'Công ty CP Bao Bì Việt Thành',
      contactName: 'Trần Thị Bích',
      phone: '0912345678',
      email: 'sales@vietthanhpack.com',
      address: '45 Nguyễn Văn Linh, Quận 7, TP.HCM',
      taxCode: '0301987654',
      note: 'Cung cấp bao bì, ống hút, hộp giấy',
    },
    {
      code: 'NCC-DDT-001',
      name: 'Công ty TNHH Nhựa Đại Đồng Tiến',
      contactName: 'Lê Hoàng Cường',
      phone: '0913456789',
      email: 'contact@daidongtien.com.vn',
      address: '89 Tân Kỳ Tân Quý, Tân Phú, TP.HCM',
      taxCode: '0302345678',
      note: 'Sản xuất ly nhựa, cốc nhựa PET/PP',
    },
    {
      code: 'NCC-TTP-001',
      name: 'Công ty CP Đường Tân Thịnh Phát',
      contactName: 'Phạm Thị Dung',
      phone: '0914567890',
      email: 'order@tanthinhphat-sugar.vn',
      address: '01 Đường 3/2, Biên Hòa, Đồng Nai',
      taxCode: '3600456789',
      note: 'Cung cấp đường tinh luyện các loại',
    },
    {
      code: 'NCC-NTX-001',
      name: 'Công ty TNHH Sữa Nông Trại Xanh',
      contactName: 'Hoàng Văn Em',
      phone: '0915678901',
      email: 'b2b@nongtraixanhmilk.vn',
      address: '10 Tân Trào, Quận 7, TP.HCM',
      taxCode: '0300588569',
      note: 'Cung cấp sữa tươi, sữa đặc, kem béo',
    },
    {
      code: 'NCC-ACF-001',
      name: 'Công ty TNHH Hương Liệu Á Châu',
      contactName: 'Vũ Thị Phương',
      phone: '0916789012',
      email: 'info@achauflavor.com',
      address: '22 Phan Văn Trị, Gò Vấp, TP.HCM',
      taxCode: '0303456789',
      note: 'Cung cấp syrup, hương liệu, topping',
    },
    {
      code: 'NCC-PN-001',
      name: 'Công ty CP Giấy Bao Bì Phương Nam',
      contactName: 'Đặng Văn Giang',
      phone: '0917890123',
      email: 'sales@phuongnampaper.com',
      address: '15 Nguyễn Thị Minh Khai, Quận 1, TP.HCM',
      taxCode: '0301234567',
      note: 'Cung cấp túi giấy, hộp giấy đựng đồ uống',
    },
    {
      code: 'NCC-MN-001',
      name: 'Công ty TNHH Bột Thực Phẩm Miền Nam',
      contactName: 'Bùi Thị Hoa',
      phone: '0918901234',
      email: 'contact@mnfoodpowder.vn',
      address: '77 Quốc lộ 1A, Bình Tân, TP.HCM',
      taxCode: '0304567890',
      note: 'Cung cấp bột trân châu, bột pha chế',
    },
    {
      code: 'NCC-MP-001',
      name: 'Công ty CP Cơ Khí In Ấn Minh Phát',
      contactName: 'Ngô Văn Inh',
      phone: '0919012345',
      email: 'inanh@minhphat.com.vn',
      address: '33 Lũy Bán Bích, Tân Phú, TP.HCM',
      taxCode: '0305678901',
      note: 'Cung cấp nắp ly, tem nhãn in sẵn',
    },
    {
      code: 'NCC-KL-001',
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
  const [
    trathainguyenId, // NCC-TTN-001 — trà
    vietthanhId, // NCC-VTH-001 — bao bì/ống hút/hộp giấy
    daidongtienId, // NCC-DDT-001 — ly nhựa
    tanthinhphatId, // NCC-TTP-001 — đường
    nongtraixanhId, // NCC-NTX-001 — sữa
    achauId, // NCC-ACF-001 — syrup/hương liệu/topping
    phuongnamId, // NCC-PN-001 — túi giấy/hộp giấy
    mienNamId, // NCC-MN-001 — bột trân châu/bột pha chế
    minhphatId, // NCC-MP-001 — nắp ly/tem nhãn
    kimlongId, // NCC-KL-001 — nhập khẩu trà/topping
  ] = supplierIds;

  // supplierItemCode: PPPP-XXX — đơn vị mua mặc định là "thùng" (SEED_SUPPLIERS
  // note khớp lĩnh vực từng NCC), purchasePrice tính theo giá 1 thùng.
  const SEED_SUPPLIER_ITEMS: {
    itemId: string;
    supplierId: string;
    supplierItemCode: string;
    purchasePrice: number;
    leadTimeDays: number;
    minOrderQty: number;
  }[] = [
    {
      itemId: material._id.toString(),
      supplierId: trathainguyenId,
      supplierItemCode: 'NL-TRA-DEN-THUNG20KG',
      purchasePrice: 280000,
      leadTimeDays: 3,
      minOrderQty: 2,
    },
    {
      itemId: teaGreen._id.toString(),
      supplierId: kimlongId,
      supplierItemCode: 'NK-TRA-XANH-THUNG20KG',
      purchasePrice: 320000,
      leadTimeDays: 10,
      minOrderQty: 2,
    },
    {
      itemId: cupBlank._id.toString(),
      supplierId: daidongtienId,
      supplierItemCode: 'LY-PET-500ML-THUNG1000',
      purchasePrice: 2800000,
      leadTimeDays: 5,
      minOrderQty: 2,
    },
    {
      itemId: cupBlank700._id.toString(),
      supplierId: daidongtienId,
      supplierItemCode: 'LY-PP-700ML-THUNG1000',
      purchasePrice: 3200000,
      leadTimeDays: 5,
      minOrderQty: 2,
    },
    {
      itemId: sugar._id.toString(),
      supplierId: tanthinhphatId,
      supplierItemCode: 'DUONG-THUNG25KG',
      purchasePrice: 300000,
      leadTimeDays: 2,
      minOrderQty: 2,
    },
    {
      itemId: freshMilk._id.toString(),
      supplierId: nongtraixanhId,
      supplierItemCode: 'SUA-TUOI-THUNG12L',
      purchasePrice: 240000,
      leadTimeDays: 2,
      minOrderQty: 3,
    },
    {
      itemId: condensedMilk._id.toString(),
      supplierId: nongtraixanhId,
      supplierItemCode: 'SUA-DAC-THUNG24LON',
      purchasePrice: 360000,
      leadTimeDays: 2,
      minOrderQty: 2,
    },
    {
      itemId: brownSyrup._id.toString(),
      supplierId: achauId,
      supplierItemCode: 'SYRUP-DDEN-THUNG12CHAI',
      purchasePrice: 420000,
      leadTimeDays: 4,
      minOrderQty: 2,
    },
    {
      itemId: peachTopping._id.toString(),
      supplierId: achauId,
      supplierItemCode: 'TOPPING-DAO-THUNG10KG',
      purchasePrice: 500000,
      leadTimeDays: 4,
      minOrderQty: 2,
    },
    {
      itemId: pearlTopping._id.toString(),
      supplierId: mienNamId,
      supplierItemCode: 'TRANCHAU-DEN-THUNG10KG',
      purchasePrice: 450000,
      leadTimeDays: 3,
      minOrderQty: 2,
    },
    {
      itemId: mixPowder._id.toString(),
      supplierId: mienNamId,
      supplierItemCode: 'BOT-PHACHE-DAU-THUNG10KG',
      purchasePrice: 480000,
      leadTimeDays: 3,
      minOrderQty: 2,
    },
    {
      itemId: straw._id.toString(),
      supplierId: vietthanhId,
      supplierItemCode: 'ONGHUT-THUNG5000',
      purchasePrice: 900000,
      leadTimeDays: 7,
      minOrderQty: 2,
    },
    {
      itemId: paperBag._id.toString(),
      supplierId: phuongnamId,
      supplierItemCode: 'TUIGIAY-THUNG1000',
      purchasePrice: 1200000,
      leadTimeDays: 5,
      minOrderQty: 2,
    },
    {
      itemId: paperBox._id.toString(),
      supplierId: phuongnamId,
      supplierItemCode: 'HOPGIAY-THUNG500',
      purchasePrice: 850000,
      leadTimeDays: 5,
      minOrderQty: 2,
    },
    {
      itemId: cupLid._id.toString(),
      supplierId: minhphatId,
      supplierItemCode: 'NAPLY-INSAN-THUNG1000',
      purchasePrice: 950000,
      leadTimeDays: 6,
      minOrderQty: 2,
    },
  ];

  for (const supplierItem of SEED_SUPPLIER_ITEMS) {
    await supplierService.upsertSupplierItem(supplierItem, adminId);
  }

  logger.log(
    `Zone seed: ${zoneId}, shelf staging: ${stagingShelf._id.toString()}, shelf chính: ${mainShelf._id.toString()}`,
  );

  return {
    stagingShelfId: stagingShelf._id.toString(),
    mainShelfId: mainShelf._id.toString(),
    itemIds: [
      material._id.toString(),
      teaGreen._id.toString(),
      cupBlank._id.toString(),
      cupBlank700._id.toString(),
      sugar._id.toString(),
      freshMilk._id.toString(),
      condensedMilk._id.toString(),
      brownSyrup._id.toString(),
      pearlTopping._id.toString(),
      peachTopping._id.toString(),
      mixPowder._id.toString(),
      straw._id.toString(),
      paperBag._id.toString(),
      paperBox._id.toString(),
      cupLid._id.toString(),
    ],
    supplierId: trathainguyenId,
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
