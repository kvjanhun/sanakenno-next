# --- Build stage ---
FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config and package.json files first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

COPY . .

# Build frontend (@sanakenno/web)
RUN pnpm --filter @sanakenno/web build

# --- Runtime stage ---
FROM node:22-alpine AS runtime

RUN apk add --no-cache python3 make g++ tzdata
RUN corepack enable && corepack prepare pnpm@latest --activate

RUN addgroup -S sanakenno && adduser -S sanakenno -G sanakenno

WORKDIR /app

# Copy workspace config and package.json files for production install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile && apk del python3 make g++

# Copy built frontend
COPY --from=build /app/packages/web/dist ./dist

# Stamp the source commit into the frontend so deploy script and CI can verify
ARG GIT_COMMIT=unknown
RUN echo "$GIT_COMMIT" > ./dist/commit.txt

# Copy shared and server sources and assets needed at runtime
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Data directory for SQLite (volume mount for Litestream / host persistence)
RUN mkdir -p /data && chown sanakenno:sanakenno /data
VOLUME /data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data
ENV DB_PATH=/data/sanakenno.db
ENV TZ=Europe/Helsinki

USER sanakenno

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["pnpm", "--filter", "@sanakenno/server", "start"]
