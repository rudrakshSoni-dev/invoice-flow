import { Inject, Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { NotFoundError } from '../common/domain-errors';
import type { Env } from '../common/env';
import { ENV } from '../common/env.module';
import { InvoicesService } from '../invoices/invoices.service';

const manifestSchema = z.array(z.object({ file: z.string(), scenario: z.string() }));

export type Sample = { id: string; file: string; scenario: string };

/** Serves the fixture invoices for the "Try a sample invoice" menu. */
@Injectable()
export class SamplesService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly invoices: InvoicesService,
  ) {}

  async list(): Promise<Sample[]> {
    const raw = await readFile(join(this.dir, 'manifest.json'), 'utf8');
    return manifestSchema
      .parse(JSON.parse(raw))
      .map(({ file, scenario }) => ({ id: file.replace(/\.pdf$/, ''), file, scenario }));
  }

  async upload(id: string): Promise<{ id: string; status: string }> {
    const sample = (await this.list()).find((s) => s.id === id);
    if (!sample) throw new NotFoundError(`Sample ${id} not found`);
    const pdf = await readFile(join(this.dir, sample.file));
    return this.invoices.createFromPdf(pdf, sample.file);
  }

  private get dir(): string {
    return join(this.env.FIXTURES_DIR, 'invoices');
  }
}
