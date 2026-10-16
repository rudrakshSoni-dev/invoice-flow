import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  }
}
