# Status

Last updated: 2026-10-17. Read this first in a new session, then `CLAUDE.md` and `DESIGN.md`.

## Where things stand

All 8 milestones in `CLAUDE.md` are built and committed on `main`. Nothing is deployed yet.

| Milestone                 | State                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Foundation             | Done                                                                                                                                                                                                                                                               |
| 2. Upload and storage     | Done                                                                                                                                                                                                                                                               |
| 3. Extraction             | Done; 100% field accuracy (109/109 fields) with gemini-3.8-flash (see `docs/eval.md`)                                                                                                                                                                              |
| 4. Matching               | Done                                                                                                                                                                                                                                                               |
| 5. Decision and ERP write | Done                                                                                                                                                                                                                                                               |
| 6. UI                     | Done                                                                                                                                                                                                                                                               |
| 7. Polish                 | Done: demo history seed, Reset demo data, Retry for failed invoices, error states, lazy routes                                                                                                                                                                     |
| 8. Ship                   | Code done: Dockerfiles, compose stack, Vercel + Koyeb deploy steps (Render Blueprint and Cloud Run script as alternatives), Postgres file storage, Cloud Storage, 24-hour upload expiry, deploy script, README, demo script. **Not deployed, video not recorded.** |

Checks passing: `pnpm lint`, `pnpm typecheck`, 106 API tests, 15 web tests, Playwright e2e test, and extraction eval (100% on 10 fixtures).

## Where to continue

These need the user (accounts, keys, a camera), in this order:

1. **Gemini key.** Done: `gemini-3.8-flash` scored 109/109 (100%) on all 10 fixtures (see `docs/eval.md`). Enable billing or keep key handy before public demo traffic so the free tier doesn't dry up.
2. **Postgres.** Create a Neon database and copy the **direct** (non-pooled) connection string. Give it only to Koyeb. Keep `.env` pointing at the local container (`localhost:5434`), because Jest and Playwright read `DATABASE_URL` from `.env` and reset whatever database it names.
3. **Deploy.** Follow README "Deploy": the API on Koyeb's free instance (Dockerfile `apps/api/Dockerfile`, port 8080, `STORAGE_DRIVER=db`), then the web app on Vercel (Root Directory `apps/web`, `VITE_API_URL` = the Koyeb URL), then set Koyeb's `APP_BASE_URL` to the Vercel URL. Neither has been run against a real account yet, so expect small fixes on the first run. Then `curl -X POST <api>/demo/reset`, open the Vercel URL, and try samples 01 and 02.
4. **Video.** Record from `docs/demo-script.md` against the deployed app.
5. **README.** Replace the "not deployed yet" line at the top with the live URL and the video link.
6. **GitHub.** Done: public at https://github.com/rudrakshSoni-dev/invoice-flow, and CI passes on `main`. Connect Koyeb and Vercel to this repo.

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
