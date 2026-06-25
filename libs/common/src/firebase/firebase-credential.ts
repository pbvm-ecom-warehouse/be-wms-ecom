import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { cert, type AppOptions } from 'firebase-admin/app';

/**
 * Dựng tham số init Firebase Admin TỪ BIẾN MÔI TRƯỜNG (không đọc file service-account).
 *
 * Vì sao không đọc file: deploy Docker/VPS không có file .json trên đĩa, và không nên
 * mount/commit file bí mật. Nhồi 3 trường của service account qua env là cách chuẩn,
 * an toàn khi đóng container.
 *
 * Cần ĐỦ 3 biến mới bật được: FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL +
 * FIREBASE_PRIVATE_KEY. Thiếu bất kỳ → trả null (Firebase tắt, không lỗi).
 *
 * Lưu ý private key: env lưu ký tự xuống dòng dưới dạng literal `\n`, phải đổi lại
 * thành xuống dòng thật thì firebase-admin mới parse được PEM.
 */
export function resolveFirebaseAppOptions(
  config: ConfigService,
  loggerContext = 'Firebase',
): AppOptions | null {
  const logger = new Logger(loggerContext);
  const projectId = config.get<string>('FIREBASE_PROJECT_ID');
  const clientEmail = config.get<string>('FIREBASE_CLIENT_EMAIL');
  const privateKeyRaw = config.get<string>('FIREBASE_PRIVATE_KEY');

  if (!projectId || !clientEmail || !privateKeyRaw) {
    logger.warn(
      'Firebase Admin tắt — cần đủ FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
    );
    return null;
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  return {
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  };
}
