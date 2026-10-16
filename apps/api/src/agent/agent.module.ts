import { Module } from '@nestjs/common';
import { InvoicePipeline } from './invoice-pipeline.service';
import { JobWorker } from './job-worker.service';

@Module({
  providers: [InvoicePipeline, JobWorker],
  exports: [JobWorker],
})
export class AgentModule {}
