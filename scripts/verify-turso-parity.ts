#!/usr/bin/env -S npx tsx

/**
 * Verify 100% table-by-table and data-invariant parity between a local SQLite snapshot
 * and a remote Turso (libSQL) database.
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
 *     pnpm exec tsx scripts/verify-turso-parity.ts <local-sqlite-path>
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from '@libsql/client';
import { openReadonlySqlite } from '../packages/server/src/db/connection.js';
import { createLibsqlClient } from '../packages/server/src/db/libsql-dialect.js';

export const PARITY_TABLES = [
  'puzzles',
  'blocked_words',
  'achievements',
  'page_views',
  'combinations',
  'suggestion_rejections',
  'admins',
  'sessions',
  'admin_log',
  'config',
  'failed_guesses',
  'word_finds',
  'players',
  'player_sessions',
  'player_transfer_tickets',
  'player_stats',
  'player_puzzle_states',
  'schema_migrations',
] as const;

export interface TableCountComparison {
  table: string;
  localCount: number;
  remoteCount: number;
  match: boolean;
}

export interface InvariantComparison {
  name: string;
  localValue: string | number | null;
  remoteValue: string | number | null;
  match: boolean;
}

export interface ParityReport {
  ok: boolean;
  localIntegrity: string;
  tableCounts: TableCountComparison[];
  invariants: InvariantComparison[];
  mismatches: string[];
}

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  return Number(val);
}

function toNullableNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  return Number(val);
}

function toNullableStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

async function queryRemoteScalar(remoteClient: Client, query: string): Promise<unknown> {
  const result = await remoteClient.execute(query);
  const firstRow = result.rows[0];
  return firstRow ? firstRow[0] : null;
}

async function queryRemoteRow(
  remoteClient: Client,
  query: string,
): Promise<Record<string, unknown>> {
  const result = await remoteClient.execute(query);
  const firstRow = result.rows[0];
  const obj: Record<string, unknown> = {};
  if (!firstRow) return obj;
  for (let i = 0; i < result.columns.length; i += 1) {
    obj[result.columns[i]!] = firstRow[i];
  }
  return obj;
}

/**
 * Compare a local SQLite snapshot against a libSQL/Turso client across integrity,
 * all 18 schema tables, and high-signal domain invariants.
 */
export async function verifyDatabaseParity(
  localSqlitePath: string,
  remoteClient: Client,
): Promise<ParityReport> {
  const localDb = openReadonlySqlite(localSqlitePath);
  try {
    const integrityRow = localDb.prepare('PRAGMA integrity_check').get() as
      { integrity_check: string } | undefined;
    const localIntegrity = integrityRow?.integrity_check ?? 'unknown';

    const tableCounts: TableCountComparison[] = [];
    const mismatches: string[] = [];

    if (localIntegrity !== 'ok') {
      mismatches.push(`local PRAGMA integrity_check failed: ${localIntegrity}`);
    }

    for (const table of PARITY_TABLES) {
      const localRow = localDb.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as {
        cnt: number;
      };
      const remoteCnt = toNum(
        await queryRemoteScalar(remoteClient, `SELECT COUNT(*) AS cnt FROM ${table}`),
      );
      const localCnt = toNum(localRow.cnt);
      const match = localCnt === remoteCnt;
      tableCounts.push({ table, localCount: localCnt, remoteCount: remoteCnt, match });
      if (!match) {
        mismatches.push(`table ${table}: local=${localCnt} remote=${remoteCnt}`);
      }
    }

    const invariants: InvariantComparison[] = [];
    const recordInvariant = (
      name: string,
      localValue: string | number | null,
      remoteValue: string | number | null,
    ) => {
      const match = localValue === remoteValue;
      invariants.push({ name, localValue, remoteValue, match });
      if (!match) {
        mismatches.push(
          `invariant ${name}: local=${String(localValue)} remote=${String(remoteValue)}`,
        );
      }
    };

    // puzzles: active count + SUM(COALESCE(max_score, 0))
    const localPuzzles = localDb
      .prepare(
        'SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_cnt, SUM(COALESCE(max_score, 0)) AS sum_max_score FROM puzzles',
      )
      .get() as Record<string, unknown>;
    const remotePuzzles = await queryRemoteRow(
      remoteClient,
      'SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_cnt, SUM(COALESCE(max_score, 0)) AS sum_max_score FROM puzzles',
    );
    recordInvariant(
      'puzzles.active_count',
      toNum(localPuzzles.active_cnt),
      toNum(remotePuzzles.active_cnt),
    );
    recordInvariant(
      'puzzles.sum_max_score',
      toNum(localPuzzles.sum_max_score),
      toNum(remotePuzzles.sum_max_score),
    );

    // players: count + MAX(id)
    const localPlayers = localDb
      .prepare('SELECT COUNT(*) AS cnt, MAX(id) AS max_id FROM players')
      .get() as Record<string, unknown>;
    const remotePlayers = await queryRemoteRow(
      remoteClient,
      'SELECT COUNT(*) AS cnt, MAX(id) AS max_id FROM players',
    );
    recordInvariant('players.count', toNum(localPlayers.cnt), toNum(remotePlayers.cnt));
    recordInvariant(
      'players.max_id',
      toNullableNum(localPlayers.max_id),
      toNullableNum(remotePlayers.max_id),
    );

    // player_stats: count, SUM(best_score), SUM(words_found), MAX(updated_at)
    const localStats = localDb
      .prepare(
        'SELECT COUNT(*) AS cnt, SUM(best_score) AS sum_best_score, SUM(words_found) AS sum_words_found, MAX(updated_at) AS max_updated_at FROM player_stats',
      )
      .get() as Record<string, unknown>;
    const remoteStats = await queryRemoteRow(
      remoteClient,
      'SELECT COUNT(*) AS cnt, SUM(best_score) AS sum_best_score, SUM(words_found) AS sum_words_found, MAX(updated_at) AS max_updated_at FROM player_stats',
    );
    recordInvariant('player_stats.count', toNum(localStats.cnt), toNum(remoteStats.cnt));
    recordInvariant(
      'player_stats.sum_best_score',
      toNum(localStats.sum_best_score),
      toNum(remoteStats.sum_best_score),
    );
    recordInvariant(
      'player_stats.sum_words_found',
      toNum(localStats.sum_words_found),
      toNum(remoteStats.sum_words_found),
    );
    recordInvariant(
      'player_stats.max_updated_at',
      toNullableStr(localStats.max_updated_at),
      toNullableStr(remoteStats.max_updated_at),
    );

    // player_puzzle_states: count, SUM(score), MAX(updated_at)
    const localStates = localDb
      .prepare(
        'SELECT COUNT(*) AS cnt, SUM(score) AS sum_score, MAX(updated_at) AS max_updated_at FROM player_puzzle_states',
      )
      .get() as Record<string, unknown>;
    const remoteStates = await queryRemoteRow(
      remoteClient,
      'SELECT COUNT(*) AS cnt, SUM(score) AS sum_score, MAX(updated_at) AS max_updated_at FROM player_puzzle_states',
    );
    recordInvariant('player_puzzle_states.count', toNum(localStates.cnt), toNum(remoteStates.cnt));
    recordInvariant(
      'player_puzzle_states.sum_score',
      toNum(localStates.sum_score),
      toNum(remoteStates.sum_score),
    );
    recordInvariant(
      'player_puzzle_states.max_updated_at',
      toNullableStr(localStates.max_updated_at),
      toNullableStr(remoteStates.max_updated_at),
    );

    // word_finds: count, SUM(count), MAX(last_at)
    const localWordFinds = localDb
      .prepare(
        'SELECT COUNT(*) AS cnt, SUM(count) AS sum_count, MAX(last_at) AS max_last_at FROM word_finds',
      )
      .get() as Record<string, unknown>;
    const remoteWordFinds = await queryRemoteRow(
      remoteClient,
      'SELECT COUNT(*) AS cnt, SUM(count) AS sum_count, MAX(last_at) AS max_last_at FROM word_finds',
    );
    recordInvariant('word_finds.count', toNum(localWordFinds.cnt), toNum(remoteWordFinds.cnt));
    recordInvariant(
      'word_finds.sum_count',
      toNum(localWordFinds.sum_count),
      toNum(remoteWordFinds.sum_count),
    );
    recordInvariant(
      'word_finds.max_last_at',
      toNullableStr(localWordFinds.max_last_at),
      toNullableStr(remoteWordFinds.max_last_at),
    );

    // admins: count + usernames set
    const localAdminRows = localDb
      .prepare('SELECT username FROM admins ORDER BY username ASC')
      .all() as Array<{ username: string }>;
    const remoteAdminResult = await remoteClient.execute(
      'SELECT username FROM admins ORDER BY username ASC',
    );
    const localAdmins = localAdminRows.map((row) => row.username);
    const remoteAdmins = remoteAdminResult.rows.map((row) => String(row[0]));
    recordInvariant('admins.count', localAdmins.length, remoteAdmins.length);
    recordInvariant('admins.usernames', JSON.stringify(localAdmins), JSON.stringify(remoteAdmins));

    // config: epoch_date
    const localEpoch = localDb
      .prepare("SELECT value FROM config WHERE key = 'epoch_date'")
      .get() as { value: string } | undefined;
    const remoteEpoch = await queryRemoteScalar(
      remoteClient,
      "SELECT value FROM config WHERE key = 'epoch_date'",
    );
    recordInvariant('config.epoch_date', localEpoch?.value ?? null, toNullableStr(remoteEpoch));

    return {
      ok: mismatches.length === 0,
      localIntegrity,
      tableCounts,
      invariants,
      mismatches,
    };
  } finally {
    localDb.close();
  }
}

function printParityReport(report: ParityReport): void {
  console.log('Sanakenno SQLite <-> Turso Parity Report');
  console.log('----------------------------------------');
  console.log(`Local PRAGMA integrity_check: ${report.localIntegrity}`);
  console.log('\nTable Row Counts:');
  for (const row of report.tableCounts) {
    const mark = row.match ? 'OK  ' : 'DIFF';
    console.log(
      `  [${mark}] ${row.table.padEnd(25)} local=${row.localCount}  remote=${row.remoteCount}`,
    );
  }
  console.log('\nData Invariants:');
  for (const inv of report.invariants) {
    const mark = inv.match ? 'OK  ' : 'DIFF';
    console.log(
      `  [${mark}] ${inv.name.padEnd(36)} local=${String(inv.localValue)}  remote=${String(inv.remoteValue)}`,
    );
  }
  if (report.ok) {
    console.log('\nRESULT: PASS (100% parity verified)');
  } else {
    console.error(`\nRESULT: FAIL (${report.mismatches.length} mismatch(es))`);
    for (const msg of report.mismatches) {
      console.error(`  - ${msg}`);
    }
  }
}

async function main(): Promise<void> {
  const localPath = process.argv[2];
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

  if (!localPath || !tursoUrl) {
    console.error(
      'Usage: TURSO_DATABASE_URL=<url> [TURSO_AUTH_TOKEN=<token>] pnpm exec tsx scripts/verify-turso-parity.ts <local.db>',
    );
    process.exit(1);
  }

  const remoteClient = createLibsqlClient({ url: tursoUrl, authToken: tursoAuthToken });
  try {
    const report = await verifyDatabaseParity(localPath, remoteClient);
    printParityReport(report);
    process.exit(report.ok ? 0 : 1);
  } finally {
    remoteClient.close();
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  void main();
}
