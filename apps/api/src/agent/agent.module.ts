import { Module } from '@nestjs/common';
import { InvoicePipeline } from './invoice-pipeline.service';
import { JobWorker } from './job-worker.service';

@Module({
  providers: [InvoicePipeline, JobWorker],
  exports: [InvoicePipeline, JobWorker],
})
export class AgentModule {}
