import {
  Body,
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
import {
  approveInvoiceSchema,
  listInvoicesQuerySchema,
  rejectInvoiceSchema,
} from './invoice-query.schema';
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

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Body() body: unknown) {
    return this.invoices.approve(id, parseOrThrow(approveInvoiceSchema, body ?? {}));
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body() body: unknown) {
    return this.invoices.reject(id, parseOrThrow(rejectInvoiceSchema, body ?? {}));
  }

  @Get(':id/file')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline')
  async file(@Param('id') id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.invoices.openFile(id));
  }
}
