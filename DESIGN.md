# DESIGN.md

Product and technical design for **InvoiceFlow**, an AI agent that turns vendor invoices into reconciled ledger entries.

## 1. Problem

Finance and procurement teams manually read invoices, retype fields into an ERP, and check each one against a purchase order. It is slow, error-prone, and repetitive. Mismatches (wrong amount, duplicate invoice, unknown vendor) get caught late or not at all.

## 2. Solution

Upload an invoice. The agent extracts the fields, finds the vendor and the matching purchase order, checks for discrepancies, and either posts it to the ledger automatically or routes it to a human with a clear explanation of what looks wrong.

The human stays in control: every decision is explainable and auditable.

## 3. Target demo audience

A startup founder working on AI agents for back-office operations. They should understand the value in 90 seconds and see that the builder can ship working, production-minded software.

## 4. Core user flow

1. User opens the dashboard and sees recent invoices with status badges.
2. User uploads an invoice PDF (or picks a sample invoice).
3. The invoice appears as `PROCESSING` and updates live as the agent works.
4. Agent finishes. Outcome is one of:
   - `AUTO_APPROVED`: high confidence, clean PO match, posted to ledger.
   - `NEEDS_REVIEW`: low confidence or a mismatch was found.
   - `FAILED`: could not extract valid data.
5. For `NEEDS_REVIEW`, the user opens the detail page, sees the extracted fields next to the PO, with discrepancies highlighted and the agent's reasoning. They approve (optionally editing fields) or reject.
6. Approved invoices appear in the ledger view.

## 5. Scope

### In scope
- Invoice upload (PDF, up to 10 MB)
- LLM-based structured extraction
- Vendor and PO matching with rule-based discrepancy checks
- Confidence-based routing
- Human review: approve, edit, reject
- Audit trail per invoice
- Ledger view (mock ERP)
- Seeded demo data and sample invoices

### Out of scope
- Authentication and multi-tenancy
- Real ERP integrations
- Email ingestion (listed as a next step in the README)
- Payment execution
- Multi-language invoices

## 6. Data model

All money is integer minor units plus ISO currency code.

**Vendor**: id, name, taxId, email, createdAt

**PurchaseOrder**: id, poNumber, vendorId, currency, totalMinor, billedMinor (sum posted to the ledger; remaining balance = totalMinor - billedMinor), status (OPEN, PARTIALLY_BILLED, CLOSED), createdAt
**PurchaseOrderLine**: id, purchaseOrderId, description, quantity, unitPriceMinor

**Invoice**: id, vendorId (nullable until matched), purchaseOrderId (nullable), invoiceNumber, issueDate, dueDate, currency, subtotalMinor, taxMinor, totalMinor, status (PROCESSING, AUTO_APPROVED, NEEDS_REVIEW, APPROVED, REJECTED, FAILED), confidence (0 to 1), fileKey, rawExtraction (jsonb), createdAt. Extracted fields are nullable because the row exists from upload, before extraction.
**InvoiceLine**: id, invoiceId, description, quantity, unitPriceMinor, totalMinor

**Discrepancy**: id, invoiceId, type (AMOUNT_MISMATCH, QUANTITY_MISMATCH, CURRENCY_MISMATCH, DUPLICATE_INVOICE, UNKNOWN_VENDOR, NO_MATCHING_PO, LOW_CONFIDENCE), severity (INFO, WARNING, BLOCKING), message, expected, actual

**AuditEvent**: id, invoiceId, step (UPLOADED, EXTRACTED, MATCHED, DECIDED, REVIEWED, POSTED), actor (AGENT or USER), summary, detail (jsonb), createdAt

**LedgerEntry**: id, invoiceId, vendorId, accountCode, amountMinor, currency, postedAt

**AgentRun**: id, invoiceId, promptVersion, promptHash, model, latencyMs, tokensIn, tokensOut, status (SUCCEEDED, INVALID_OUTPUT, ERROR), createdAt

**Job**: id, type, invoiceId, status (QUEUED, RUNNING, DONE, FAILED), attempts, runAt, lastError, createdAt. Postgres-backed queue for pipeline work; no Redis.

## 7. Agent pipeline

Four deterministic stages. The LLM is used only in stage 1 and, optionally, to explain results in stage 3.

### Stage 1: Extract
- Input: PDF file.
- Get text via `pdf-parse`. If text is empty or too short, send page images to a vision-capable model.
- LLM returns JSON matching the extraction schema (Zod): vendor name, tax ID, invoice number, dates, currency, line items, subtotal, tax, total, and a per-field confidence.
- Validate with Zod. On failure, retry up to 2 times with the validation error in the prompt. Then mark `FAILED`.
- Sanity check: line totals must sum to subtotal, subtotal plus tax must equal total (within 1 minor unit). Violations lower confidence and add a discrepancy.

### Stage 2: Match
- Vendor: exact tax ID match, else fuzzy name match (normalized, token-based). No match yields `UNKNOWN_VENDOR`.
- PO: look for a PO number in the invoice text, else the best open PO for that vendor by amount proximity. None yields `NO_MATCHING_PO`.
- Duplicate: same vendor plus invoice number already exists yields `DUPLICATE_INVOICE` (BLOCKING).

### Stage 3: Check and decide
Rules, not LLM judgment:
- Currency differs from PO: BLOCKING.
- Total exceeds PO remaining balance by more than 2%: BLOCKING. Within 2%: WARNING.
- Line quantity exceeds PO line quantity: BLOCKING.
- Overall confidence below 0.85: WARNING and forces review.
- Decision: no BLOCKING or WARNING discrepancies and confidence at or above the threshold yields `AUTO_APPROVED`. Anything else yields `NEEDS_REVIEW`.
- Optionally ask the LLM to write a two-sentence plain-English explanation of the discrepancies for the reviewer. Store it on the audit event.

### Stage 4: Post
- `ErpAdapter.postInvoice(invoice)` writes a `LedgerEntry` and updates PO billed balance.
- `MockErpAdapter` implements it against Postgres. The interface is the seam for a real ERP.

Every stage writes an `AuditEvent`.

## 8. API

```
POST   /invoices                 multipart upload, returns invoice id, status PROCESSING
GET    /invoices                 list with filters (status), pagination
GET    /invoices/:id             detail incl. lines, discrepancies, audit events, matched PO
PATCH  /invoices/:id             edit extracted fields during review
POST   /invoices/:id/approve     human approve, triggers posting
POST   /invoices/:id/reject      body: reason
GET    /invoices/:id/file        signed URL or stream of the original PDF
GET    /ledger                   list ledger entries
GET    /purchase-orders          list POs with billed balance
GET    /stats                    counts by status, auto-approval rate, avg processing time
GET    /events (SSE)             live status updates for the dashboard
```

## 9. Screens

### Dashboard
- Top row: four stat cards (Total processed, Auto-approved %, Needs review, Avg processing time).
- Primary action: "Upload invoice" button, plus "Try a sample invoice" dropdown.
- Table of invoices: vendor, invoice number, amount, status badge, confidence, received time. Rows update live. Click opens detail.
- Filter chips by status.

### Invoice detail
- Left: PDF viewer of the original.
- Right: extracted fields in an editable form, each with a small confidence indicator. Low-confidence fields are highlighted.
- Below: "Matched purchase order" card showing PO number, remaining balance, and line comparison.
- Discrepancy list with severity icons and the plain-English explanation.
- Sticky action bar: Approve, Reject (reason required).
- Collapsible audit trail timeline showing each pipeline step with timestamp and actor.

### Ledger
- Table of posted entries: date, vendor, invoice, account code, amount. Simple, read-only.

### Empty and loading states
- Empty dashboard: illustration-free, one sentence, and the sample invoice button.
- Processing: animated stage stepper (Extract, Match, Check, Post) with the current stage pulsing.
- Failure: clear message, show raw extraction for debugging, "Retry" button.

## 10. Visual design

Direction: calm, dense, trustworthy. This is a finance tool, so clarity beats flash.

**Colors**
- Background: #0B0D10 (dark) with surface #12151A and border #1F242C
- Text: primary #E8EAED, secondary #9AA3AE
- Accent: #4F8CFF
- Status: Approved #2EBD85, Needs review #F5A524, Failed/Rejected #F04438, Processing #4F8CFF
- Provide a light theme using the same semantic tokens; default to dark.

**Typography**
- UI: Inter. Numbers and IDs: JetBrains Mono, with tabular numerals for all amounts.
- Scale: 12, 14, 16, 20, 28.

**Layout**
- 8px spacing grid, 12px card radius, 1px borders instead of heavy shadows.
- Max content width 1200px. Table rows 48px tall.
- Responsive down to tablet; mobile shows the invoice list and a simplified detail.

**Components** (build with shadcn/ui primitives)
Button, Card, Badge, Table, Tabs, Dialog, Toast, Skeleton, Tooltip, Progress stepper.

**Motion**
- Subtle: 150ms fades, row highlight on live update, stepper pulse. No decorative animation.

**Accessibility**
- Status is never conveyed by color alone (icon and label too). Keyboard navigable. Visible focus rings. Contrast at least WCAG AA.

## 11. Seed data and demo story

The seed script creates:
- 6 vendors, 8 purchase orders.
- 10 sample invoice PDFs in `fixtures/` designed to cover each path:
  1. Clean invoice, exact PO match (auto-approved)
  2. Amount 5% over PO (needs review, blocking)
  3. Duplicate invoice number
  4. Unknown vendor
  5. Currency mismatch
  6. Scanned/low-quality PDF (vision fallback, lower confidence)
  7. Line item quantity above PO
  8. Math error in the invoice totals
  9. Missing PO reference but matchable by vendor and amount
  10. Garbage input (fails cleanly)

**Demo script (60-90 seconds)**
1. Open dashboard with pre-seeded history.
2. Upload invoice 1, watch it auto-approve and land in the ledger.
3. Upload invoice 2, open the review screen, show the highlighted discrepancy and explanation, approve with a note.
4. Show the audit trail and the stats updating.

## 12. Quality bar and testing

- Unit tests for each pipeline stage using fixtures, including every discrepancy rule.
- Contract test: LLM extraction output is validated against the Zod schema; malformed outputs trigger retries.
- One Playwright test covers upload to auto-approved to ledger.
- Lint, typecheck, and tests run in CI on every push.
- Target: extraction field accuracy at or above 90% on the fixture set, tracked in `docs/eval.md` with a small script that reruns it.

## 13. Deployment

- Dockerfile per app, deployed to Cloud Run. Managed Postgres.
- Secrets via environment variables, never committed.
- Public demo URL with the seeded workspace; a "Reset demo data" button in the footer.
- Uploaded files limited to 10 MB PDFs, scanned for type, and deleted after 24 hours in the public demo.

## 14. Next steps (list in README, do not build now)

- Email ingestion: forward invoices to an address and the agent processes them.
- Real ERP adapters (e.g. QuickBooks, SAP) behind `ErpAdapter`.
- Vendor follow-up agent for overdue or disputed invoices.
- Approval policies and spend limits by role.
- Feedback loop: reviewer corrections feed back into prompt examples.

## 15. README checklist

- One-paragraph pitch and the problem it solves.
- Demo video and live link at the very top.
- Architecture diagram (pipeline and components).
- How to run locally in three commands.
- Design decisions and trade-offs (why rules for decisions, why LLM only for extraction).
- Eval results and known limitations.
- Next steps.
