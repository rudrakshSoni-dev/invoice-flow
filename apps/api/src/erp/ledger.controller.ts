import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { parseOrThrow } from '../common/zod';

const ledgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

@Controller('ledger')
export class LedgerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: unknown) {
    const { page, pageSize } = parseOrThrow(ledgerQuerySchema, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        orderBy: { postedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          vendor: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      }),
      this.prisma.ledgerEntry.count(),
    ]);
    return { items, total, page, pageSize };
  }
}
