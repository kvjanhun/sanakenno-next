#!/bin/sh
set -e

# If LITESTREAM_BUCKET is configured, manage continuous SQLite replication to GCS
if [ -n "$LITESTREAM_BUCKET" ]; then
  echo "[litestream] Checking for existing database replica in gs://${LITESTREAM_BUCKET}/db..."
  litestream restore -if-replica-exists -config /etc/litestream.yml /data/sanakenno.db || true

  echo "[litestream] Starting Litestream replication alongside Sanakenno server..."
  exec litestream replicate -config /etc/litestream.yml -exec "pnpm --filter @sanakenno/server start"
else
  echo "[standalone] LITESTREAM_BUCKET not set. Running standalone server."
  exec pnpm --filter @sanakenno/server start
fi
