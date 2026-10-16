# InvoiceFlow

An AI agent that reads vendor invoices, extracts structured fields, matches them against purchase orders, flags mismatches, and posts approved results to an ERP-style ledger. Humans review anything the agent is not sure about, and every decision is auditable.

> Status: milestone 1 (foundation). See [`DESIGN.md`](DESIGN.md) for the product and technical design.

## Run locally

Requires Node 22+, pnpm, and Docker.

```sh
cp .env.example .env && docker compose up -d --wait   # Postgres (set POSTGRES_PORT and DATABASE_URL if 5432 is taken)
pnpm install && pnpm --filter api prisma migrate dev && pnpm --filter api prisma db seed
pnpm dev                                               # API on :3000, web on :5173
```

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test
```

## Layout

- `apps/api`: NestJS API, Prisma schema and seed
- `apps/web`: React + Vite + Tailwind frontend
- `fixtures/seed`: vendors and purchase orders loaded by the seed script
