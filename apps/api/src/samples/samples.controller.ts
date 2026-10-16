import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { SamplesService } from './samples.service';

@Controller('samples')
export class SamplesController {
  constructor(private readonly samples: SamplesService) {}

  @Get()
  list() {
    return this.samples.list();
  }

  @Post(':id')
  @HttpCode(202)
  upload(@Param('id') id: string) {
    return this.samples.upload(id);
  }
}
