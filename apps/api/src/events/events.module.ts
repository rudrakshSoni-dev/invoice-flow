import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { InvoiceEvents } from './invoice-events';

@Global()
@Module({
  controllers: [EventsController],
  providers: [InvoiceEvents],
  exports: [InvoiceEvents],
})
export class EventsModule {}
