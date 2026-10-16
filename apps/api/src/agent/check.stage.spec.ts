import { type CheckInput, checkAgainstPurchaseOrder, decide } from './check.stage';
import type { PurchaseOrderCandidate } from './match.stage';

const THRESHOLD = 0.85;

const purchaseOrder: PurchaseOrderCandidate = {
  id: 'po-1',
  poNumber: 'PO-1006',
  vendorId: 'v-acme',
  currency: 'USD',
  totalMinor: 279000,
  billedMinor: 0,
  status: 'OPEN',
  lines: [{ id: 'l-1', description: 'Ergonomic task chair', quantity: 10, unitPriceMinor: 27900 }],
};

function input(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    currency: 'USD',
    subtotalMinor: 279000,
    confidence: 0.95,
    lines: [
      {
        description: 'Ergonomic task chair',
        quantity: 10,
        unitPriceMinor: 27900,
        totalMinor: 279000,
      },
    ],
    purchaseOrder,
    ...overrides,
  };
}

const check = (overrides?: Partial<CheckInput>) =>
  checkAgainstPurchaseOrder(input(overrides), THRESHOLD);

describe('checkAgainstPurchaseOrder', () => {
  it('passes an invoice that matches its PO exactly', () => {
    expect(check()).toEqual([]);
  });

  it('blocks a currency mismatch and skips the amount comparison', () => {
    expect(check({ currency: 'EUR', subtotalMinor: 999999 })).toMatchObject([
      { type: 'CURRENCY_MISMATCH', severity: 'BLOCKING', expected: 'USD', actual: 'EUR' },
    ]);
  });

  it('warns when the subtotal is over the remaining balance by 2% or less', () => {
    expect(check({ subtotalMinor: 284580, lines: [] })).toMatchObject([
      { type: 'AMOUNT_MISMATCH', severity: 'WARNING' },
    ]);
  });

  it('blocks when the subtotal is more than 2% over the remaining balance', () => {
    const [issue] = check({ subtotalMinor: 292950, lines: [] });
    expect(issue).toMatchObject({ type: 'AMOUNT_MISMATCH', severity: 'BLOCKING' });
    expect(issue?.message).toContain('5.0% over');
  });

  it('measures against what is left after earlier billing', () => {
    const partlyBilled = { ...purchaseOrder, billedMinor: 200000 };
    expect(check({ subtotalMinor: 79000, lines: [], purchaseOrder: partlyBilled })).toEqual([]);
    expect(check({ subtotalMinor: 100000, lines: [], purchaseOrder: partlyBilled })).toMatchObject([
      { severity: 'BLOCKING' },
    ]);
  });

  it('blocks any billing against a fully billed PO', () => {
    expect(
      check({
        subtotalMinor: 1000,
        lines: [],
        purchaseOrder: { ...purchaseOrder, billedMinor: 279000 },
      }),
    ).toMatchObject([
      {
        type: 'AMOUNT_MISMATCH',
        severity: 'BLOCKING',
        message: expect.stringContaining('fully billed'),
      },
    ]);
  });

  it('blocks a line quantity above the PO line quantity', () => {
    const issues = check({
      lines: [
        {
          description: 'Ergonomic task chairs',
          quantity: 12,
          unitPriceMinor: 27900,
          totalMinor: 334800,
        },
      ],
      subtotalMinor: 279000,
    });
    expect(issues).toMatchObject([
      { type: 'QUANTITY_MISMATCH', severity: 'BLOCKING', expected: '<= 10', actual: '12' },
    ]);
  });

  it('adds a low-confidence warning below the threshold', () => {
    expect(check({ confidence: 0.84 })).toMatchObject([
      { type: 'LOW_CONFIDENCE', severity: 'WARNING' },
    ]);
    expect(check({ confidence: 0.85 })).toEqual([]);
  });

  it('only checks confidence when there is no PO', () => {
    expect(check({ purchaseOrder: null })).toEqual([]);
  });
});

describe('decide', () => {
  const info = { type: 'NO_MATCHING_PO', severity: 'INFO', message: 'matched by amount' } as const;
  const warning = { ...info, severity: 'WARNING' } as const;

  it('auto-approves clean, confident invoices (INFO notes allowed)', () => {
    expect(decide([], 0.9, THRESHOLD)).toBe('AUTO_APPROVED');
    expect(decide([info], 0.85, THRESHOLD)).toBe('AUTO_APPROVED');
  });

  it('routes warnings, blocking issues, and low confidence to review', () => {
    expect(decide([warning], 0.99, THRESHOLD)).toBe('NEEDS_REVIEW');
    expect(decide([{ ...info, severity: 'BLOCKING' }], 0.99, THRESHOLD)).toBe('NEEDS_REVIEW');
    expect(decide([], 0.84, THRESHOLD)).toBe('NEEDS_REVIEW');
  });
});
