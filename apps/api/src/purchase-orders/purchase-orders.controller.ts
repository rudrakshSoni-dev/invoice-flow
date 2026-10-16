import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      orderBy: { poNumber: 'asc' },
      include: { vendor: { select: { id: true, name: true } }, lines: true },
    });
    return purchaseOrders.map((po) => ({ ...po, remainingMinor: po.totalMinor - po.billedMinor }));
  }
}
