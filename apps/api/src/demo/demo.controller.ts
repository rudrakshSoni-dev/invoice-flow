import { Controller, HttpCode, Post } from '@nestjs/common';
import { DemoService } from './demo.service';

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('reset')
  @HttpCode(200)
  reset() {
    return this.demo.reset();
  }
}
