import { Controller, Get } from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';

@Controller()
export class EcommerceController {
  constructor(private readonly ecommerceService: EcommerceService) {}

  @Get()
  getHello(): string {
    return this.ecommerceService.getHello();
  }
}
