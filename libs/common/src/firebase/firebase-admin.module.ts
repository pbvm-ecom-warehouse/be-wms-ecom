import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { resolveFirebaseAppOptions } from './firebase-credential';

@Injectable()
export class FirebaseAdminService {
  private readonly app: App | null;

  constructor(private readonly config: ConfigService) {
    this.app = this.initialize();
  }

  private initialize(): App | null {
    // 1 process chỉ có 1 default app — tránh init lại nếu đã có.
    if (getApps().length > 0) {
      return getApp();
    }

    const options = resolveFirebaseAppOptions(
      this.config,
      FirebaseAdminService.name,
    );
    if (!options) return null;

    return initializeApp(options);
  }

  isEnabled() {
    return this.app !== null;
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    if (!this.app) {
      throw new Error(
        'Firebase Admin chưa cấu hình — đặt FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
      );
    }

    return getAuth(this.app).verifyIdToken(idToken);
  }
}

@Global()
@Module({
  providers: [FirebaseAdminService],
  exports: [FirebaseAdminService],
})
export class FirebaseAdminModule {}
