# Next steps

Deferred work, tracked here instead of TODO comments.

- **Playwright happy path (milestone 6):** `pnpm e2e` is a placeholder that exits non-zero until the upload → auto-approved → ledger flow exists.
- **App containers (milestone 8):** `docker-compose.yml` runs Postgres only. Add a Dockerfile per app and compose services for them alongside the Cloud Run deploy.
- **shadcn/ui (milestone 6):** initialise when the first UI primitives (Button, Card, Badge, Table) are needed.
- **Invoice fixture PDFs (milestone 3):** the 10 sample invoices from DESIGN.md section 11, built against the seeded purchase orders in `fixtures/seed/purchase-orders.json`.
- **Cloud file storage (milestone 8):** `LocalFileStorage` writes to `UPLOAD_DIR`, which is ephemeral on Cloud Run. Add a GCS implementation of `FileStorage` and the 24-hour cleanup of public demo uploads (DESIGN.md section 13).
- **Job worker (milestone 3):** uploads queue a `PROCESS_INVOICE` job; nothing consumes it until the extraction pipeline lands.
