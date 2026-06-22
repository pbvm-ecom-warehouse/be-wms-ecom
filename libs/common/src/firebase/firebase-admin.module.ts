import { existsSync, readFileSync } from 'node:fs';
import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServiceAccount } from 'firebase-admin';
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private readonly app: App | null;

  constructor(private readonly config: ConfigService) {
    this.app = this.initialize();
  }

  private initialize(): App | null {
    const credentialsPath = this.config.get<string>(
      'FIREBASE_ADMIN_CREDENTIALS_PATH',
    );
    if (!credentialsPath) {
      this.logger.warn(
        'Firebase Admin is disabled. Set FIREBASE_ADMIN_CREDENTIALS_PATH to enable Google login.',
      );
      return null;
    }

    if (!existsSync(credentialsPath)) {
      throw new Error(
        `Firebase Admin credentials file not found at: ${credentialsPath}`,
      );
    }

    if (getApps().length > 0) {
      return getApp();
    }

    const serviceAccount = JSON.parse(
      readFileSync(credentialsPath, 'utf8'),
    ) as ServiceAccount;

    return initializeApp({
      credential: cert(serviceAccount),
      projectId:
        serviceAccount.projectId ??
        this.config.get<string>('FIREBASE_PROJECT_ID'),
    });
  }

  isEnabled() {
    return this.app !== null;
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    if (!this.app) {
      throw new Error(
        'Firebase Admin is not configured. Set FIREBASE_ADMIN_CREDENTIALS_PATH first.',
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
