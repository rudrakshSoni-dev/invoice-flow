import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import type { Env } from '../common/env';
import { ENV } from '../common/env.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ENV],
      // No `dest`: multer keeps the file in memory so the PDF signature can be checked before storing.
      useFactory: (env: Env) => ({
        limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
      }),
    }),
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
