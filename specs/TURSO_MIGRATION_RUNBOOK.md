# Turso Migration Runbook (Human Setup + Zero-Data-Loss Cutover)

This runbook coordinates the **human setup steps** and the **CLI cutover procedure** for moving Sanakenno from `Cloud Run + Litestream + GCS` to `Cloud Run + Turso (libSQL)` with **zero lost player data**.

---

## Quick Answer: Downtime & Player Data Safety

### Do we need to put Sanakenno down?
**Yes — for ~2 minutes** during the final database snapshot & upload (best done during a quiet window, e.g., late night Finnish time).

**Why?** While the old Litestream container is accepting writes, any word or sync saved *after* we take a GCS snapshot would be missed in Turso. By briefly switching Cloud Run to `MAINTENANCE_MODE=true` (added in **Spec 35**):
1. The maintenance revision boots **without** Litestream or SQLite, passes Cloud Run's `/api/health` check, and takes 100% of traffic (`503` Finnish maintenance message).
2. Cloud Run sends `SIGTERM` to the old Litestream revision, which stops HTTP traffic, runs `PRAGMA wal_checkpoint(TRUNCATE)`, and flushes the **very last** transaction to GCS before exiting.
3. Zero writes can occur during the ~2 minutes while we restore from GCS, verify integrity, upload to Turso, verify 100% table parity, and switch Cloud Run to Turso.

### Will active players lose their in-progress game during those 2 minutes?
**No.** Sanakenno saves every found word locally in `localStorage` first and retries cloud sync automatically with monotonic merging (`mergePuzzleStates` / `mergePlayerStats`). Anyone playing during the 2-minute window keeps their progress locally and syncs automatically once Turso comes live.

### Can we roll back instantly if anything goes wrong?
**Yes.** We never touch or delete the GCS bucket during cutover, and we also upload a verified SQLite backup (`pre-turso-YYYY-MM-DD.db`) to GCS before touching Turso. Rolling back is a single `gcloud run services update-traffic` command back to the previous revision.

---

## Part 1: What YOU Need to Do (One-Time Account Setup — ~3 Minutes)

You only need to **create a Turso account and log in on your Mac**. Once you are logged in, the agent can run every CLI command for you (creating the Stockholm database, migrating data, creating GCP secrets, verifying parity, and cutting over).

### Step 1. Install the Turso CLI
*(You can run this yourself, or ask the agent to run it for you.)*
```sh
brew install tursodatabase/tap/turso
```

### Step 2. Sign up / Log in to Turso
Run this in your terminal — it opens your browser so you can sign up with GitHub (Free plan, no credit card needed):
```sh
turso auth signup
```
*(If you already created an account at https://app.turso.tech, run `turso auth login` instead.)*

### Step 3. Confirm CLI login works
```sh
turso auth whoami
```
Once this prints your Turso username, **your manual setup is done!** Tell the agent you're logged in and ready for cutover.

---

## Part 2: Automated Cutover Steps (Handled via CLI Together After Spec 35 Ships)

> **Prerequisite:** **Spec 35** must be merged to `main` and deployed to Cloud Run first. (Spec 35 changes nothing in production until `MAINTENANCE_MODE` or `TURSO_DATABASE_URL` is set.)

### Phase A — Pre-Cutover Prep (Zero Downtime)
1. **Create the Nordic Turso group** (AWS Stockholm, ~10–15 ms from Cloud Run `europe-north1` Hamina):
   ```sh
   turso group create sanakenno-eu --location aws-eu-north-1
   ```
2. **Dry-run restore from GCS** using your locally installed `litestream` (`v0.5.18`) to verify local GCS credentials work before entering maintenance mode:
   ```sh
   gcloud auth application-default login   # only if ADC is not yet configured
   LITESTREAM_BUCKET=sanakenno-db-712588936092 litestream restore -config litestream.yml -o /tmp/sanakenno-dryrun.db /data/sanakenno.db
   sqlite3 /tmp/sanakenno-dryrun.db "PRAGMA integrity_check;"
   rm -f /tmp/sanakenno-dryrun.db*
   ```

### Phase B — Live Cutover (~2-Minute Maintenance Window)
1. **Enter Maintenance Mode & Flush Final Writes:**
   Deploy a maintenance revision (`MAINTENANCE_MODE=true`, `LITESTREAM_BUCKET` cleared so no second Litestream process starts):
   ```sh
   gcloud run services update sanakenno-next \
     --region europe-north1 \
     --update-env-vars MAINTENANCE_MODE=true \
     --remove-env-vars LITESTREAM_BUCKET
   ```
   Wait ~15–20 seconds and verify in Cloud Run logs that the previous Litestream revision received `SIGTERM`, checkpointed WAL, uploaded its final LTX file, and exited cleanly.

2. **Restore the Final Authoritative SQLite Snapshot:**
   ```sh
   rm -f /tmp/sanakenno-final.db*
   LITESTREAM_BUCKET=sanakenno-db-712588936092 litestream restore -config litestream.yml -o /tmp/sanakenno-final.db /data/sanakenno.db
   ```

3. **Checkpoint & Verify Integrity + Save Immutable Backup:**
   ```sh
   sqlite3 /tmp/sanakenno-final.db "PRAGMA journal_mode = WAL; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;"
   gcloud storage cp /tmp/sanakenno-final.db gs://sanakenno-db-712588936092/backups/pre-turso-$(date +%Y-%m-%d-%H%M).db
   ```
   Confirm `PRAGMA integrity_check;` prints `ok` and `PRAGMA journal_mode;` prints `wal`.

4. **Upload Snapshot to Turso & Create Auth Token:**
   ```sh
   turso db create sanakenno --group sanakenno-eu --from-file /tmp/sanakenno-final.db
   TURSO_URL=$(turso db show sanakenno --url)
   TURSO_TOKEN=$(turso db tokens create sanakenno)
   ```

5. **Prove 100% Player & Puzzle Data Parity (Hard Gate):**
   Run the parity script comparing `/tmp/sanakenno-final.db` against live Turso across all 17 tables (row counts + player score sums + latest timestamps + active puzzles):
   ```sh
   TURSO_DATABASE_URL="$TURSO_URL" TURSO_AUTH_TOKEN="$TURSO_TOKEN" \
     pnpm exec tsx scripts/verify-turso-parity.ts /tmp/sanakenno-final.db
   ```
   **Do NOT proceed if this script exits non-zero.**

6. **Store Credentials in GCP Secret Manager (Same Pattern as `resend-api-key`):**
   ```sh
   printf '%s' "$TURSO_URL" | gcloud secrets create turso-database-url --data-file=-
   printf '%s' "$TURSO_TOKEN" | gcloud secrets create turso-auth-token --data-file=-
   ```
   *(Grant `roles/secretmanager.secretAccessor` to the Cloud Run runtime service account if not already granted project-wide.)*

7. **Exit Maintenance Mode & Cut Over Cloud Run to Turso:**
   ```sh
   gcloud run services update sanakenno-next \
     --region europe-north1 \
     --remove-env-vars MAINTENANCE_MODE \
     --update-secrets TURSO_DATABASE_URL=turso-database-url:latest,TURSO_AUTH_TOKEN=turso-auth-token:latest
   ```

8. **Verify Live Production (`sanakenno.fi`):**
   - `curl -fsS https://sanakenno.fi/api/health` → must return `"status":"ok"` and `"engine":"kysely-libsql"` with matching `total_puzzles`.
   - Open `https://sanakenno.fi`, play/sync a word, check archive, and verify admin login works.
   - Delete local temp file once confirmed: `rm -f /tmp/sanakenno-final.db*`.

### Phase C — Post-Cutover Cleanup (After 24–48h of Clean Production Run)
- Approve and execute **Spec 36** (`specs/36-compiled-server-runtime-and-litestream-retirement.md`) to:
  - Remove Litestream from the Docker image and repo.
  - Compile the server to JS (eliminating Corepack `pnpm` cold-start downloads and `tsx` runtime overhead).
  - Lower Cloud Run memory back to `512Mi` and raise `--max-instances` to `3`.
  - Update `.github/workflows/ci-web.yml` permanently so future pushes deploy cleanly with Turso secrets.
- Keep `gs://sanakenno-db-712588936092/backups/pre-turso-*.db` for 30 days as a cold archive; optionally delete the bloated `db/ltx/` folder once satisfied.

---

## Emergency Rollback (If Needed During Cutover)

If any verification fails before or right after Step 7:
1. List recent revisions:
   ```sh
   gcloud run revisions list --service sanakenno-next --region europe-north1 --limit 5
   ```
2. Route 100% traffic immediately back to the last pre-maintenance Litestream revision:
   ```sh
   gcloud run services update-traffic sanakenno-next --region europe-north1 --to-revisions <LAST_LITESTREAM_REVISION>=100
   ```
Because the legacy GCS bucket was never modified during cutover, production resumes from its exact pre-cutover state.
