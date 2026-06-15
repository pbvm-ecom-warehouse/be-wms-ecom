import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * Kết nối Mongoose tới logical DB của MỘT app. Mỗi app gọi `forApp` với biến env
 * chứa URI riêng (vd WMS_DATABASE_URL / ECOM_DATABASE_URL) — giữ nguyên triết lý
 * DB-per-app: 2 connection tách biệt, không đọc chéo, liên kết qua sku + event.
 */
@Module({})
export class DatabaseModule {
  static forApp(uriEnvKey: string): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        MongooseModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            uri: config.getOrThrow<string>(uriEnvKey),
          }),
        }),
      ],
      exports: [MongooseModule],
    };
  }
}
