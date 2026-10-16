import { Global, Module } from '@nestjs/common';
import { ERP_ADAPTER } from './erp-adapter';
import { LedgerController } from './ledger.controller';
import { MockErpAdapter } from './mock-erp.adapter';

@Global()
@Module({
  controllers: [LedgerController],
  providers: [{ provide: ERP_ADAPTER, useClass: MockErpAdapter }],
  exports: [ERP_ADAPTER],
})
export class ErpModule {}
