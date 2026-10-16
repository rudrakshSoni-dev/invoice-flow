# Next steps

Deferred work, tracked here instead of TODO comments.

- **Playwright happy path (milestone 6):** `pnpm e2e` is a placeholder that exits non-zero until the upload → auto-approved → ledger flow exists.
- **App containers (milestone 8):** `docker-compose.yml` runs Postgres only. Add a Dockerfile per app and compose services for them alongside the Cloud Run deploy.
- **shadcn/ui (milestone 6):** initialise when the first UI primitives (Button, Card, Badge, Table) are needed.
- **Cloud file storage (milestone 8):** `LocalFileStorage` writes to `UPLOAD_DIR`, which is ephemeral on Cloud Run. Add a GCS implementation of `FileStorage` and the 24-hour cleanup of public demo uploads (DESIGN.md section 13).
- **Pipeline stops after extraction (milestone 4):** extracted invoices stay `PROCESSING` until the match, decide and post stages are added to `InvoicePipeline.process`.
- **Duplicate fixture (milestone 4/7):** `03-duplicate-brightline.pdf` only triggers `DUPLICATE_INVOICE` if an invoice with the same vendor and number already exists, so the demo seed must include an earlier copy.
- **Other LLM providers:** only `gemini` is implemented; `LLM_PROVIDER=anthropic|openai` fails at boot with a clear message. Add them behind `LlmProvider` if needed.
- **Extraction eval:** run `pnpm --filter api eval` with an API key and commit the generated `docs/eval.md`.
