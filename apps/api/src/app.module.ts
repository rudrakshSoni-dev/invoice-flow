import { Module } from '@nestjs/common';
import { AgentModule } from './agent/agent.module';
import { EnvModule } from './common/env.module';
import { ErpModule } from './erp/erp.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './common/prisma.module';
import { InvoicesModule } from './invoices/invoices.module';
import { LlmModule } from './llm/llm.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { SamplesModule } from './samples/samples.module';
import { StatsModule } from './stats/stats.module';
import { VendorsModule } from './vendors/vendors.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    StorageModule,
    LlmModule,
    ErpModule,
    EventsModule,
    InvoicesModule,
    PurchaseOrdersModule,
    VendorsModule,
    StatsModule,
    SamplesModule,
    AgentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
