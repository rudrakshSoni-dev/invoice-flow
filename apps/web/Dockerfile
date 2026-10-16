# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-slim AS build
RUN npm install -g pnpm@12.9.1
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter web
COPY apps/web apps/web
RUN pnpm --filter web build

FROM nginx:1.27-alpine
# API_URL: where /api/* is proxied, e.g. the API's Cloud Run URL (no trailing slash).
ENV PORT=8080 API_URL=http://api:8080
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
