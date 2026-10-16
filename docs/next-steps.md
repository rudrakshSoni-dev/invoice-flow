# Next steps

Deferred work, tracked here instead of TODO comments.

- **App containers (milestone 8):** `docker-compose.yml` runs Postgres only. Add a Dockerfile per app and compose services for them alongside the Cloud Run deploy.
- **Cloud file storage (milestone 8):** `LocalFileStorage` writes to `UPLOAD_DIR`, which is ephemeral on Cloud Run. Add a GCS implementation of `FileStorage` and the 24-hour cleanup of public demo uploads (DESIGN.md section 13).
- **Other LLM providers:** only `gemini` is implemented; `LLM_PROVIDER=anthropic|openai` fails at boot with a clear message. Add them behind `LlmProvider` if needed.
- **Extraction eval:** run `pnpm --filter api eval` with an API key and commit the generated `docs/eval.md`.
- **Line item editing:** reviewers can edit header fields and the vendor, not individual lines.
- **Bundle size (milestone 7):** the web bundle is ~504 kB minified (157 kB gzipped), just over Vite's 500 kB warning. Lazy-load the detail and ledger routes.
