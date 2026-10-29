import { getHelsinkiDateString, type ArchiveEntry } from '@sanakenno/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import {
  computePuzzle,
  getCachedPuzzle,
  invalidatePuzzleCache,
  setCachedPuzzle,
  type FullPuzzleData,
} from './wordlist.js';

export interface PuzzleRow {
  slot: number;
  letters: string;
  center: string;
  max_score?: number | null;
}

let _lastDb: Kysely<Database> | null = null;

function syncDbInstanceCache(db: Kysely<Database>): void {
  if (_lastDb !== null && _lastDb !== db) {
    invalidatePuzzleCache();
  }
  _lastDb = db;
}

/**
 * Parse a YYYY-MM-DD date string or Date into a normalized Helsinki YYYY-MM-DD string.
 */
export function normalizeHelsinkiDate(dateInput: string | Date = new Date()): string {
  if (typeof dateInput === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }
    return getHelsinkiDateString(new Date(dateInput));
  }
  return getHelsinkiDateString(dateInput);
}

function parseIsoDateUtcMs(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1);
}

/**
 * Return all active (`is_active = 1`) puzzle slots ordered ascending by slot.
 */
export async function getActiveSlots(db: Kysely<Database>): Promise<number[]> {
  const rows = await db
    .selectFrom('puzzles')
    .select('slot')
    .where('is_active', '=', 1)
    .orderBy('slot', 'asc')
    .execute();

  return rows.map((r) => Number(r.slot));
}

/**
 * Return the count of active (`is_active = 1`) puzzles in rotation.
 */
export async function totalPuzzles(db: Kysely<Database>): Promise<number> {
  const row = await db
    .selectFrom('puzzles')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('is_active', '=', 1)
    .executeTakeFirstOrThrow();

  return Number(row.count);
}

/**
 * Return the next free permanent slot number (`MAX(slot) + 1`, or `0` if empty).
 * Includes soft-deleted rows so historical slot keys are never reused.
 */
export async function nextFreeSlot(db: Kysely<Database>): Promise<number> {
  const row = await db
    .selectFrom('puzzles')
    .select((eb) => eb.fn.max<number | null>('slot').as('max_slot'))
    .executeTakeFirst();

  if (!row || row.max_slot === null || row.max_slot === undefined) {
    return 0;
  }
  return Number(row.max_slot) + 1;
}

/**
 * Resolve a storage slot to its 1-based display number among active puzzles.
 * Returns null if the slot is inactive or does not exist.
 */
export async function getDisplayNumber(db: Kysely<Database>, slot: number): Promise<number | null> {
  const activeSlots = await getActiveSlots(db);
  const index = activeSlots.indexOf(slot);
  return index === -1 ? null : index + 1;
}

/**
 * Resolve a 1-based display number back to its permanent storage slot.
 * Returns null when the display number is outside the active rotation.
 */
export async function getSlotByDisplayNumber(
  db: Kysely<Database>,
  displayNumber: number,
): Promise<number | null> {
  if (!Number.isInteger(displayNumber) || displayNumber < 1) {
    return null;
  }
  const activeSlots = await getActiveSlots(db);
  if (displayNumber > activeSlots.length) {
    return null;
  }
  return activeSlots[displayNumber - 1] ?? null;
}

/**
 * Return all blocked words from the database.
 */
export async function getBlockedWords(db: Kysely<Database>): Promise<string[]> {
  const rows = await db.selectFrom('blocked_words').select('word').orderBy('word', 'asc').execute();

  return rows.map((r) => r.word);
}

/**
 * Return the rotation epoch date string (`YYYY-MM-DD`) from config.
 * Supports both `epoch_date` and legacy 1.0 `rotation_epoch` keys.
 */
export async function getEpochDate(db: Kysely<Database>): Promise<string> {
  const rows = await db
    .selectFrom('config')
    .select(['key', 'value'])
    .where('key', 'in', ['epoch_date', 'rotation_epoch'])
    .execute();

  const epochRow =
    rows.find((r) => r.key === 'epoch_date') ?? rows.find((r) => r.key === 'rotation_epoch');

  return epochRow?.value ?? '2026-02-24';
}

/**
 * Resolve the active puzzle slot for a calendar date in Europe/Helsinki.
 * Rotates sequentially through `getActiveSlots(db)` starting at the first active slot >= 1.
 * Returns null when no active puzzles exist.
 */
export async function getPuzzleSlotForDate(
  db: Kysely<Database>,
  dateInput: string | Date = new Date(),
): Promise<number | null> {
  const activeSlots = await getActiveSlots(db);
  if (activeSlots.length === 0) {
    return null;
  }

  const targetDateStr = normalizeHelsinkiDate(dateInput);
  const epochDateStr = await getEpochDate(db);
  const daysDiff = Math.round(
    (parseIsoDateUtcMs(targetDateStr) - parseIsoDateUtcMs(epochDateStr)) / 86_400_000,
  );

  const startSlot = activeSlots.find((s) => s >= 1) ?? activeSlots[0]!;
  const startIndex = activeSlots.indexOf(startSlot);
  const totalActive = activeSlots.length;
  const activeIndex = (((startIndex + daysDiff) % totalActive) + totalActive) % totalActive;

  return activeSlots[activeIndex] ?? null;
}

/**
 * Count fresh puzzle days remaining in the current active cycle (today included).
 * Uses cycle index within `getActiveSlots(db)` — never slot arithmetic.
 */
export async function getDaysRemainingInCycle(
  db: Kysely<Database>,
  helsinkiDate: string | Date = new Date(),
): Promise<number> {
  const activeSlots = await getActiveSlots(db);
  if (activeSlots.length === 0) {
    return 0;
  }

  const currentSlot = await getPuzzleSlotForDate(db, helsinkiDate);
  if (currentSlot === null) {
    return 0;
  }

  const index = activeSlots.indexOf(currentSlot);
  if (index === -1) {
    return 0;
  }

  return activeSlots.length - index;
}

/**
 * Fetch the raw active puzzle row for a given slot, or null if missing/inactive.
 */
export async function getPuzzleRowBySlot(
  db: Kysely<Database>,
  slot: number,
): Promise<PuzzleRow | null> {
  const row = await db
    .selectFrom('puzzles')
    .select(['slot', 'letters', 'center', 'max_score'])
    .where('slot', '=', slot)
    .where('is_active', '=', 1)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    slot: Number(row.slot),
    letters: row.letters,
    center: row.center,
    max_score: row.max_score !== null && row.max_score !== undefined ? Number(row.max_score) : null,
  };
}

/**
 * Compute or retrieve cached full puzzle data for an active slot.
 * Returns null if the slot does not exist or is soft-deleted (`is_active = 0`).
 */
export async function getFullPuzzleBySlot(
  db: Kysely<Database>,
  slot: number,
): Promise<FullPuzzleData | null> {
  syncDbInstanceCache(db);

  const row = await getPuzzleRowBySlot(db, slot);
  if (!row) {
    invalidatePuzzleCache(slot);
    return null;
  }

  const activeSlots = await getActiveSlots(db);
  const activeIndex = activeSlots.indexOf(slot);
  if (activeIndex === -1) {
    invalidatePuzzleCache(slot);
    return null;
  }

  const displayNumber = activeIndex + 1;
  const totalActive = activeSlots.length;

  const cached = getCachedPuzzle(slot);
  if (cached) {
    if (cached.display_number === displayNumber && cached.total_puzzles === totalActive) {
      return cached;
    }
    const updated: FullPuzzleData = {
      ...cached,
      display_number: displayNumber,
      total_puzzles: totalActive,
    };
    setCachedPuzzle(slot, updated);
    return updated;
  }

  const blockedWords = await getBlockedWords(db);
  const computed = computePuzzle(row.letters, row.center, blockedWords);
  const centerNormalized = row.center.trim().toLowerCase();
  const outerLetters = row.letters
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l.length > 0 && l !== centerNormalized);

  const fullResult: FullPuzzleData = {
    center: centerNormalized,
    letters: outerLetters,
    all_letters: row.letters,
    slot: row.slot,
    display_number: displayNumber,
    total_puzzles: totalActive,
    ...computed,
  };

  if (row.max_score === null || row.max_score === undefined) {
    await db
      .updateTable('puzzles')
      .set({ max_score: computed.max_score })
      .where('slot', '=', slot)
      .execute();
  }

  setCachedPuzzle(slot, fullResult);
  return fullResult;
}

/**
 * Resolve the active puzzle for a given date (or today in Helsinki) and return its full data.
 */
export async function getFullPuzzleForDate(
  db: Kysely<Database>,
  dateStr: string | Date = new Date(),
): Promise<FullPuzzleData | null> {
  const slot = await getPuzzleSlotForDate(db, dateStr);
  if (slot === null) {
    return null;
  }
  return getFullPuzzleBySlot(db, slot);
}

/**
 * Add or subtract days from a YYYY-MM-DD ISO date string in UTC.
 */
export function addDaysToIsoDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + deltaDays));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retrieve high-level archive metadata in a single fast query without wordlist scans or cache pollution.
 */
export async function getArchiveMetadata(
  db: Kysely<Database>,
  todayHelsinki: string,
  days: number,
): Promise<ArchiveEntry[]> {
  const activeRows = await db
    .selectFrom('puzzles')
    .select(['slot', 'letters', 'center', 'max_score'])
    .where('is_active', '=', 1)
    .orderBy('slot', 'asc')
    .execute();

  if (activeRows.length === 0) {
    return [];
  }

  const epochDateStr = await getEpochDate(db);
  const activeSlots = activeRows.map((r) => Number(r.slot));
  const slotToRow = new Map(activeRows.map((r) => [Number(r.slot), r]));

  const startSlot = activeSlots.find((s) => s >= 1) ?? activeSlots[0]!;
  const startIndex = activeSlots.indexOf(startSlot);
  const totalActive = activeSlots.length;
  const epochUtcMs = parseIsoDateUtcMs(epochDateStr);

  const entries: ArchiveEntry[] = [];
  const missingScoresToUpdate: Array<{ slot: number; max_score: number }> = [];
  let blockedWords: string[] | null = null;

  for (let daysAgo = 0; daysAgo < days; daysAgo++) {
    const dateStr = addDaysToIsoDate(todayHelsinki, -daysAgo);
    const daysDiff = Math.round((parseIsoDateUtcMs(dateStr) - epochUtcMs) / 86_400_000);
    const activeIndex = (((startIndex + daysDiff) % totalActive) + totalActive) % totalActive;
    const slot = activeSlots[activeIndex];
    if (slot === undefined) continue;

    const row = slotToRow.get(slot);
    if (!row) continue;

    let maxScore =
      row.max_score !== null && row.max_score !== undefined ? Number(row.max_score) : null;
    if (maxScore === null) {
      if (blockedWords === null) {
        blockedWords = await getBlockedWords(db);
      }
      const computed = computePuzzle(row.letters, row.center, blockedWords);
      maxScore = computed.max_score;
      missingScoresToUpdate.push({ slot, max_score: maxScore });
      row.max_score = maxScore;
    }

    const centerNormalized = row.center.trim().toLowerCase();
    const outerLetters = row.letters
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0 && l !== centerNormalized);

    entries.push({
      date: dateStr,
      puzzle_number: slot,
      display_number: activeIndex + 1,
      letters: [centerNormalized, ...outerLetters],
      center: centerNormalized,
      is_today: daysAgo === 0,
      max_score: maxScore,
    });
  }

  if (missingScoresToUpdate.length > 0) {
    for (const update of missingScoresToUpdate) {
      await db
        .updateTable('puzzles')
        .set({ max_score: update.max_score })
        .where('slot', '=', update.slot)
        .execute();
    }
  }

  return entries;
}
