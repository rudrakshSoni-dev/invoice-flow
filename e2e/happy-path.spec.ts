import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const CLEAN_INVOICE = join(__dirname, '../fixtures/invoices/01-clean-acme.pdf');

test('upload an invoice, watch it auto-approve, and find it in the ledger', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(msg.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/');
  await expect(page.getByText(/No invoices yet/)).toBeVisible();

  await page.getByLabel('Upload invoice PDF').setInputFiles(CLEAN_INVOICE);
  // Radix also mirrors toast text into a screen-reader live region, so target the visible toast.
  await expect(page.getByRole('listitem').filter({ hasText: 'Invoice received' })).toBeVisible();

  const row = page.getByRole('row', { name: /INV-A-2041/ });
  await expect(row.getByText('Auto-approved')).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText('Acme Office Supplies Inc.');
  await expect(row).toContainText('$1,494.72');
  await expect(page.getByText('100%')).toBeVisible();

  await row.getByRole('link', { name: 'Acme Office Supplies Inc.' }).click();
  await expect(page.getByRole('heading', { name: /INV-A-2041/ })).toBeVisible();
  await expect(page.getByText('Posted $1,494.72 to account 6000')).toBeVisible();

  await page.getByRole('link', { name: 'Ledger' }).click();
  const entry = page.getByRole('row', { name: /INV-A-2041/ });
  await expect(entry).toContainText('Acme Office Supplies Inc.');
  await expect(entry).toContainText('$1,494.72');

  expect(problems).toEqual([]);
});
