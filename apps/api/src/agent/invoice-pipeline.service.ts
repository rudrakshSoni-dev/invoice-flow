import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buffer } from 'node:stream/consumers';
import { formatMinor } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { LlmGateway } from '../llm/llm-gateway.service';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';
import {
  EXTRACT_PROMPT,
  type ExtractionFailure,
  type ExtractionSuccess,
  extractInvoice,
} from './extract.stage';

/** Runs the agent stages for one invoice and persists each stage's outcome with an audit event. */
@Injectable()
export class InvoicePipeline {
  private readonly logger = new Logger(InvoicePipeline.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGateway,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async process(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.status !== 'PROCESSING') {
      this.logger.warn(`Skipping invoice ${invoiceId} in status ${invoice.status}`);
      return;
    }

    const pdf = await buffer(await this.storage.open(invoice.fileKey));
    const extraction = await extractInvoice(pdf, this.llm.forInvoice(invoiceId));
    if (!extraction.ok) {
      await this.saveExtractionFailure(invoiceId, extraction);
      return;
    }
    await this.saveExtraction(invoiceId, extraction);
    // Matching, decision and posting stages are added in milestones 4 and 5.
  }

  /** Used when processing cannot complete at all (e.g. the LLM is unreachable after retries). */
  async markFailed(invoiceId: string, reason: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'FAILED', rawExtraction: { error: reason } },
      }),
      this.prisma.auditEvent.create({
        data: {
          invoiceId,
          step: 'EXTRACTED',
          actor: 'AGENT',
          summary: `Processing failed: ${reason}`,
        },
      }),
    ]);
  }

  private async saveExtraction(invoiceId: string, result: ExtractionSuccess): Promise<void> {
    const { fields } = result;
    const rawExtraction: Prisma.InputJsonObject = { ...fields, confidence: result.fieldConfidence };
    await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          invoiceNumber: fields.invoiceNumber,
          issueDate: new Date(fields.issueDate),
          dueDate: fields.dueDate ? new Date(fields.dueDate) : null,
          currency: fields.currency,
          subtotalMinor: result.subtotalMinor,
          taxMinor: result.taxMinor,
          totalMinor: result.totalMinor,
          confidence: result.confidence,
          rawExtraction,
          lines: { create: result.lines },
          discrepancies: { create: result.discrepancies },
        },
      }),
      this.prisma.auditEvent.create({
        data: {
          invoiceId,
          step: 'EXTRACTED',
          actor: 'AGENT',
          summary:
            `Extracted ${fields.invoiceNumber} from ${fields.vendorName}: ${result.lines.length} lines, ` +
            `${formatMinor(result.totalMinor, fields.currency)} (confidence ${result.confidence.toFixed(2)})`,
          detail: {
            mode: result.mode,
            attempts: result.attempts,
            promptVersion: `${EXTRACT_PROMPT.name}@${EXTRACT_PROMPT.version}`,
            confidence: result.confidence,
            fieldConfidence: result.fieldConfidence,
            discrepancies: result.discrepancies.map((d) => d.message),
          },
        },
      }),
    ]);
  }

  private async saveExtractionFailure(invoiceId: string, result: ExtractionFailure): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'FAILED',
          rawExtraction: { reason: result.reason, rawOutputs: result.rawOutputs },
        },
      }),
      this.prisma.auditEvent.create({
        data: {
          invoiceId,
          step: 'EXTRACTED',
          actor: 'AGENT',
          summary: `Extraction failed: ${result.reason}`,
          detail: { mode: result.mode, attempts: result.attempts },
        },
      }),
    ]);
  }
}
