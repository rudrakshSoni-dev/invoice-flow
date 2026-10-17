import { Inject, Injectable } from '@nestjs/common';
import { type InvoiceStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { InvoicePipeline } from '../agent/invoice-pipeline.service';
import { InvalidStateError, NotFoundError, ValidationError } from '../common/domain-errors';
import { PROCESS_INVOICE_JOB } from '../common/job-types';
import { toMinor } from '../common/money';
import { InvoiceEvents } from '../events/invoice-events';
import { PrismaService } from '../common/prisma.service';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';
import type {
  ApproveInvoiceInput,
  ListInvoicesQuery,
  RejectInvoiceInput,
  UpdateInvoiceInput,
} from './invoice-query.schema';
import { isPdf } from './pdf-signature';

export type UploadedInvoiceFile = { buffer: Buffer; originalname: string };

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly pipeline: InvoicePipeline,
    private readonly events: InvoiceEvents,
  ) {}

  async upload(file: UploadedInvoiceFile | undefined): Promise<{ id: string; status: string }> {
    if (!file) throw new ValidationError('Attach the invoice as a "file" form field');
    return this.createFromPdf(file.buffer, file.originalname);
  }

  async createFromPdf(pdf: Buffer, originalName: string): Promise<{ id: string; status: string }> {
    if (!isPdf(pdf)) throw new ValidationError('Only PDF invoices are supported');

    const fileKey = `${randomUUID()}.pdf`;
    await this.storage.save(fileKey, pdf);

    let created: { id: string; status: InvoiceStatus };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: { fileKey },
          select: { id: true, status: true },
        });
        await tx.auditEvent.create({
          data: {
            invoiceId: invoice.id,
            step: 'UPLOADED',
            actor: 'USER',
            summary: `Uploaded ${originalName}`,
            detail: { originalName, sizeBytes: pdf.length },
          },
        });
        await tx.job.create({ data: { type: PROCESS_INVOICE_JOB, invoiceId: invoice.id } });
        return invoice;
      });
    } catch (error) {
      await this.storage.remove(fileKey);
      throw error;
    }
    this.pipeline.emitStatus(created.id, created.status);
    return created;
  }

  async list({ status, page, pageSize }: ListInvoicesQuery) {
    const where = status ? { status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          invoiceNumber: true,
          currency: true,
          totalMinor: true,
          status: true,
          confidence: true,
          createdAt: true,
          rawExtraction: true,
          vendor: { select: { id: true, name: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    const items = rows.map(({ rawExtraction, ...row }) => ({
      ...row,
      extractedVendorName: extractedVendorName(rawExtraction),
    }));
    return { items, total, page, pageSize };
  }

  async detail(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        vendor: true,
        lines: true,
        discrepancies: true,
        auditEvents: { orderBy: { createdAt: 'asc' } },
        purchaseOrder: { include: { lines: true } },
      },
    });
    if (!invoice) throw new NotFoundError(`Invoice ${id} not found`);
    return invoice;
  }

  async approve(id: string, { note }: ApproveInvoiceInput) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.claimForReview(tx, id, 'APPROVED');
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id },
          select: { vendorId: true },
        });
        if (!invoice.vendorId)
          throw new InvalidStateError('Assign a known vendor before approving this invoice');
        await tx.auditEvent.create({
          data: {
            invoiceId: id,
            step: 'REVIEWED',
            actor: 'USER',
            summary: note ? `Approved by reviewer: ${note}` : 'Approved by reviewer',
            detail: { decision: 'APPROVED', note: note ?? null },
          },
        });
        await this.pipeline.post(tx, id, 'USER');
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    this.pipeline.emitStatus(id, 'APPROVED');
    return this.detail(id);
  }

  async reject(id: string, { reason }: RejectInvoiceInput) {
    await this.prisma.$transaction(async (tx) => {
      await this.claimForReview(tx, id, 'REJECTED');
      await tx.auditEvent.create({
        data: {
          invoiceId: id,
          step: 'REVIEWED',
          actor: 'USER',
          summary: `Rejected by reviewer: ${reason}`,
          detail: { decision: 'REJECTED', reason },
        },
      });
    });
    this.pipeline.emitStatus(id, 'REJECTED');
    return this.detail(id);
  }

  /** Clears a failed attempt and queues the invoice again. Earlier agent runs stay for the audit. */
  async retry(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.invoice.updateMany({
        where: { id, status: 'FAILED' },
        data: {
          status: 'PROCESSING',
          vendorId: null,
          purchaseOrderId: null,
          invoiceNumber: null,
          issueDate: null,
          dueDate: null,
          currency: null,
          subtotalMinor: null,
          taxMinor: null,
          totalMinor: null,
          confidence: null,
          rawExtraction: Prisma.DbNull,
        },
      });
      if (count !== 1) {
        const invoice = await tx.invoice.findUnique({ where: { id }, select: { status: true } });
        if (!invoice) throw new NotFoundError(`Invoice ${id} not found`);
        throw new InvalidStateError(
          `Only failed invoices can be retried (this one is ${invoice.status})`,
        );
      }
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.discrepancy.deleteMany({ where: { invoiceId: id } });
      await tx.auditEvent.create({
        data: {
          invoiceId: id,
          step: 'REVIEWED',
          actor: 'USER',
          summary: 'Retry requested by reviewer',
        },
      });
      await tx.job.create({ data: { type: PROCESS_INVOICE_JOB, invoiceId: id } });
    });
    this.pipeline.emitStatus(id, 'PROCESSING');
    return this.detail(id);
  }

  /** Reviewer corrections. Discrepancies stay as the agent found them; the edit is audited. */
  async update(id: string, input: UpdateInvoiceInput) {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundError(`Invoice ${id} not found`);
      if (invoice.status !== 'NEEDS_REVIEW') {
        throw new InvalidStateError(
          `Only invoices that need review can be edited (this one is ${invoice.status})`,
        );
      }

      const vendorId = input.vendorId !== undefined ? input.vendorId : invoice.vendorId;
      if (input.vendorId) {
        const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
        if (!vendor) throw new ValidationError(`Vendor ${input.vendorId} does not exist`);
      }
      if (input.purchaseOrderId) {
        const po = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
        if (!po)
          throw new ValidationError(`Purchase order ${input.purchaseOrderId} does not exist`);
        if (po.vendorId !== vendorId)
          throw new ValidationError(`${po.poNumber} was issued to a different vendor`);
      }

      const currency = input.currency ?? invoice.currency;
      const amount = (value: string | undefined) => {
        if (value === undefined) return undefined;
        if (!currency) throw new ValidationError('Set a currency before editing amounts');
        return toMinor(value, currency);
      };
      const data: Prisma.InvoiceUncheckedUpdateInput = {
        invoiceNumber: input.invoiceNumber,
        issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
        dueDate:
          input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
        currency: input.currency,
        subtotalMinor: amount(input.subtotal),
        taxMinor: amount(input.tax),
        totalMinor: amount(input.total),
        vendorId: input.vendorId,
        purchaseOrderId: input.purchaseOrderId,
      };

      const before = invoice as unknown as Record<string, unknown>;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [field, to] of Object.entries(data)) {
        const from = before[field];
        if (to !== undefined && String(from) !== String(to)) changes[field] = { from, to };
      }
      if (Object.keys(changes).length === 0) return;

      await tx.invoice.update({ where: { id }, data });
      await tx.auditEvent.create({
        data: {
          invoiceId: id,
          step: 'REVIEWED',
          actor: 'USER',
          summary: `Edited ${Object.keys(changes).join(', ')}`,
          detail: JSON.parse(JSON.stringify({ changes })) as Prisma.InputJsonObject,
        },
      });
    });
    return this.detail(id);
  }

  /** Moves NEEDS_REVIEW to the reviewer's decision atomically, so two reviewers cannot both act. */
  private async claimForReview(
    tx: Prisma.TransactionClient,
    id: string,
    status: 'APPROVED' | 'REJECTED',
  ) {
    const { count } = await tx.invoice.updateMany({
      where: { id, status: 'NEEDS_REVIEW' },
      data: { status },
    });
    if (count === 1) return;
    const invoice = await tx.invoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) throw new NotFoundError(`Invoice ${id} not found`);
    throw new InvalidStateError(
      `Only invoices that need review can be decided (this one is ${invoice.status})`,
    );
  }

  async openFile(id: string): Promise<Readable> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { fileKey: true },
    });
    if (!invoice) throw new NotFoundError(`Invoice ${id} not found`);
    return this.storage.open(invoice.fileKey);
  }
}

function extractedVendorName(raw: Prisma.JsonValue): string | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.vendorName === 'string') {
    return raw.vendorName;
  }
  return null;
}
