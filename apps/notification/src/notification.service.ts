import { Injectable } from '@nestjs/common';
import { FirebaseService } from './firebase/firebase.service';

@Injectable()
export class NotificationService {
  constructor(private readonly firebaseService: FirebaseService) {}

  getHello(): string {
    return this.firebaseService.isEnabled()
      ? 'Firebase Admin is configured'
      : 'Firebase Admin is disabled';
  }
}
