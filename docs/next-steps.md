# Next steps

Deferred work, tracked here instead of TODO comments.

- **App containers (milestone 8):** `docker-compose.yml` runs Postgres only. Add a Dockerfile per app and compose services for them alongside the Cloud Run deploy.
- **Cloud file storage (milestone 8):** `LocalFileStorage` writes to `UPLOAD_DIR`, which is ephemeral on Cloud Run. Add a GCS implementation of `FileStorage` and the 24-hour cleanup of public demo uploads (DESIGN.md section 13).
- **Duplicate fixture (milestone 7):** `03-duplicate-brightline.pdf` only triggers `DUPLICATE_INVOICE` if an invoice with the same vendor and number already exists, so the demo seed must include an earlier copy.
- **Other LLM providers:** only `gemini` is implemented; `LLM_PROVIDER=anthropic|openai` fails at boot with a clear message. Add them behind `LlmProvider` if needed.
- **Extraction eval:** run `pnpm --filter api eval` with an API key and commit the generated `docs/eval.md`.
- **Retry for failed invoices (milestone 7):** DESIGN.md section 9 asks for a "Retry" button on the failure state; it needs a `POST /invoices/:id/retry` that clears the failed attempt and requeues the job.
- **Reset demo data (milestone 7/8):** footer button from DESIGN.md section 13.
- **Line item editing:** reviewers can edit header fields and the vendor, not individual lines.
