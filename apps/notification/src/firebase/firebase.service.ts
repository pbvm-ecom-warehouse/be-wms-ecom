import { Inject, Injectable } from '@nestjs/common';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { FIREBASE_ADMIN_APP } from './firebase.module';
import type { App } from 'firebase-admin/app';

@Injectable()
export class FirebaseService {
  constructor(
    @Inject(FIREBASE_ADMIN_APP)
    private readonly firebaseApp: App | null,
  ) {}

  isEnabled(): boolean {
    return this.firebaseApp !== null;
  }

  getMessaging(): Messaging {
    if (!this.firebaseApp) {
      throw new Error(
        'Firebase Admin chưa cấu hình — đặt FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
      );
    }

    return getMessaging(this.firebaseApp);
  }
}
