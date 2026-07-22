import { Global, Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

/**
 * Cấu hình Cloudinary SDK 1 lần duy nhất toàn hệ thống, theo đúng pattern
 * FirebaseAdminModule (@Global, đọc config qua ConfigService). App chỉ cần
 * import module này — không tự cấu hình SDK lần 2.
 */
@Global()
@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
