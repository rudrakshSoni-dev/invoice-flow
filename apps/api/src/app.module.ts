import { Module } from '@nestjs/common';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './common/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
