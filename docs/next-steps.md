# Next steps

Deferred work, tracked here instead of TODO comments.

- **Playwright happy path (milestone 6):** `pnpm e2e` is a placeholder that exits non-zero until the upload → auto-approved → ledger flow exists.
- **App containers (milestone 8):** `docker-compose.yml` runs Postgres only. Add a Dockerfile per app and compose services for them alongside the Cloud Run deploy.
- **shadcn/ui (milestone 6):** initialise when the first UI primitives (Button, Card, Badge, Table) are needed.
- **Invoice fixture PDFs (milestone 3):** the 10 sample invoices from DESIGN.md section 11, built against the seeded purchase orders in `fixtures/seed/purchase-orders.json`.
