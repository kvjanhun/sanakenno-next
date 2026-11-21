# --- Build stage ---
FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace config and package.json files first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

COPY . .

# Compile @sanakenno/shared, @sanakenno/server, and @sanakenno/web
RUN pnpm --filter @sanakenno/shared build && \
    pnpm --filter @sanakenno/server build && \
    pnpm --filter @sanakenno/web build

# --- Production dependencies stage ---
FROM node:22-alpine AS prod-deps

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN pnpm install --prod --frozen-lockfile

# --- Runtime stage (lean Node 22, zero Corepack / pnpm / tsx / Litestream) ---
FROM node:22-alpine AS runtime

RUN apk add --no-cache tzdata ca-certificates
RUN addgroup -S sanakenno && adduser -S sanakenno -G sanakenno

WORKDIR /app

# Copy production node_modules and workspace manifests
COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /app/packages/server/package.json ./packages/server/package.json
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules

# Copy compiled shared & server JS, runtime server assets, and built frontend
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/assets/kotus_words.txt ./packages/server/assets/kotus_words.txt
COPY --from=build /app/packages/server/assets/pangram-quality.json ./packages/server/assets/pangram-quality.json
COPY --from=build /app/packages/web/dist ./dist

# Stamp the source commit into the frontend so CI can verify deployed SHA
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT
RUN echo "$GIT_COMMIT" > ./dist/commit.txt

ENV NODE_ENV=production
ENV PORT=3001
ENV STATIC_DIR=/app/dist
ENV SEED_ON_BOOT=false
ENV TZ=Europe/Helsinki

USER sanakenno

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3001}/api/health" || exit 1

CMD ["node", "packages/server/dist/index.js"]
