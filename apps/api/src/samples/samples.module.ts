import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { SamplesController } from './samples.controller';
import { SamplesService } from './samples.service';

@Module({
  imports: [InvoicesModule],
  controllers: [SamplesController],
  providers: [SamplesService],
})
export class SamplesModule {}
