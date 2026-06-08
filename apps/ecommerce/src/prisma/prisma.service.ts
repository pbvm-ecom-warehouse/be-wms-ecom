import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

/**
 * PrismaService của Ecommerce — kết nối riêng tới `ecom_db` (qua ECOM_DATABASE_URL).
 * App WMS có PrismaService riêng trỏ `wms_db`. Hai client tách biệt => không đọc
 * chéo collection; mọi liên kết xuyên app đi qua event (libs/events).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
