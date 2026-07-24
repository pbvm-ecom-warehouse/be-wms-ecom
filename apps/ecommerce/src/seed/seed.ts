import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppException } from '@app/common';
import { EcommerceModule } from '../ecommerce.module';
import { AuthService } from '../auth/auth.service';
import { CreateEcomManagerDto } from '../auth/dto/auth.dto';

const logger = new Logger('SeedEcom');

const SEED_MANAGER: CreateEcomManagerDto = {
  email: 'seed_manager@ecom.local',
  password: 'Seed@12345',
  name: 'Seed Ecom Manager',
};

/**
 * Seed 1 ECOM_MANAGER cho demo/E2E. Idempotent: createEcomManager tự throw
 * AUTH_EMAIL_CONFLICT nếu email đã tồn tại — bắt đúng code đó và bỏ qua,
 * mọi lỗi khác thì ném lại (không nuốt lỗi thật).
 */
export async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(EcommerceModule);
  try {
    const authService = app.get(AuthService);
    try {
      await authService.createEcomManager(SEED_MANAGER);
      logger.log(
        `Tạo ECOM_MANAGER: ${SEED_MANAGER.email} / ${SEED_MANAGER.password}`,
      );
    } catch (err) {
      if (
        err instanceof AppException &&
        err.code === 'AUTH_EMAIL_CONFLICT'
      ) {
        logger.log(`${SEED_MANAGER.email} đã tồn tại — bỏ qua.`);
      } else {
        throw err;
      }
    }
    logger.log('Seed hoàn tất.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  seed().catch((err: unknown) => {
    logger.error('Seed thất bại:', err);
    process.exit(1);
  });
}
