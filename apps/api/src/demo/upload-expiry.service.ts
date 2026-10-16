import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { Env } from '../common/env';
import { ENV } from '../common/env.module';
import { PrismaService } from '../common/prisma.service';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';
import { HISTORY_FILE_PREFIX } from './demo-seed';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Public demo hygiene (DESIGN.md section 13): visitor uploads are deleted once they are older than
 * UPLOAD_RETENTION_HOURS. Seeded history stays. Posted invoices are taken back off their PO.
 */
@Injectable()
export class UploadExpiry implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(UploadExpiry.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.WORKER_ENABLED || this.env.UPLOAD_RETENTION_HOURS === 0) return;
    const sweep = () =>
      this.expire().catch((error: unknown) => this.logger.error('Upload expiry failed', error));
    void sweep();
    this.timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Deletes expired uploads and their files. Returns how many invoices were removed. */
  async expire(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.env.UPLOAD_RETENTION_HOURS * 3600 * 1000);
    const expired = await this.prisma.invoice.findMany({
      where: {
        createdAt: { lt: cutoff },
        status: { not: 'PROCESSING' },
        NOT: { fileKey: { startsWith: HISTORY_FILE_PREFIX } },
      },
      select: { id: true, fileKey: true },
    });

    for (const { id, fileKey } of expired) {
      await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id },
          include: { ledgerEntries: true },
        });
        if (invoice.ledgerEntries.length > 0 && invoice.purchaseOrderId) {
          const po = await tx.purchaseOrder.update({
            where: { id: invoice.purchaseOrderId },
            data: { billedMinor: { decrement: invoice.subtotalMinor ?? 0 } },
          });
          await tx.purchaseOrder.update({
            where: { id: po.id },
            data: {
              status:
                po.billedMinor <= 0
                  ? 'OPEN'
                  : po.billedMinor >= po.totalMinor
                    ? 'CLOSED'
                    : 'PARTIALLY_BILLED',
            },
          });
        }
        await tx.ledgerEntry.deleteMany({ where: { invoiceId: id } });
        await tx.invoice.delete({ where: { id } });
      });
      await this.storage.remove(fileKey);
    }
    if (expired.length > 0) this.logger.log(`Deleted ${expired.length} expired uploads`);
    return expired.length;
  }
}
