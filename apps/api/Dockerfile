# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@12.9.1
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api
COPY apps/api apps/api
RUN pnpm --filter api exec prisma generate && pnpm --filter api build
# Production dependencies only (prisma stays: it runs the migrations at startup).
RUN pnpm --filter api deploy --prod --legacy /out \
  && cd /out && node_modules/.bin/prisma generate

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080
# Same layout as the repo, so FIXTURES_DIR's default (../../fixtures from the API) resolves.
WORKDIR /repo/apps/api
COPY --from=build /out/node_modules node_modules
COPY --from=build /out/package.json package.json
COPY --from=build /repo/apps/api/prisma prisma
COPY --from=build /repo/apps/api/dist dist
COPY fixtures /repo/fixtures
# Local-disk storage (STORAGE_DRIVER=local) writes here; Cloud Run uses a bucket instead.
RUN mkdir uploads && chown node uploads
USER node
EXPOSE 8080
# Migrations are idempotent, so every instance applies pending ones before it starts serving.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
