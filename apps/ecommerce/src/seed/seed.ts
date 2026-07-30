import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { AppException } from '@app/common';
import { EcommerceModule } from '../ecommerce.module';
import { AuthService } from '../auth/auth.service';
import { CreateEcomManagerDto } from '../auth/dto/auth.dto';

const logger = new Logger('SeedEcom');

const SEED_PASSWORD = 'Seed@12345';

const SEED_MANAGER: CreateEcomManagerDto = {
  email: 'seed_manager@ecom.local',
  password: SEED_PASSWORD,
  name: 'Seed Ecom Manager',
};

/**
 * Seed data cho demo/E2E: chỉ tạo ECOM_MANAGER. Idempotent — bỏ qua nếu email
 * đã tồn tại, chạy lại không tạo trùng.
 */
export async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(EcommerceModule);
  try {
    await seedManager(app);
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

if (require.main === module) {
  seed().catch((err: unknown) => {
    logger.error('Seed thất bại:', err);
    process.exit(1);
  });
}
