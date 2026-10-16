import { Controller, type MessageEvent, Sse } from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import { InvoiceEvents } from './invoice-events';

const HEARTBEAT_MS = 25_000;

@Controller('events')
export class EventsController {
  constructor(private readonly events: InvoiceEvents) {}

  @Sse()
  stream(): Observable<MessageEvent> {
    return merge(
      this.events.stream.pipe(map((event) => ({ type: event.type, data: event }))),
      // Keeps proxies (and Cloud Run) from closing an idle connection.
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: 'heartbeat', data: {} }))),
    );
  }
}
