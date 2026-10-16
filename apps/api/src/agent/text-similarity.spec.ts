import { nameSimilarity, normalizeCode } from './text-similarity';

describe('nameSimilarity', () => {
  it('ignores case, punctuation, word order and legal suffixes', () => {
    expect(nameSimilarity('Northwind Logistics LLC', 'northwind logistics')).toBe(1);
    expect(nameSimilarity('ACME Office Supplies, Inc.', 'Acme Office Supplies Inc.')).toBe(1);
    expect(nameSimilarity('Supplies Office Acme', 'Acme Office Supplies')).toBe(1);
  });

  it('scores partial and unrelated names lower', () => {
    expect(nameSimilarity('Acme Supplies', 'Acme Office Supplies Inc.')).toBeCloseTo(0.8);
    expect(nameSimilarity('Zenith Consulting Partners', 'Cedar IT Services')).toBe(0);
    expect(nameSimilarity('Inc.', 'LLC')).toBe(0);
  });
});

describe('normalizeCode', () => {
  it('strips separators and case', () => {
    expect(normalizeCode('us-84 1029384')).toBe('US841029384');
  });
});
