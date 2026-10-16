import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { UploadExpiry } from './upload-expiry.service';

@Module({
  controllers: [DemoController],
  providers: [DemoService, UploadExpiry],
  exports: [DemoService, UploadExpiry],
})
export class DemoModule {}
