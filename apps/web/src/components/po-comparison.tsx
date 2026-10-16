import type { InvoiceLine, PurchaseOrder } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/format';
import { Badge } from './ui/badge';
import { Card, CardBody, CardHeader } from './ui/card';
import { Table, Td, Th } from './ui/table';

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return wa.size + wb.size === 0 ? 0 : (2 * shared) / (wa.size + wb.size);
}

export function PoComparison({
  purchaseOrder,
  lines,
  currency,
}: {
  purchaseOrder: PurchaseOrder | null;
  lines: InvoiceLine[];
  currency: string | null;
}) {
  if (!purchaseOrder) {
    return (
      <Card>
        <CardHeader title="Matched purchase order" />
        <CardBody>
          <p className="text-sm text-text-muted">No purchase order was matched to this invoice.</p>
        </CardBody>
      </Card>
    );
  }

  const po = purchaseOrder;
  const remaining = po.totalMinor - po.billedMinor;
  const rows = lines.map((line) => {
    const best = po.lines
      .map((poLine) => ({ poLine, score: similarity(line.description, poLine.description) }))
      .sort((a, b) => b.score - a.score)[0];
    return { line, poLine: best && best.score >= 0.6 ? best.poLine : undefined };
  });

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Matched purchase order <span className="amount">{po.poNumber}</span>
          </span>
        }
        actions={<Badge>{po.status.replace('_', ' ').toLowerCase()}</Badge>}
      />
      <CardBody className="space-y-4">
        <dl className="grid grid-cols-3 gap-4 text-sm">
          {[
            ['PO total', formatMoney(po.totalMinor, po.currency)],
            ['Billed', formatMoney(po.billedMinor, po.currency)],
            ['Remaining', formatMoney(remaining, po.currency)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-text-muted">{label}</dt>
              <dd className="amount mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
        <Table>
          <thead>
            <tr>
              <Th className="px-2">Line</Th>
              <Th className="px-2 text-right">PO qty</Th>
              <Th className="px-2 text-right">Invoiced</Th>
              <Th className="px-2 text-right">PO price</Th>
              <Th className="px-2 text-right">Invoiced price</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, poLine }) => {
              const qtyOver = poLine !== undefined && line.quantity > poLine.quantity;
              const priceDiffers =
                poLine !== undefined && line.unitPriceMinor !== poLine.unitPriceMinor;
              return (
                <tr key={line.id}>
                  <Td className="px-2">
                    {line.description}
                    {!poLine && <span className="ml-2 text-xs text-review">not on PO</span>}
                  </Td>
                  <Td className="amount px-2 text-right">{poLine?.quantity ?? '—'}</Td>
                  <Td
                    className={cn('amount px-2 text-right', qtyOver && 'font-semibold text-failed')}
                  >
                    {line.quantity}
                    {qtyOver && <span className="sr-only"> (above PO quantity)</span>}
                  </Td>
                  <Td className="amount px-2 text-right">
                    {poLine ? formatMoney(poLine.unitPriceMinor, po.currency) : '—'}
                  </Td>
                  <Td
                    className={cn(
                      'amount px-2 text-right',
                      priceDiffers && 'font-semibold text-review',
                    )}
                  >
                    {formatMoney(line.unitPriceMinor, currency)}
                    {priceDiffers && <span className="sr-only"> (differs from PO)</span>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </CardBody>
    </Card>
  );
}
