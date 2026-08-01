import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { AppException } from '@app/common';
import { EcommerceModule } from '../ecommerce.module';
import { AuthService } from '../auth/auth.service';
import { CreateEcomManagerDto } from '../auth/dto/auth.dto';
import { UserRepository } from '../auth/repositories/user.repository';

const logger = new Logger('SeedEcom');

const SEED_PASSWORD = 'Seed@12345';

const SEED_MANAGER: CreateEcomManagerDto = {
  email: 'seed_manager@ecom.local',
  password: SEED_PASSWORD,
  name: 'Seed Ecom Manager',
};

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
];

/**
 * Seed data cho demo/E2E: tạo ECOM_MANAGER và customer mẫu.
 */
export async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(EcommerceModule);
  try {
    await seedManager(app);
    await seedCustomers(app);
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

if (require.main === module) {
  seed().catch((err: unknown) => {
    logger.error('Seed thất bại:', err);
    process.exit(1);
  });
}
