import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

/**
 * PrismaService của WMS — kết nối riêng tới `wms_db` (qua WMS_DATABASE_URL).
 * App Ecommerce có PrismaService riêng trỏ `ecom_db`. Hai client tách biệt =>
 * không thể đọc chéo collection; mọi liên kết xuyên app đi qua event (libs/events).
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
