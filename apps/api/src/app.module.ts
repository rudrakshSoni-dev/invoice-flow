import { Module } from '@nestjs/common';
import { AgentModule } from './agent/agent.module';
import { EnvModule } from './common/env.module';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './common/prisma.module';
import { InvoicesModule } from './invoices/invoices.module';
import { LlmModule } from './llm/llm.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [EnvModule, PrismaModule, StorageModule, LlmModule, InvoicesModule, AgentModule],
  controllers: [HealthController],
})
export class AppModule {}
