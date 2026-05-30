import { Injectable } from '@nestjs/common';

@Injectable()
export class EcommerceService {
  getHello(): string {
    return 'Hello World!';
  }
}
