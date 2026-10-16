import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { InvoicePipeline } from '../agent/invoice-pipeline.service';
import { InvalidStateError, NotFoundError, ValidationError } from '../common/domain-errors';
import { PROCESS_INVOICE_JOB } from '../common/job-types';
import { PrismaService } from '../common/prisma.service';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';
import type {
  ApproveInvoiceInput,
  ListInvoicesQuery,
  RejectInvoiceInput,
} from './invoice-query.schema';
import { isPdf } from './pdf-signature';

export type UploadedInvoiceFile = { buffer: Buffer; originalname: string };

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly pipeline: InvoicePipeline,
  ) {}

  async upload(file: UploadedInvoiceFile | undefined): Promise<{ id: string; status: string }> {
    if (!file) throw new ValidationError('Attach the invoice as a "file" form field');
    if (!isPdf(file.buffer)) throw new ValidationError('Only PDF invoices are supported');

    const fileKey = `${randomUUID()}.pdf`;
    await this.storage.save(fileKey, file.buffer);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: { fileKey },
          select: { id: true, status: true },
        });
        await tx.auditEvent.create({
          data: {
            invoiceId: invoice.id,
            step: 'UPLOADED',
            actor: 'USER',
            summary: `Uploaded ${file.originalname}`,
            detail: { originalName: file.originalname, sizeBytes: file.buffer.length },
          },
        });
        await tx.job.create({ data: { type: PROCESS_INVOICE_JOB, invoiceId: invoice.id } });
        return invoice;
      });
    } catch (error) {
      await this.storage.remove(fileKey);
      throw error;
    }
  }

  async list({ status, page, pageSize }: ListInvoicesQuery) {
    const where = status ? { status } : {};
    const [items, total] = await this.prisma.$transaction([
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
          vendor: { select: { id: true, name: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);
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
    await this.prisma.$transaction(async (tx) => {
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
    });
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
