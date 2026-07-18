import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WmsRole } from '@app/auth';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from '../auth/dto/auth.dto';
import { User } from '../auth/schemas/user.schema';

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
    await seedUsers(app);
    logger.log('Seed hoàn tất.');
  } finally {
    await app.close();
  }
}

async function seedUsers(
  app: INestApplicationContext,
): Promise<{ adminId: string }> {
  const authService = app.get(AuthService);
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
    await authService.createUser(dto, adminId);
    logger.log(`Tạo ${u.username} (${u.role}) / ${SEED_PASSWORD}`);
  }

  return { adminId };
}

// Guard này để file import được (Task 2-5 mở rộng cùng file, hoặc test import
// hàm seed()) mà không tự động chạy — chỉ chạy khi gọi trực tiếp qua ts-node.
if (require.main === module) {
  seed().catch((err: unknown) => {
    logger.error('Seed thất bại:', err);
    process.exit(1);
  });
}
