import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { AppException } from '@app/common';
import { EcommerceModule } from '../ecommerce.module';
import { AuthService } from '../auth/auth.service';
import { CreateEcomManagerDto } from '../auth/dto/auth.dto';
import { UserRepository } from '../auth/repositories/user.repository';
import { CatalogService } from '../catalog/catalog.service';
import { CatalogRepository } from '../catalog/catalog.repository';
import { Category } from '../catalog/schemas/category.schema';
import { ProductStatus } from '../catalog/schemas/product.schema';
import { FulfillmentType } from '../catalog/schemas/product-variant.schema';

const logger = new Logger('SeedEcom');

const SEED_PASSWORD = 'Seed@12345';
const LEGACY_CUSTOM_PRINT_SKU = 'ECOM-CUP-CUSTOM-500';
const CUSTOM_PRINT_BLANK_SKU = 'CUP-HRT-PET-500-CLR';

const SEED_MANAGER: CreateEcomManagerDto = {
  email: 'seed_manager@ecom.local',
  password: SEED_PASSWORD,
  name: 'Seed Ecom Manager',
};

/**
 * Customer demo — tạo trực tiếp qua UserRepository (không qua AuthService.register)
 * để tránh phụ thuộc BullMQ/Redis gửi OTP xác thực email lúc seed; set thẳng
 * emailVerified: true vì đây là tài khoản demo, không cần luồng verify thật.
 */
const SEED_CUSTOMERS: {
  email: string;
  name: string;
  phone: string;
  address: {
    label: string;
    recipientName: string;
    phone: string;
    line: string;
    ward: string;
    district: string;
    province: string;
  };
}[] = [
  {
    email: 'seed_customer1@ecom.local',
    name: 'Nguyễn Thị Lan',
    phone: '0987654321',
    address: {
      label: 'Nhà riêng',
      recipientName: 'Nguyễn Thị Lan',
      phone: '0987654321',
      line: '12 Nguyễn Huệ',
      ward: 'Phường Bến Nghé',
      district: 'Quận 1',
      province: 'TP.HCM',
    },
  },
  {
    email: 'seed_customer2@ecom.local',
    name: 'Trần Văn Bình',
    phone: '0976543210',
    address: {
      label: 'Công ty',
      recipientName: 'Trần Văn Bình',
      phone: '0976543210',
      line: '200 Nguyễn Văn Cừ',
      ward: 'Phường 4',
      district: 'Quận 5',
      province: 'TP.HCM',
    },
  },
];

const SEED_CATEGORIES: { name: string; slug: string }[] = [
  { name: 'Ly nhựa in sẵn', slug: 'ly-nhua-in-san' },
  { name: 'Ly nhựa in theo yêu cầu', slug: 'ly-nhua-in-yeu-cau' },
  { name: 'Nguyên liệu pha chế', slug: 'nguyen-lieu-pha-che' },
  { name: 'Bao bì phụ kiện', slug: 'bao-bi-phu-kien' },
];

interface SeedVariantSpec {
  sku: string;
  attributes: Record<string, string>;
  price: number;
  availableQty: number;
  fulfillmentType?: FulfillmentType;
}

interface SeedProductSpec {
  name: string;
  slug: string;
  description: string;
  categorySlug: string;
  status: ProductStatus;
  variants: SeedVariantSpec[];
}

// SKU hàng thường vẫn dùng namespace ECOM-* của catalog. Riêng CUSTOM_PRINT
// phải trỏ đúng SKU CUP_BLANK do WMS quản lý để tạo lệnh in không mơ hồ.
const SEED_PRODUCTS: SeedProductSpec[] = [
  {
    name: 'Ly nhựa PET 500ml trong suốt (in sẵn)',
    slug: 'ly-nhua-pet-500ml-in-san',
    description:
      'Ly nhựa PET 500ml trong suốt, in sẵn mẫu hoa văn, bán theo thùng 1000 cái.',
    categorySlug: 'ly-nhua-in-san',
    status: ProductStatus.ACTIVE,
    variants: [
      {
        sku: 'ECOM-CUP-PET-500-HRT',
        attributes: { cupStyle: 'Trái tim', capacity: '500ml' },
        price: 3200000,
        availableQty: 40,
        fulfillmentType: FulfillmentType.STANDARD,
      },
      {
        sku: 'ECOM-CUP-PET-500-RND',
        attributes: { cupStyle: 'Trụ tròn', capacity: '500ml' },
        price: 3000000,
        availableQty: 25,
        fulfillmentType: FulfillmentType.STANDARD,
      },
    ],
  },
  {
    name: 'Ly nhựa PP 700ml trắng sữa (in sẵn)',
    slug: 'ly-nhua-pp-700ml-in-san',
    description:
      'Ly nhựa PP 700ml trắng sữa, in sẵn mẫu hoa văn, bán theo thùng 1000 cái.',
    categorySlug: 'ly-nhua-in-san',
    status: ProductStatus.ACTIVE,
    variants: [
      {
        sku: 'ECOM-CUP-PP-700-RND',
        attributes: { cupStyle: 'Trụ tròn', capacity: '700ml' },
        price: 3600000,
        availableQty: 18,
        fulfillmentType: FulfillmentType.STANDARD,
      },
    ],
  },
  {
    name: 'Ly nhựa in logo theo yêu cầu',
    slug: 'ly-nhua-in-logo-theo-yeu-cau',
    description:
      'Ly nhựa in logo/thiết kế riêng theo yêu cầu khách hàng — cần upload mẫu thiết kế (make-to-order, chỉ thanh toán online).',
    categorySlug: 'ly-nhua-in-yeu-cau',
    status: ProductStatus.ACTIVE,
    variants: [
      {
        sku: CUSTOM_PRINT_BLANK_SKU,
        attributes: { capacity: '500ml' },
        price: 3800000,
        availableQty: 0,
        fulfillmentType: FulfillmentType.CUSTOM_PRINT,
      },
    ],
  },
  {
    name: 'Trà đen nguyên bản',
    slug: 'tra-den-nguyen-ban',
    description: 'Trà đen nguyên bản dùng pha chế, đóng thùng 20kg.',
    categorySlug: 'nguyen-lieu-pha-che',
    status: ProductStatus.ACTIVE,
    variants: [
      {
        sku: 'ECOM-NL-TRA-DEN',
        attributes: { loai: 'Trà đen', quyCach: '20kg/thùng' },
        price: 350000,
        availableQty: 30,
        fulfillmentType: FulfillmentType.STANDARD,
      },
    ],
  },
  {
    name: 'Trân châu đen',
    slug: 'tran-chau-den',
    description: 'Trân châu đen dẻo dai, đóng thùng 10kg.',
    categorySlug: 'nguyen-lieu-pha-che',
    status: ProductStatus.ACTIVE,
    variants: [
      {
        sku: 'ECOM-NL-TRANCHAU-DEN',
        attributes: { loai: 'Trân châu đen', quyCach: '10kg/thùng' },
        price: 550000,
        availableQty: 20,
        fulfillmentType: FulfillmentType.STANDARD,
      },
    ],
  },
  {
    name: 'Ống hút nhựa tiêu chuẩn',
    slug: 'ong-hut-nhua-tieu-chuan',
    description: 'Ống hút nhựa tiêu chuẩn, đóng thùng 5000 cái.',
    categorySlug: 'bao-bi-phu-kien',
    status: ProductStatus.ACTIVE,
    variants: [
      {
        sku: 'ECOM-PKG-ONGHUT',
        attributes: { quyCach: '5000 cái/thùng' },
        price: 1100000,
        availableQty: 15,
        fulfillmentType: FulfillmentType.STANDARD,
      },
    ],
  },
  {
    name: 'Nắp ly nhựa in sẵn',
    slug: 'nap-ly-nhua-in-san',
    description:
      'Nắp ly nhựa in sẵn, đóng thùng 1000 cái. (Đang soạn thảo — chưa publish)',
    categorySlug: 'bao-bi-phu-kien',
    status: ProductStatus.DRAFT,
    variants: [
      {
        sku: 'ECOM-PKG-NAPLY',
        attributes: { quyCach: '1000 cái/thùng' },
        price: 1150000,
        availableQty: 10,
        fulfillmentType: FulfillmentType.STANDARD,
      },
    ],
  },
];

/**
 * Seed data cho demo/E2E: ECOM_MANAGER + customer mẫu + catalog (category/
 * product/variant). Idempotent — check-then-create theo unique field
 * (email/slug/sku) trước khi tạo, chạy lại không tạo trùng.
 */
export async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(EcommerceModule);
  try {
    await seedManager(app);
    await seedCustomers(app);
    // Bỏ qua seed sản phẩm mẫu để Ecommerce chỉ hiển thị sản phẩm đồng bộ thật từ WMS
    // await seedCatalog(app);
    logger.log('Seed hoàn tất.');
  } finally {
    await app.close();
  }
}

async function seedManager(app: INestApplicationContext): Promise<void> {
  const authService = app.get(AuthService);
  try {
    await authService.createEcomManager(SEED_MANAGER);
    logger.log(
      `Tạo ECOM_MANAGER: ${SEED_MANAGER.email} / ${SEED_MANAGER.password}`,
    );
  } catch (err) {
    if (err instanceof AppException && err.code === 'AUTH_EMAIL_CONFLICT') {
      logger.log(`${SEED_MANAGER.email} đã tồn tại — bỏ qua.`);
    } else {
      throw err;
    }
  }
}

async function seedCustomers(app: INestApplicationContext): Promise<void> {
  const userRepo = app.get(UserRepository);

  for (const c of SEED_CUSTOMERS) {
    const existing = await userRepo.findByEmail(c.email);
    if (existing) {
      logger.log(`${c.email} đã tồn tại — bỏ qua.`);
      continue;
    }
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
    const user = await userRepo.create({
      email: c.email,
      passwordHash,
      name: c.name,
      phone: c.phone,
      type: 'customer',
      emailVerified: true,
    });
    await userRepo.replaceAddresses(user._id, [
      { _id: new Types.ObjectId(), ...c.address, isDefault: true },
    ]);
    logger.log(`Tạo customer: ${c.email} / ${SEED_PASSWORD}`);
  }
}

async function seedCatalog(app: INestApplicationContext): Promise<void> {
  const catalogService = app.get(CatalogService);
  const catalogRepo = app.get(CatalogRepository);
  const categoryModel = app.get<Model<Category>>(getModelToken(Category.name));

  const slugToCategoryId: Record<string, string> = {};
  for (const cat of SEED_CATEGORIES) {
    const existing = await categoryModel.findOne({ slug: cat.slug }).exec();
    if (existing) {
      slugToCategoryId[cat.slug] = existing._id.toString();
      continue;
    }
    const created = await catalogService.createCategory({
      name: cat.name,
      slug: cat.slug,
    });
    slugToCategoryId[cat.slug] = created._id.toString();
    logger.log(`Tạo category: ${cat.name}`);
  }

  for (const p of SEED_PRODUCTS) {
    const categoryId = slugToCategoryId[p.categorySlug];
    let productId: string;
    const existingProduct = await catalogRepo.getProductBySlugAny(p.slug);
    if (existingProduct) {
      productId = existingProduct._id.toString();
      logger.log(`Sản phẩm ${p.slug} đã tồn tại — bỏ qua tạo mới.`);
    } else {
      const created = await catalogService.createProduct({
        name: p.name,
        slug: p.slug,
        description: p.description,
        categoryId,
        status: p.status,
      });
      productId = created._id.toString();
      logger.log(`Tạo product: ${p.name}`);
    }

    for (const v of p.variants) {
      if (
        v.fulfillmentType === FulfillmentType.CUSTOM_PRINT &&
        v.sku === CUSTOM_PRINT_BLANK_SKU
      ) {
        const currentVariant = await catalogRepo.findVariantBySkuAny(
          CUSTOM_PRINT_BLANK_SKU,
        );
        const legacyVariant = await catalogRepo.findVariantBySkuAny(
          LEGACY_CUSTOM_PRINT_SKU,
        );
        const canonicalData = {
          productId: new Types.ObjectId(productId),
          attributes: v.attributes,
          price: v.price,
          fulfillmentType: FulfillmentType.CUSTOM_PRINT,
          isActive: true,
        };

        if (currentVariant) {
          await catalogRepo.updateVariant(
            currentVariant._id.toString(),
            canonicalData,
          );
          if (
            legacyVariant &&
            legacyVariant._id.toString() !== currentVariant._id.toString()
          ) {
            await catalogRepo.updateVariant(legacyVariant._id.toString(), {
              isActive: false,
            });
          }
          logger.log(
            `Chuẩn hóa variant CUSTOM_PRINT về CUP_BLANK ${CUSTOM_PRINT_BLANK_SKU}.`,
          );
          continue;
        }

        if (legacyVariant) {
          await catalogRepo.updateVariant(legacyVariant._id.toString(), {
            ...canonicalData,
            sku: CUSTOM_PRINT_BLANK_SKU,
          });
          logger.log(
            `Migrate variant CUSTOM_PRINT ${LEGACY_CUSTOM_PRINT_SKU} -> ${CUSTOM_PRINT_BLANK_SKU}.`,
          );
          continue;
        }
      }

      const existingVariant = await catalogRepo.findVariantBySkuAny(v.sku);
      if (existingVariant) {
        logger.log(`Variant ${v.sku} đã tồn tại — bỏ qua.`);
        continue;
      }
      const createdVariant = await catalogService.createVariant({
        sku: v.sku,
        productId,
        attributes: v.attributes,
        price: v.price,
        fulfillmentType: v.fulfillmentType,
        isActive: true,
      });
      await catalogRepo.updateVariant(createdVariant._id.toString(), {
        availableQty: v.availableQty,
      });
      logger.log(`Tạo variant: ${v.sku}`);
    }
  }
}

if (require.main === module) {
  seed().catch((err: unknown) => {
    logger.error('Seed thất bại:', err);
    process.exit(1);
  });
}
