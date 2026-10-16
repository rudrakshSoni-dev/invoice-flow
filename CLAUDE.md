# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Working name: InvoiceFlow** — an AI agent that reads vendor invoices (PDF or email), extracts structured fields, matches them against purchase orders, flags mismatches, and writes the approved result to an ERP-style ledger.

Purpose: a focused, deployable demo that mirrors the back-office automation space (finance, procurement, vendor management) and is meant to be sent to a startup founder in a cold email. It must work end to end, run live at a public URL, and be understandable in 90 seconds.

Read `DESIGN.md` before building anything. It is the source of truth for product behavior, data model, agent pipeline, and UI.

## Non-goals

- Not a platform. One workflow, done well.
- No auth providers, billing, multi-tenancy, or admin panels beyond a single demo workspace.
- No real ERP integration. Use a mock ERP (Postgres tables + a small adapter interface) so a real one could be swapped in.
- No premature abstractions. Three similar lines beat a speculative framework.

## Stack

- Backend: TypeScript, Node.js, NestJS
- Frontend: React + TypeScript (Vite), Tailwind CSS
- Database: PostgreSQL (Prisma ORM)
- Agent layer: TypeScript orchestration calling an LLM through a thin provider interface (`LlmProvider`), so the model can be swapped via env var
- File parsing: `pdf-parse` first, vision-model fallback for scanned PDFs
- Queue: simple Postgres-backed job table (no Redis for the demo)
- Deploy: Docker, Google Cloud Run (backend + frontend), Cloud SQL or Neon for Postgres
- Tests: Vitest (frontend), Jest (backend), Playwright for one end-to-end happy path

## Repository layout

```
/
├── CLAUDE.md
├── DESIGN.md
├── README.md
├── docker-compose.yml
├── apps/
│   ├── api/                 # NestJS backend
│   │   ├── src/
│   │   │   ├── invoices/    # upload, list, detail, status transitions
│   │   │   ├── agent/       # pipeline: extract → match → decide → write
│   │   │   ├── llm/         # LlmProvider interface + implementations
│   │   │   ├── erp/         # ErpAdapter interface + MockErpAdapter
│   │   │   ├── vendors/
│   │   │   ├── purchase-orders/
│   │   │   └── common/
│   │   └── prisma/          # schema.prisma, migrations, seed.ts
│   └── web/                 # React frontend
│       └── src/
│           ├── pages/
│           ├── components/
│           └── lib/
├── fixtures/                # sample invoices (PDF) and POs used by seed + tests
└── docs/                    # architecture diagram, demo script
```

## Commands

```
pnpm install                 # install all workspaces
pnpm dev                     # run api + web together
pnpm --filter api test       # backend tests
pnpm --filter web test       # frontend tests
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed
pnpm e2e                     # Playwright happy path
pnpm lint && pnpm typecheck  # must pass before every commit
docker compose up            # local Postgres + app
```

## Environment variables

Document every variable in `.env.example`. Never commit real keys.

```
DATABASE_URL=
LLM_PROVIDER=gemini|anthropic|openai
LLM_API_KEY=
LLM_MODEL=
APP_BASE_URL=
MAX_UPLOAD_MB=10
```

## Coding conventions

- TypeScript strict mode on. No `any` unless commented with a reason.
- Validate every external input (uploads, LLM output) with Zod. LLM output is untrusted: parse, validate, and reject or retry on failure.
- Agent steps are pure-ish functions with typed input and output, each independently testable with fixtures.
- Every agent decision stores its reasoning and confidence in the database so the UI can show an audit trail.
- Money is stored as integer minor units plus a currency code. Never floats.
- Errors: throw typed domain errors in the service layer, map to HTTP in a single exception filter.
- Keep files small and named by what they do. Prefer clear names over comments.
- Conventional commits (`feat:`, `fix:`, `chore:`). Small commits, one concern each.

## Agent rules

- The agent must never silently auto-approve low-confidence results. Below the confidence threshold (default 0.85) or on any PO mismatch, status becomes `NEEDS_REVIEW`.
- Retries: max 2 on schema validation failure, then mark `FAILED` with the raw output stored for debugging.
- All LLM calls go through `LlmProvider` and are logged (prompt hash, latency, token usage, result status).
- Prompts live in `apps/api/src/agent/prompts/` as versioned files, not inline strings.

## Build order

Work in this order. Finish and verify each milestone before the next.

1. **Foundation:** monorepo, Prisma schema, seed data, docker-compose, CI running lint, typecheck, tests.
2. **Upload and storage:** invoice upload endpoint, file storage, list and detail endpoints.
3. **Extraction:** text extraction, LLM structured extraction with Zod validation, fixtures-based tests.
4. **Matching:** vendor and PO matching, mismatch rules (amount, quantity, currency, duplicate invoice number).
5. **Decision and ERP write:** auto-approve vs needs-review logic, `MockErpAdapter` posting to the ledger tables.
6. **UI:** dashboard, upload flow, invoice detail with extracted fields, match result, and audit trail, human approve/reject.
7. **Polish:** loading and error states, empty states, seed demo data that tells a story, responsive layout.
8. **Ship:** deploy to Cloud Run, record a 60-90 second demo video, write README with architecture diagram.

## Definition of done (per feature)

- Typecheck, lint, and tests pass.
- Happy path and at least one failure path tested.
- No console errors in the browser.
- Behavior matches `DESIGN.md`; if you deviate, update `DESIGN.md` in the same commit.

## Things to avoid

- Don't add dependencies without a clear reason; prefer the standard library and what's already installed.
- Don't build features not listed in `DESIGN.md`. Ask first.
- Don't hardcode demo data in components; it lives in the seed script and fixtures.
- Don't leave TODOs without a linked issue or a note in `docs/next-steps.md`.
