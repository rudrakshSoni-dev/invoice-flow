# InvoiceFlow

An AI agent that reads vendor invoices, extracts structured fields, matches them against purchase orders, flags mismatches, and posts approved results to an ERP-style ledger. Humans review anything the agent is not sure about, and every decision is auditable.

> Status: milestone 7 (polish). Deploy next. See [`DESIGN.md`](DESIGN.md) for the product and technical design.

## Run locally

Requires Node 22+, pnpm, and Docker.

```sh
cp .env.example .env && docker compose up -d --wait   # Postgres (set POSTGRES_PORT and DATABASE_URL if 5432 is taken)
pnpm install && pnpm --filter api prisma migrate dev && pnpm --filter api prisma db seed   # vendors, POs and demo history
pnpm dev                                               # API on :3000, web on :5173
```

Without an LLM key you can still click through the whole app: `pnpm --filter api serve:fixtures` starts the API on :3100 with a stand-in model that knows the sample invoices, then run the web app against it with `API_PROXY_TARGET=http://localhost:3100 pnpm --filter web dev`.

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e    # Playwright: reset demo → upload → auto-approved → ledger (first run: npx playwright install chromium)
```

## Fixtures and eval

```sh
pnpm --filter api fixtures:generate   # re-render fixtures/invoices/*.pdf from manifest.json (needs pdftoppm)
pnpm --filter api eval                # real-model extraction accuracy on the fixtures (needs LLM_API_KEY)
```

## Layout

- `apps/api`: NestJS API, Prisma schema and seed
- `apps/web`: React + Vite + Tailwind frontend
- `fixtures/seed`: vendors and purchase orders loaded by the seed script
- `fixtures/invoices`: 10 sample invoices covering each pipeline path, with ground truth in `manifest.json`
- `fixtures/history`: the past invoices the demo opens with (the "Reset demo data" footer button restores them)
