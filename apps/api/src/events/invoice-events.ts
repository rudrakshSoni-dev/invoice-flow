import { Injectable } from '@nestjs/common';
import type { InvoiceStatus } from '@prisma/client';
import { Observable, Subject } from 'rxjs';

export type PipelineStage = 'EXTRACT' | 'MATCH' | 'CHECK' | 'POST';

export type InvoiceEvent =
  | { type: 'invoice.status'; invoiceId: string; status: InvoiceStatus }
  | { type: 'invoice.stage'; invoiceId: string; stage: PipelineStage };

/**
 * In-process event bus behind GET /events. The demo runs as a single instance; with several
 * instances this would move to Postgres LISTEN/NOTIFY. Clients also refetch on focus as a fallback.
 */
@Injectable()
export class InvoiceEvents {
  private readonly subject = new Subject<InvoiceEvent>();

  emit(event: InvoiceEvent): void {
    this.subject.next(event);
  }

  get stream(): Observable<InvoiceEvent> {
    return this.subject.asObservable();
  }
}
