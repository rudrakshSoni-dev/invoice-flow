import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parseOrThrow } from '../common/zod';
import { listInvoicesQuerySchema } from './invoice-query.schema';
import { InvoicesService, type UploadedInvoiceFile } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedInvoiceFile | undefined) {
    return this.invoices.upload(file);
  }

  @Get()
  list(@Query() query: unknown) {
    return this.invoices.list(parseOrThrow(listInvoicesQuerySchema, query));
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.invoices.detail(id);
  }

  @Get(':id/file')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline')
  async file(@Param('id') id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.invoices.openFile(id));
  }
}
