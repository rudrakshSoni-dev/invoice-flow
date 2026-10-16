import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InvoiceStatus, Prisma } from '@prisma/client';
import { buffer } from 'node:stream/consumers';
import type { Env } from '../common/env';
import { ENV } from '../common/env.module';
import { formatMinor } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { ERP_ADAPTER, type ErpAdapter } from '../erp/erp-adapter';
import { InvoiceEvents, type PipelineStage } from '../events/invoice-events';
import type { StructuredLlm } from '../llm/structured-output';
import { LlmGateway } from '../llm/llm-gateway.service';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';
import { checkAgainstPurchaseOrder, type Decision, decide } from './check.stage';
import type { DraftDiscrepancy } from './discrepancy';
import { type Explanation, explainDiscrepancies } from './explain.stage';
import {
  EXTRACT_PROMPT,
  type ExtractionFailure,
  type ExtractionSuccess,
  extractInvoice,
} from './extract.stage';
import {
  type PurchaseOrderCandidate,
  type PurchaseOrderMatch,
  type VendorMatch,
  duplicateInvoiceDiscrepancy,
  matchPurchaseOrder,
  matchVendor,
  remainingMinor,
  unknownVendorDiscrepancy,
} from './match.stage';

const OPEN_PO_STATUSES = ['OPEN', 'PARTIALLY_BILLED'] as const;
const PO_INCLUDE = { lines: true } as const;

type MatchOutcome = {
  vendor: VendorMatch | null;
  purchaseOrder: PurchaseOrderMatch | null;
  discrepancies: DraftDiscrepancy[];
  at: Date;
};

type DecisionOutcome = {
  decision: Decision;
  discrepancies: DraftDiscrepancy[];
  explanation: Explanation | null;
  at: Date;
};

/**
 * Runs extract → match → check/decide → post for one invoice. Stages only read and call the LLM;
 * all results are written in one transaction at the end, so a crash or retry never leaves a
 * half-processed invoice behind.
 */
@Injectable()
export class InvoicePipeline {
  private readonly logger = new Logger(InvoicePipeline.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly llmGateway: LlmGateway,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(ERP_ADAPTER) private readonly erp: ErpAdapter,
    private readonly events: InvoiceEvents,
  ) {}

  async process(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.status !== 'PROCESSING') {
      this.logger.warn(`Skipping invoice ${invoiceId} in status ${invoice.status}`);
      return;
    }
    const llm = this.llmGateway.forInvoice(invoiceId);
    const stage = (name: PipelineStage) =>
      this.events.emit({ type: 'invoice.stage', invoiceId, stage: name });

    stage('EXTRACT');
    const pdf = await buffer(await this.storage.open(invoice.fileKey));
    const extraction = await extractInvoice(pdf, llm);
    const extractedAt = new Date();
    if (!extraction.ok) {
      await this.saveExtractionFailure(invoiceId, extraction, extractedAt);
      this.emitStatus(invoiceId, 'FAILED');
      return;
    }

    stage('MATCH');
    const match = await this.match(invoiceId, extraction);
    stage('CHECK');
    const decision = await this.decide(extraction, match, llm);
    if (decision.decision === 'AUTO_APPROVED') stage('POST');

    await this.prisma.$transaction(async (tx) => {
      await this.saveExtraction(tx, invoiceId, extraction, extractedAt);
      await this.saveMatch(tx, invoiceId, match);
      await this.saveDecision(tx, invoiceId, decision);
      if (decision.decision === 'AUTO_APPROVED') {
        await this.post(tx, invoiceId, 'AGENT');
      }
    });
    this.emitStatus(invoiceId, decision.decision);
  }

  emitStatus(invoiceId: string, status: InvoiceStatus): void {
    this.events.emit({ type: 'invoice.status', invoiceId, status });
  }

  /** Posts an approved invoice to the ERP and records it. Shared by auto-approval and human approval. */
  async post(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    actor: 'AGENT' | 'USER',
  ): Promise<void> {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const { vendorId, currency, subtotalMinor, totalMinor } = invoice;
    if (!vendorId || !currency || subtotalMinor === null || totalMinor === null) {
      throw new Error(`Invoice ${invoiceId} is missing vendor or amounts and cannot be posted`);
    }
    const result = await this.erp.postInvoice(
      {
        id: invoiceId,
        vendorId,
        purchaseOrderId: invoice.purchaseOrderId,
        currency,
        subtotalMinor,
        totalMinor,
      },
      tx,
    );
    await tx.auditEvent.create({
      data: {
        invoiceId,
        step: 'POSTED',
        actor,
        summary: `Posted ${formatMinor(totalMinor, currency)} to account ${result.accountCode}`,
        detail: result,
      },
    });
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
    this.emitStatus(invoiceId, 'FAILED');
  }

  private async match(invoiceId: string, extraction: ExtractionSuccess): Promise<MatchOutcome> {
    const { fields } = extraction;
    const discrepancies: DraftDiscrepancy[] = [];

    const vendors = await this.prisma.vendor.findMany({
      select: { id: true, name: true, taxId: true },
    });
    const vendor = matchVendor(fields, vendors);
    if (!vendor)
      discrepancies.push(unknownVendorDiscrepancy(fields.vendorName, fields.vendorTaxId));

    const [byNumber, vendorOpenPurchaseOrders, duplicates] = await Promise.all([
      fields.poNumber
        ? this.prisma.purchaseOrder.findUnique({
            where: { poNumber: fields.poNumber },
            include: PO_INCLUDE,
          })
        : null,
      vendor
        ? this.prisma.purchaseOrder.findMany({
            where: { vendorId: vendor.vendor.id, status: { in: [...OPEN_PO_STATUSES] } },
            include: PO_INCLUDE,
          })
        : [],
      vendor
        ? this.prisma.invoice.count({
            where: {
              id: { not: invoiceId },
              vendorId: vendor.vendor.id,
              invoiceNumber: fields.invoiceNumber,
              status: { notIn: ['FAILED', 'REJECTED'] },
            },
          })
        : 0,
    ]);

    if (duplicates > 0)
      discrepancies.push(duplicateInvoiceDiscrepancy(fields.invoiceNumber, vendor!.vendor.name));

    const po = matchPurchaseOrder({
      poNumber: fields.poNumber,
      vendorId: vendor?.vendor.id ?? null,
      subtotalMinor: extraction.subtotalMinor,
      byNumber,
      vendorOpenPurchaseOrders,
    });
    discrepancies.push(...po.discrepancies);

    return { vendor, purchaseOrder: po.match, discrepancies, at: new Date() };
  }

  private async decide(
    extraction: ExtractionSuccess,
    match: MatchOutcome,
    llm: StructuredLlm,
  ): Promise<DecisionOutcome> {
    const threshold = this.env.CONFIDENCE_THRESHOLD;
    const po = match.purchaseOrder?.purchaseOrder ?? null;
    const checks = checkAgainstPurchaseOrder(
      { ...extraction, currency: extraction.fields.currency, purchaseOrder: po },
      threshold,
    );
    const all = [...extraction.discrepancies, ...match.discrepancies, ...checks];
    const decision = decide(all, extraction.confidence, threshold);

    const explanation =
      decision === 'NEEDS_REVIEW'
        ? await explainDiscrepancies(
            {
              invoice: describeInvoice(extraction),
              purchaseOrder: describePurchaseOrder(po),
              discrepancies: all,
            },
            llm,
          )
        : null;

    return { decision, discrepancies: checks, explanation, at: new Date() };
  }

  private async saveExtraction(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    result: ExtractionSuccess,
    at: Date,
  ): Promise<void> {
    const { fields } = result;
    const rawExtraction: Prisma.InputJsonObject = { ...fields, confidence: result.fieldConfidence };
    await tx.invoice.update({
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
    });
    await tx.auditEvent.create({
      data: {
        invoiceId,
        step: 'EXTRACTED',
        actor: 'AGENT',
        createdAt: at,
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
    });
  }

  private async saveMatch(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    match: MatchOutcome,
  ): Promise<void> {
    const vendor = match.vendor?.vendor;
    const po = match.purchaseOrder?.purchaseOrder;
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        vendorId: vendor?.id ?? null,
        purchaseOrderId: po?.id ?? null,
        discrepancies: { create: match.discrepancies },
      },
    });
    await tx.auditEvent.create({
      data: {
        invoiceId,
        step: 'MATCHED',
        actor: 'AGENT',
        createdAt: match.at,
        summary: `Vendor: ${vendor ? `${vendor.name} (by ${match.vendor!.method})` : 'unknown'}. PO: ${
          po ? `${po.poNumber} (by ${match.purchaseOrder!.method})` : 'none'
        }.`,
        detail: {
          vendor: match.vendor
            ? { id: vendor!.id, method: match.vendor.method, score: match.vendor.score }
            : null,
          purchaseOrder: match.purchaseOrder
            ? { id: po!.id, poNumber: po!.poNumber, method: match.purchaseOrder.method }
            : null,
          discrepancies: match.discrepancies.map((d) => d.message),
        },
      },
    });
  }

  private async saveDecision(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    outcome: DecisionOutcome,
  ): Promise<void> {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: outcome.decision, discrepancies: { create: outcome.discrepancies } },
    });
    const all = await tx.discrepancy.findMany({ where: { invoiceId }, select: { severity: true } });
    const count = (severity: string) => all.filter((d) => d.severity === severity).length;
    await tx.auditEvent.create({
      data: {
        invoiceId,
        step: 'DECIDED',
        actor: 'AGENT',
        createdAt: outcome.at,
        summary:
          outcome.decision === 'AUTO_APPROVED'
            ? 'Auto-approved: clean PO match and confidence above threshold.'
            : `Needs review: ${count('BLOCKING')} blocking, ${count('WARNING')} warning.`,
        detail: {
          decision: outcome.decision,
          threshold: this.env.CONFIDENCE_THRESHOLD,
          explanation: outcome.explanation?.text ?? null,
          explanationSource: outcome.explanation?.source ?? null,
        },
      },
    });
  }

  private async saveExtractionFailure(
    invoiceId: string,
    result: ExtractionFailure,
    at: Date,
  ): Promise<void> {
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
          createdAt: at,
          summary: `Extraction failed: ${result.reason}`,
          detail: { mode: result.mode, attempts: result.attempts },
        },
      }),
    ]);
  }
}

function describeInvoice(extraction: ExtractionSuccess): string {
  const { fields } = extraction;
  const fmt = (minor: number) => formatMinor(minor, fields.currency);
  return `${fields.invoiceNumber} from ${fields.vendorName}, subtotal ${fmt(extraction.subtotalMinor)}, total ${fmt(extraction.totalMinor)}`;
}

function describePurchaseOrder(po: PurchaseOrderCandidate | null): string {
  if (!po) return 'none matched';
  const fmt = (minor: number) => formatMinor(minor, po.currency);
  return `${po.poNumber}, ${fmt(remainingMinor(po))} remaining of ${fmt(po.totalMinor)}`;
}
