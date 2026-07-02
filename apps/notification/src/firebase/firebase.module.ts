import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { resolveFirebaseAppOptions } from '@app/common';
import { FirebaseService } from './firebase.service';
import { FIREBASE_ADMIN_APP } from './firebase.tokens';

// Re-export để code cũ import token từ module vẫn chạy.
export { FIREBASE_ADMIN_APP };

function createFirebaseApp(config: ConfigService): App | null {
  // 1 process chỉ có 1 default app — tránh init lại nếu đã có.
  if (getApps().length > 0) {
    return getApp();
  }

  const options = resolveFirebaseAppOptions(config, 'FirebaseModule');
  if (!options) return null;

  return initializeApp(options);
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
