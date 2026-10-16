import { Controller, Get } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const [groups, [timing]] = await Promise.all([
      this.prisma.invoice.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ avgMs: number | null }>>`
        SELECT avg(extract(epoch FROM (d."createdAt" - i."createdAt")) * 1000)::float AS "avgMs"
        FROM "Invoice" i
        JOIN "AuditEvent" d ON d."invoiceId" = i.id AND d.step = 'DECIDED'`,
    ]);

    const byStatus = Object.fromEntries(Object.values(InvoiceStatus).map((s) => [s, 0])) as Record<
      InvoiceStatus,
      number
    >;
    for (const group of groups) byStatus[group.status] = group._count._all;

    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    const processed = total - byStatus.PROCESSING;
    return {
      total,
      processed,
      byStatus,
      needsReview: byStatus.NEEDS_REVIEW,
      autoApprovalRate: processed > 0 ? byStatus.AUTO_APPROVED / processed : null,
      avgProcessingMs:
        timing?.avgMs === null || timing === undefined ? null : Math.round(timing.avgMs),
    };
  }
}
