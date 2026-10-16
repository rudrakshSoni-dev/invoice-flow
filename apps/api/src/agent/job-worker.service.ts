import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { Env } from '../common/env';
import { ENV } from '../common/env.module';
import { PROCESS_INVOICE_JOB } from '../common/job-types';
import { PrismaService } from '../common/prisma.service';
import { LlmError } from '../llm/llm-provider';
import { InvoicePipeline } from './invoice-pipeline.service';

export const MAX_JOB_ATTEMPTS = 3;
const IDLE_POLL_MS = 1000;
const RETRY_BACKOFF_MS = 5000;

type ClaimedJob = { id: string; type: string; invoiceId: string; attempts: number };

/** Polls the Postgres job table. SKIP LOCKED lets several instances share the queue safely. */
@Injectable()
export class JobWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobWorker.name);
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly pipeline: InvoicePipeline,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.WORKER_ENABLED) return;
    this.running = true;
    this.schedule(0);
    this.logger.log('Job worker started');
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    await this.inFlight;
  }

  /** Claims and runs at most one due job. Returns whether a job was found. */
  async runOnce(): Promise<boolean> {
    const [job] = await this.prisma.$queryRaw<ClaimedJob[]>`
      UPDATE "Job" SET status = 'RUNNING', attempts = attempts + 1
      WHERE id = (
        SELECT id FROM "Job"
        WHERE status = 'QUEUED' AND "runAt" <= now()
        ORDER BY "runAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, type, "invoiceId", attempts`;
    if (!job) return false;

    try {
      if (job.type !== PROCESS_INVOICE_JOB) throw new Error(`Unknown job type ${job.type}`);
      await this.pipeline.process(job.invoiceId);
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'DONE', lastError: null },
      });
    } catch (error) {
      await this.handleFailure(job, error);
    }
    return true;
  }

  private async handleFailure(job: ClaimedJob, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = !(error instanceof LlmError) || error.retryable;

    if (retryable && job.attempts < MAX_JOB_ATTEMPTS) {
      this.logger.warn(`Job ${job.id} attempt ${job.attempts} failed, retrying: ${message}`);
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'QUEUED',
          lastError: message,
          runAt: new Date(Date.now() + RETRY_BACKOFF_MS * job.attempts),
        },
      });
      return;
    }

    this.logger.error(`Job ${job.id} failed permanently: ${message}`);
    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: 'FAILED', lastError: message },
    });
    await this.pipeline.markFailed(job.invoiceId, message);
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.inFlight = this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    let foundJob = false;
    try {
      foundJob = await this.runOnce();
    } catch (error) {
      this.logger.error(`Job worker error: ${(error as Error).message}`);
    }
    if (this.running) this.schedule(foundJob ? 0 : IDLE_POLL_MS);
  }
}
