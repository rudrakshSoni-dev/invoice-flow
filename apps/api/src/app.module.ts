import { Module } from '@nestjs/common';
import { EnvModule } from './common/env.module';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './common/prisma.module';
import { InvoicesModule } from './invoices/invoices.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [EnvModule, PrismaModule, StorageModule, InvoicesModule],
  controllers: [HealthController],
})
export class AppModule {}
