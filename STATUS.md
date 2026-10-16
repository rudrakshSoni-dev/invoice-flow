# Status

Last updated: 2026-10-16. Read this first in a new session, then `CLAUDE.md` and `DESIGN.md`.

## Where things stand

All 8 milestones in `CLAUDE.md` are built and committed on `main`. Nothing is deployed yet.

| Milestone                 | State                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Foundation             | Done                                                                                                                                                   |
| 2. Upload and storage     | Done                                                                                                                                                   |
| 3. Extraction             | Done; never run against the real model (no key yet)                                                                                                    |
| 4. Matching               | Done                                                                                                                                                   |
| 5. Decision and ERP write | Done                                                                                                                                                   |
| 6. UI                     | Done                                                                                                                                                   |
| 7. Polish                 | Done: demo history seed, Reset demo data, Retry for failed invoices, error states, lazy routes                                                         |
| 8. Ship                   | Code done: Dockerfiles, compose stack, Cloud Storage, 24-hour upload expiry, deploy script, README, demo script. **Not deployed, video not recorded.** |

Checks passing at the last commit: `pnpm lint`, `pnpm typecheck`, 104 API tests, 13 web tests, and the Playwright e2e test.

## Where to continue

These need the user (accounts, keys, a camera), in this order:

1. **Gemini key.** Add `LLM_API_KEY` to `.env`, then run `pnpm --filter api eval`. It overwrites `docs/eval.md`; commit the result. Confirm the default model `gemini-2.5-flash` still works, or set `LLM_MODEL`. Check the result against the 90% target, and fix prompts in `apps/api/src/agent/prompts/` if it misses.
2. **Postgres.** A managed database, e.g. Neon's free tier. Use the **direct** (non-pooled) connection string.
3. **Deploy.** Install `gcloud`, log in, and pick a project with billing enabled. Then run:
   ```sh
   PROJECT_ID=... DATABASE_URL='postgresql://...' LLM_API_KEY=... deploy/cloud-run.sh
   ```
   The script has never been run against a real project, so expect to fix small things on the first run. Then open the web URL, click Reset demo data, and try samples 01 and 02.
4. **Video.** Record from `docs/demo-script.md` against the deployed app.
5. **README.** Replace the "not deployed yet" line at the top with the live URL and the video link.
6. **GitHub.** Push the repo so CI (`.github/workflows/ci.yml`) runs for the first time.

Smaller deferred work is listed in `docs/next-steps.md`.

## Running it

- **Without a key:**
  ```sh
  pnpm --filter api serve:fixtures
  API_PROXY_TARGET=http://localhost:3100 pnpm --filter web dev
  ```
  The first command serves the API on :3100 with a stand-in model that only knows the 10 sample invoices.
- **Full stack in containers:** `docker compose up --build` serves the app on :8080. Then run `curl -X POST localhost:8080/api/demo/reset` to load the demo data. It uses the `app` database schema.
- **Development:** `docker compose up -d --wait postgres`, then `pnpm dev`.

## Environment notes (this machine)

- **Postgres** runs on host port **5434**, because 5432 and 5433 are taken by other containers; don't touch `auth-primetradeai-db-1`. `.env` already sets `POSTGRES_PORT=5434` and the matching `DATABASE_URL`.
- **Database schemas:**

  | Schema   | Used by                         |
  | -------- | ------------------------------- |
  | `public` | dev data                        |
  | `test`   | Jest                            |
  | `e2e`    | Playwright and `serve:fixtures` |
  | `app`    | docker compose app              |

- **Pinned versions:**
  - TypeScript ~6.0, because typescript-eslint doesn't support 7.
  - Prisma 6, because 7 is ESM-only and conflicts with Nest's CommonJS.
  - `prisma` is a production dependency because migrations run at container start.
- **Jest** needs `NODE_OPTIONS=--experimental-vm-modules` for pdf-parse 2.x; the test script already sets it.
- **`tsx`** can't emit Nest's decorator metadata. That's why `test/e2e-server.ts` loads the compiled `dist/`.
- **Stopping servers:** kill them by PID (from `ss -ltnp | grep :PORT`), not `pkill -f`.
- **Screenshots:** use Playwright with `chromium.launch({ channel: 'chrome' })`. Real Chrome renders the PDF iframe; headless Chromium leaves it blank.
- **Commits:** conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. When behavior deviates from `DESIGN.md`, update it in the same commit.
