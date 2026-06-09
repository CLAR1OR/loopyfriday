# syntax=docker/dockerfile:1

# ---- Base with ffmpeg (used by the runtime worker) ----
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Production dependencies only ----
FROM base AS deps-prod
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Full dependencies + Next build ----
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No real secrets exist at build time (.env is not in the image); the route
# modules that read validated env are still imported during page-data
# collection, so load placeholders instead of failing. Real values are required
# at runtime, where this flag is unset.
ENV SKIP_ENV_VALIDATION=1
RUN npm run build

# ---- Runtime image (serves both `app` and `worker` via different commands) ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json package-lock.json next.config.ts tsconfig.json drizzle.config.ts ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
# Default command runs the web app; the worker service overrides this.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["app"]
