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
        'Firebase Admin is not configured. Set FIREBASE_ADMIN_CREDENTIALS_PATH first.',
      );
    }

    return getMessaging(this.firebaseApp);
  }
}
