import { Inject, Injectable } from '@nestjs/common';
import type { Env } from '../common/env';
import { ENV } from '../common/env.module';
import { PrismaService } from '../common/prisma.service';
import { InvoiceEvents } from '../events/invoice-events';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';
import { type SeedCounts, seedDatabase } from './demo-seed';

@Injectable()
export class DemoService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly events: InvoiceEvents,
  ) {}

  /** Puts the public demo back to its seeded state and deletes every uploaded file. */
  async reset(): Promise<SeedCounts> {
    const uploads = await this.prisma.invoice.findMany({ select: { fileKey: true } });
    const counts = await seedDatabase(this.prisma, {
      fixturesDir: this.env.FIXTURES_DIR,
      history: { storage: this.storage },
    });
    const seeded = new Set(
      (await this.prisma.invoice.findMany({ select: { fileKey: true } })).map((i) => i.fileKey),
    );
    await Promise.all(
      uploads.filter((u) => !seeded.has(u.fileKey)).map((u) => this.storage.remove(u.fileKey)),
    );
    this.events.emit({ type: 'demo.reset' });
    return counts;
  }
}
