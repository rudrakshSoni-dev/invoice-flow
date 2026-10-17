import { Controller, Get } from '@nestjs/common';
import { DependencyUnavailableError } from './domain-errors';
import { PrismaService } from './prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  root(): { name: string; status: 'ok'; health: string } {
    return { name: 'InvoiceFlow API', status: 'ok', health: '/health' };
  }

  @Get('health')
  async check(): Promise<{ status: 'ok'; database: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new DependencyUnavailableError('Database is unreachable');
    }
    return { status: 'ok', database: 'up' };
  }
}
