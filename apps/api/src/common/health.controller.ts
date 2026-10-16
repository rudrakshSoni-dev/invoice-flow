import { Controller, Get } from '@nestjs/common';
import { DependencyUnavailableError } from './domain-errors';
import { PrismaService } from './prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; database: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new DependencyUnavailableError('Database is unreachable');
    }
    return { status: 'ok', database: 'up' };
  }
}
