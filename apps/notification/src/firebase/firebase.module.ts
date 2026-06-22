import { existsSync, readFileSync } from 'node:fs';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServiceAccount } from 'firebase-admin';
import {
  cert,
  getApps,
  getApp,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { FirebaseService } from './firebase.service';

export const FIREBASE_ADMIN_APP = Symbol('FIREBASE_ADMIN_APP');

function createFirebaseApp(config: ConfigService): App | null {
  const logger = new Logger('FirebaseModule');
  const credentialsPath = config.get<string>('FIREBASE_ADMIN_CREDENTIALS_PATH');

  if (!credentialsPath) {
    logger.warn(
      'Firebase Admin is disabled. Set FIREBASE_ADMIN_CREDENTIALS_PATH to enable it.',
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
      serviceAccount.projectId ?? config.get<string>('FIREBASE_PROJECT_ID'),
  });
}

@Global()
@Module({
  providers: [
    {
      provide: FIREBASE_ADMIN_APP,
      inject: [ConfigService],
      useFactory: createFirebaseApp,
    },
    FirebaseService,
  ],
  exports: [FIREBASE_ADMIN_APP, FirebaseService],
})
export class FirebaseModule {}
