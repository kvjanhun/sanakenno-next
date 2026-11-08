import { migrateV1DatabaseFile } from '../packages/server/src/db/migrate-v1.js';

function main(): void {
  const args = process.argv.slice(2);
  const sourcePath = args[0];
  const outputPath = args[1];

  if (!sourcePath) {
    console.error(
      'Usage: pnpm exec tsx scripts/migrate-v1-db.ts <source-db-path> [output-db-path]',
    );
    process.exit(1);
  }

  const result = migrateV1DatabaseFile(sourcePath, outputPath);

  console.log('Sanakenno 1.0 -> 2.0 Database Migration Complete');
  console.log('------------------------------------------------');
  console.log(`Source DB:                  ${result.sourcePath}`);
  console.log(`Migrated Output DB:         ${result.outputPath}`);
  console.log(`SQLite Integrity Check:     ${result.integrityCheck}`);
  console.log(
    `Total Puzzles:              ${result.totalPuzzles} (${result.activePuzzles} active)`,
  );
  console.log(`Puzzles max_score Updated:  ${result.puzzlesRecomputed}`);
  console.log(`Blocked Words Count:        ${result.blockedWordsCount}`);
  console.log(`Players Count:              ${result.playersCount}`);
  console.log(
    `Player Stats Rows:          ${result.playerStatsCount} (${result.statsBackfilled} backfilled)`,
  );
  console.log(`Daily Streak Eligible Rows: ${result.dailyStatsCount}`);
  console.log(`Rows w/ Long Words (>=10):  ${result.longWordsBackfilledCount}`);
  console.log(`Player Puzzle State Rows:   ${result.playerPuzzleStatesCount}`);
}

main();
