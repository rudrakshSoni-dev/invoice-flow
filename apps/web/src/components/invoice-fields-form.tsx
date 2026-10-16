import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, type FieldConfidence, type InvoiceDetail, type InvoiceUpdate } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDate, formatMoney, minorToDecimal, toDateInput } from '../lib/format';
import { LOW_CONFIDENCE } from './confidence';
import { focusRing } from './ui/button';
import { Card, CardBody, CardHeader } from './ui/card';
import { Table, Td, Th } from './ui/table';

type FormValues = {
  vendorId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
};

function valuesFrom(invoice: InvoiceDetail): FormValues {
  return {
    vendorId: invoice.vendorId ?? '',
    invoiceNumber: invoice.invoiceNumber ?? '',
    issueDate: toDateInput(invoice.issueDate),
    dueDate: toDateInput(invoice.dueDate),
    currency: invoice.currency ?? '',
    subtotal: minorToDecimal(invoice.subtotalMinor, invoice.currency),
    tax: minorToDecimal(invoice.taxMinor, invoice.currency),
    total: minorToDecimal(invoice.totalMinor, invoice.currency),
  };
}

/** Form state for the reviewer, plus the minimal PATCH body for what they changed. */
export function useInvoiceForm(invoice: InvoiceDetail) {
  const original = useMemo(() => valuesFrom(invoice), [invoice]);
  const [values, setValues] = useState(original);
  const [baseline, setBaseline] = useState(original);
  if (baseline !== original) {
    setBaseline(original);
    setValues(original);
  }

  const changes = useMemo<InvoiceUpdate>(() => {
    const update: InvoiceUpdate = {};
    (Object.keys(values) as Array<keyof FormValues>).forEach((key) => {
      if (values[key] === original[key]) return;
      if (key === 'vendorId') update.vendorId = values.vendorId || null;
      else if (key === 'dueDate') update.dueDate = values.dueDate || null;
      else update[key] = values[key];
    });
    return update;
  }, [values, original]);

  return {
    values,
    setField: (key: keyof FormValues, value: string) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    changes,
    dirty: Object.keys(changes).length > 0,
    reset: () => setValues(original),
  };
}

type FieldDef = {
  key: keyof FormValues;
  label: string;
  group: keyof FieldConfidence;
  type?: string;
  mono?: boolean;
};

const FIELDS: FieldDef[] = [
  { key: 'invoiceNumber', label: 'Invoice number', group: 'invoiceNumber', mono: true },
  { key: 'currency', label: 'Currency', group: 'currency', mono: true },
  { key: 'issueDate', label: 'Issue date', group: 'dates', type: 'date' },
  { key: 'dueDate', label: 'Due date', group: 'dates', type: 'date' },
  { key: 'subtotal', label: 'Subtotal', group: 'totals', mono: true },
  { key: 'tax', label: 'Tax', group: 'totals', mono: true },
  { key: 'total', label: 'Total', group: 'totals', mono: true },
];

const inputClass = cn('h-10 w-full rounded-lg border bg-bg px-3 text-sm', focusRing);

function readOnlyValue(field: FieldDef, invoice: InvoiceDetail): string {
  switch (field.key) {
    case 'issueDate':
      return formatDate(invoice.issueDate);
    case 'dueDate':
      return formatDate(invoice.dueDate);
    case 'subtotal':
      return formatMoney(invoice.subtotalMinor, invoice.currency);
    case 'tax':
      return formatMoney(invoice.taxMinor, invoice.currency);
    case 'total':
      return formatMoney(invoice.totalMinor, invoice.currency);
    case 'currency':
      return invoice.currency ?? '—';
    default:
      return invoice.invoiceNumber ?? '—';
  }
}

function FieldConfidenceHint({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  const low = value < LOW_CONFIDENCE;
  return (
    <span className={cn('amount text-xs', low ? 'text-review' : 'text-text-muted')}>
      {low && 'Low · '}
      {value.toFixed(2)}
    </span>
  );
}

export function InvoiceFieldsForm({
  invoice,
  form,
  editable,
}: {
  invoice: InvoiceDetail;
  form: ReturnType<typeof useInvoiceForm>;
  editable: boolean;
}) {
  const vendors = useQuery({
    queryKey: ['vendors'],
    queryFn: api.vendors,
    enabled: editable,
    staleTime: 60_000,
  });
  const confidence = invoice.rawExtraction?.confidence;
  const extractedVendor = invoice.rawExtraction?.vendorName;
  const lowVendor = confidence !== undefined && confidence.vendor < LOW_CONFIDENCE;

  return (
    <Card>
      <CardHeader title="Extracted fields" />
      <CardBody className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="field-vendor" className="text-xs text-text-muted">
              Vendor
            </label>
            <FieldConfidenceHint value={confidence?.vendor} />
          </div>
          {editable ? (
            <select
              id="field-vendor"
              value={form.values.vendorId}
              onChange={(e) => form.setField('vendorId', e.target.value)}
              className={cn(
                inputClass,
                !form.values.vendorId || lowVendor ? 'border-review' : 'border-border',
              )}
            >
              <option value="">Unknown vendor</option>
              {vendors.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : (
            <p id="field-vendor" className="text-sm">
              {invoice.vendor?.name ?? 'Unknown vendor'}
            </p>
          )}
          {extractedVendor && extractedVendor !== invoice.vendor?.name && (
            <p className="mt-1 text-xs text-text-muted">
              Printed on invoice: {extractedVendor}
              {invoice.rawExtraction?.vendorTaxId && ` (${invoice.rawExtraction.vendorTaxId})`}
            </p>
          )}
        </div>

        <div
          className={cn('grid grid-cols-1 sm:grid-cols-2', editable ? 'gap-4' : 'gap-x-4 gap-y-3')}
        >
          {FIELDS.map((field) => {
            const fieldConfidence = confidence?.[field.group];
            const low = fieldConfidence !== undefined && fieldConfidence < LOW_CONFIDENCE;
            const id = `field-${field.key}`;
            return (
              <div key={field.key}>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor={id} className="text-xs text-text-muted">
                    {field.label}
                  </label>
                  <FieldConfidenceHint value={fieldConfidence} />
                </div>
                {editable ? (
                  <input
                    id={id}
                    type={field.type ?? 'text'}
                    inputMode={field.group === 'totals' ? 'decimal' : undefined}
                    value={form.values[field.key]}
                    onChange={(e) => form.setField(field.key, e.target.value)}
                    className={cn(
                      inputClass,
                      field.mono && 'amount',
                      low ? 'border-review' : 'border-border',
                    )}
                  />
                ) : (
                  <p
                    id={id}
                    className={cn('text-sm', field.mono && 'amount', low && 'text-review')}
                  >
                    {readOnlyValue(field, invoice)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {invoice.rawExtraction?.poNumber !== undefined && (
          <p className="text-xs text-text-muted">
            PO reference on invoice:{' '}
            <span className="amount text-text">
              {invoice.rawExtraction.poNumber ?? 'none printed'}
            </span>
          </p>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs text-text-muted">Line items</h3>
            <FieldConfidenceHint value={confidence?.lineItems} />
          </div>
          <Table>
            <thead>
              <tr>
                <Th className="px-2">Description</Th>
                <Th className="px-2 text-right">Qty</Th>
                <Th className="px-2 text-right">Unit</Th>
                <Th className="px-2 text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <Td className="px-2">{line.description}</Td>
                  <Td className="amount px-2 text-right">{line.quantity}</Td>
                  <Td className="amount px-2 text-right">
                    {formatMoney(line.unitPriceMinor, invoice.currency)}
                  </Td>
                  <Td className="amount px-2 text-right">
                    {formatMoney(line.totalMinor, invoice.currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </CardBody>
    </Card>
  );
}
