import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { redisConfig } from '@app/events';
import { CacheService } from './cache.service';

@Module({
  imports: [ConfigModule.forFeature(redisConfig)],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
