import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { NotFoundError, ValidationError } from '../common/domain-errors';
import { PrismaService } from '../common/prisma.service';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';
import type { ListInvoicesQuery } from './invoice-query.schema';
import { isPdf } from './pdf-signature';

export const PROCESS_INVOICE_JOB = 'PROCESS_INVOICE';

export type UploadedInvoiceFile = { buffer: Buffer; originalname: string };

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
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

  async openFile(id: string): Promise<Readable> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { fileKey: true },
    });
    if (!invoice) throw new NotFoundError(`Invoice ${id} not found`);
    return this.storage.open(invoice.fileKey);
  }
}
