#!/bin/sh
set -e

# If LITESTREAM_BUCKET is configured, manage continuous SQLite replication to GCS
if [ -n "$LITESTREAM_BUCKET" ]; then
  echo "[litestream] Checking for existing database replica in gs://${LITESTREAM_BUCKET}/db..."
  litestream restore -if-replica-exists -config /etc/litestream.yml /data/sanakenno.db || true

  # If Litestream restore found no replica, check if an initial seed database was uploaded to GCS
  if [ ! -f /data/sanakenno.db ] || [ ! -s /data/sanakenno.db ]; then
    echo "[seed] No Litestream replica found. Checking for initial seed in gs://${LITESTREAM_BUCKET}/seed.db..."
    TOKEN=$(curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p' || true)
    if [ -n "$TOKEN" ]; then
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "https://storage.googleapis.com/storage/v1/b/${LITESTREAM_BUCKET}/o/seed.db")
      if [ "$HTTP_CODE" = "200" ]; then
        echo "[seed] Found seed.db! Downloading directly to /data/sanakenno.db..."
        curl -s -f -H "Authorization: Bearer $TOKEN" \
          "https://storage.googleapis.com/storage/v1/b/${LITESTREAM_BUCKET}/o/seed.db?alt=media" \
          -o /data/sanakenno.db
        echo "[seed] Successfully seeded database from GCS ($(wc -c < /data/sanakenno.db) bytes)!"
      else
        echo "[seed] No seed.db found in GCS (HTTP $HTTP_CODE)."
      fi
    fi
  fi

  echo "[litestream] Starting Litestream replication alongside Sanakenno server..."
  exec litestream replicate -config /etc/litestream.yml -exec "pnpm --filter @sanakenno/server start"
else
  echo "[standalone] LITESTREAM_BUCKET not set. Running standalone server."
  exec pnpm --filter @sanakenno/server start
fi
