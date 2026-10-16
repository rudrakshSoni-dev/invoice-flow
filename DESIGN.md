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
- Get text via `pdf-parse`. If it has fewer than 80 non-whitespace characters, the PDF is treated as scanned and the PDF itself is sent to a multimodal model (Gemini and Claude both read PDFs natively, so no page rasterising is needed).
- LLM returns JSON matching the extraction schema (Zod): vendor name, tax ID, invoice number, PO number, dates, currency, line items, subtotal, tax, total, and confidence per field group (vendor, invoice number, dates, currency, line items, totals). If the document is not an invoice it returns `isInvoice: false` with a reason, and the invoice is marked `FAILED`.
- Validate with Zod. On failure, retry up to 2 times with the validation error in the prompt. Then mark `FAILED` with every raw output stored in `rawExtraction`.
- Overall confidence is the lowest field-group confidence, multiplied by 0.9 for scanned (vision) documents.
- Sanity check: line totals must sum to subtotal, subtotal plus tax must equal total (within 1 minor unit). Each violation adds an `AMOUNT_MISMATCH` WARNING discrepancy and caps confidence at 0.6.
- Transport errors (rate limits, outages) are not extraction failures: the job is retried with backoff, up to 3 attempts in total, then the invoice is marked `FAILED`. Non-retryable errors (missing key, bad request) fail immediately.

### Stage 2: Match
- Vendor: exact tax ID match (ignoring case and separators), else fuzzy name match: lowercased word tokens with legal suffixes (Inc, LLC, GmbH, ...) removed, Dice similarity at least 0.75. No match yields `UNKNOWN_VENDOR` (BLOCKING: nothing can be posted without a vendor).
- PO: the PO number extracted from the invoice, else the vendor's open PO whose remaining balance is closest to the invoice subtotal (recorded as an INFO `NO_MATCHING_PO` note so the reviewer can see how it was matched). A printed PO number that belongs to another vendor is BLOCKING; one that does not exist is a WARNING and falls back to the amount match. No PO at all yields `NO_MATCHING_PO` (WARNING).
- Duplicate: same vendor plus invoice number already exists (ignoring `FAILED` and `REJECTED` invoices, so a corrected resubmission is allowed) yields `DUPLICATE_INVOICE` (BLOCKING).

### Stage 3: Check and decide
Rules, not LLM judgment:
- Currency differs from PO: BLOCKING (amounts are then not compared).
- Subtotal exceeds PO remaining balance (`totalMinor - billedMinor`) by more than 2%: BLOCKING. Within 2%: WARNING. The subtotal is used because PO amounts are pre-tax; comparing the tax-inclusive total would flag every taxed invoice. A fully billed PO is BLOCKING for any amount.
- Line quantity exceeds PO line quantity: BLOCKING. Invoice lines are paired with PO lines by description similarity (at least 0.6).
- Overall confidence below the threshold (`CONFIDENCE_THRESHOLD`, default 0.85): WARNING and forces review.
- Decision: no BLOCKING or WARNING discrepancies and confidence at or above the threshold yields `AUTO_APPROVED`. INFO notes do not block. Anything else yields `NEEDS_REVIEW`.
- For `NEEDS_REVIEW`, ask the LLM for a two-sentence plain-English explanation of the discrepancies and store it on the `DECIDED` audit event. If that call fails, the rule messages are used instead; the decision never depends on it.

### Stage 4: Post
- `ErpAdapter.postInvoice(invoice)` writes a `LedgerEntry` for the invoice total (account `6000`) and adds the subtotal to the PO's `billedMinor`, setting the PO to `PARTIALLY_BILLED` or `CLOSED`.
- `MockErpAdapter` implements it against Postgres. The interface is the seam for a real ERP.
- Human approval (`NEEDS_REVIEW` → `APPROVED`) posts the same way. It requires a matched vendor; an unknown-vendor invoice can only be rejected until vendor editing lands with the review UI.

Every stage writes an `AuditEvent`. Stages only read and call the LLM; their results (extraction, match, decision, and posting for auto-approved invoices) are written in one database transaction, so a crash or retry never leaves a half-processed invoice. With a remote ERP, posting would move to an outbox row delivered after commit.

## 8. API

```
POST   /invoices                 multipart upload, returns invoice id, status PROCESSING
GET    /invoices                 list with filters (status), pagination
GET    /invoices/:id             detail incl. lines, discrepancies, audit events, matched PO
PATCH  /invoices/:id             edit extracted fields during review (NEEDS_REVIEW only; amounts as decimal strings)
POST   /invoices/:id/approve     body: optional note; human approve, triggers posting
POST   /invoices/:id/reject      body: reason
POST   /invoices/:id/retry       FAILED only: clears the failed attempt and queues the invoice again
GET    /invoices/:id/file        signed URL or stream of the original PDF
GET    /ledger                   list ledger entries
GET    /purchase-orders          list POs with billed balance
GET    /stats                    counts by status, auto-approval rate, avg processing time
GET    /events (SSE)             live status updates for the dashboard
GET    /vendors                  vendors, for assigning one during review
GET    /samples                  the fixture invoices offered in "Try a sample invoice"
POST   /samples/:id              queue a fixture invoice exactly like an upload
POST   /demo/reset               reseed the demo workspace (with history) and delete uploaded files
```

- `PATCH` records a `REVIEWED` audit event listing each changed field (from/to). Discrepancies stay as the agent found them; the reviewer's edits and decision are the audit record. Assigning a vendor is how an unknown-vendor invoice becomes approvable.
- `/stats`: `processed` is every invoice no longer `PROCESSING`; auto-approval rate is `AUTO_APPROVED / processed`; processing time is upload to the `DECIDED` audit event.
- Retry records a `REVIEWED` audit event ("Retry requested by reviewer"); earlier agent runs and audit events are kept.
- `/events` sends `invoice.status` and `invoice.stage` (EXTRACT, MATCH, CHECK, POST) events, plus `demo.reset` so open tabs refetch after a reset, from an in-process bus. The demo runs as one instance; scaling out would move this to Postgres `LISTEN/NOTIFY`. The UI also polls while an invoice is `PROCESSING`, so a dropped connection only delays updates.

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
- Load errors: inline message with a "Try again" button; the review screen and ledger are lazy-loaded routes.
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

**Components** (shadcn/ui-style primitives in `apps/web/src/components/ui`, on Radix)
Button, Card, Badge, Table, Dialog, Toast, Skeleton, Tooltip, Progress stepper. Tabs were not needed: on narrow screens the detail page drops the PDF pane for an "View original PDF" link instead.

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

**Pre-seeded history** (`fixtures/history/manifest.json`, with rendered PDFs): six past invoices received over the last few weeks, written as if the pipeline and a reviewer had already handled them, against four extra history POs that end fully billed. Four auto-approved (including one in EUR), one over-billed print run approved with a reviewer note, and one invoice without a PO rejected. The last is Brightline's BL-0917, so sample invoice 3 arrives as a real duplicate. `prisma db seed` and `POST /demo/reset` load the history; tests seed vendors and POs only.

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

- Primary target: web on Vercel, API on Koyeb (free instance, from the API Dockerfile; settings in the README), Postgres on Neon.
  - `apps/web/vercel.json`: Vercel builds the static app (project root `apps/web`) and serves it with an SPA fallback. `VITE_API_URL` points the browser at the API directly; the API allows that origin through CORS (`APP_BASE_URL`). Vercel functions can't host the API, since it needs a background worker and a long-lived SSE stream.
  - The web app shows a "waking up the demo server" banner when `/health` hasn't answered within 3 seconds, and keeps checking for about a minute. Once the API answers, it refetches whatever failed while the API was asleep. The README tells visitors the first load can be slow, and points them to the video.
  - Koyeb's free instance has no volumes, so invoice files live in Postgres (`STORAGE_DRIVER=db`, the `StoredFile` table). It runs one instance and scales to zero after an hour idle; pending jobs resume on wake.
  - `render.yaml`: the same API setup as a Render Blueprint, as an alternative host.
- Alternative: Dockerfile per app, deployed to Cloud Run. Managed Postgres.
  - `deploy/cloud-run.sh` builds with Cloud Build and deploys two services. `invoiceflow-web` is nginx serving the static build and proxying `/api` to the API, so the browser stays same-origin and the SSE stream is unbuffered.
  - `invoiceflow-api` runs `prisma migrate deploy` at startup, as one instance (in-process event bus) with CPU always allocated so the worker keeps running after an upload returns.
  - Postgres is any managed instance reachable by a direct connection string (Neon or Cloud SQL). The script seeds the demo through `POST /demo/reset` when the database is empty.
- Secrets via environment variables, never committed.
- Public demo URL with the seeded workspace; a "Reset demo data" button in the footer.
- Uploaded files limited to 10 MB PDFs, scanned for type, and deleted after 24 hours in the public demo.
  - Files live in Postgres (`STORAGE_DRIVER=db`) on Koyeb or Render, Cloud Storage (`gcs`) on Cloud Run, local disk otherwise.
  - Expiry runs in the API (`UPLOAD_RETENTION_HOURS=24`, swept at boot and hourly) rather than as a bucket lifecycle rule, so the invoice row, its ledger entry and its PO billing are removed together with the file. Seeded history is never expired.

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
