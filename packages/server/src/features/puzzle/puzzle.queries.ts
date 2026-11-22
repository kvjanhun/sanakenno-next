import { getHelsinkiDateString, type ArchiveEntry } from '@sanakenno/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { computePuzzle, parseComputedPuzzleData, type FullPuzzleData } from './wordlist.js';

export interface PuzzleRow {
  slot: number;
  letters: string;
  center: string;
  max_score?: number | null;
  computed_data?: string | null;
}

function parseOuterLetters(letters: string, centerNormalized: string): string[] {
  return letters
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l.length > 0 && l !== centerNormalized);
}

function getCycleStartIndex(activeSlots: number[]): number {
  const startSlot = activeSlots.find((s) => s >= 1) ?? activeSlots[0]!;
  return activeSlots.indexOf(startSlot);
}

/**
 * Parse a YYYY-MM-DD date string or Date into a normalized Helsinki YYYY-MM-DD string.
 */
function normalizeHelsinkiDate(dateInput: string | Date = new Date()): string {
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
 */
export async function getEpochDate(db: Kysely<Database>): Promise<string> {
  const row = await db
    .selectFrom('config')
    .select('value')
    .where('key', '=', 'epoch_date')
    .executeTakeFirst();

  return row?.value ?? '2026-02-24';
}

/** Purely resolve the active puzzle slot for a calendar date given active slots & epoch. */
export function computePuzzleSlotForDate(
  activeSlots: number[],
  epochDateStr: string,
  dateInput: string | Date = new Date(),
): number | null {
  if (activeSlots.length === 0) return null;
  const targetDateStr = normalizeHelsinkiDate(dateInput);
  const daysDiff = Math.round(
    (parseIsoDateUtcMs(targetDateStr) - parseIsoDateUtcMs(epochDateStr)) / 86_400_000,
  );
  const startIndex = getCycleStartIndex(activeSlots);
  const totalActive = activeSlots.length;
  const activeIndex = (((startIndex + daysDiff) % totalActive) + totalActive) % totalActive;
  return activeSlots[activeIndex] ?? null;
}

/** Purely count fresh puzzle days remaining in the current active cycle (today included). */
export function computeDaysRemainingInCycle(
  activeSlots: number[],
  epochDateStr: string,
  helsinkiDate: string | Date = new Date(),
): number {
  if (activeSlots.length === 0) return 0;
  const currentSlot = computePuzzleSlotForDate(activeSlots, epochDateStr, helsinkiDate);
  if (currentSlot === null) return 0;
  const index = activeSlots.indexOf(currentSlot);
  if (index === -1) return 0;
  const startIndex = getCycleStartIndex(activeSlots);
  const totalActive = activeSlots.length;
  const cycleOffset = (((index - startIndex) % totalActive) + totalActive) % totalActive;
  return totalActive - cycleOffset;
}

/** Resolve the active puzzle slot for a calendar date in Europe/Helsinki. */
export async function getPuzzleSlotForDate(
  db: Kysely<Database>,
  dateInput: string | Date = new Date(),
): Promise<number | null> {
  const [activeSlots, epochDateStr] = await Promise.all([getActiveSlots(db), getEpochDate(db)]);
  return computePuzzleSlotForDate(activeSlots, epochDateStr, dateInput);
}

/** Count fresh puzzle days remaining in the current active cycle (today included). */
export async function getDaysRemainingInCycle(
  db: Kysely<Database>,
  helsinkiDate: string | Date = new Date(),
): Promise<number> {
  const [activeSlots, epochDateStr] = await Promise.all([getActiveSlots(db), getEpochDate(db)]);
  return computeDaysRemainingInCycle(activeSlots, epochDateStr, helsinkiDate);
}

export type SlotScheduleRelation = 'past' | 'today' | 'future' | 'inactive';

export interface SlotScheduleInfo {
  relation: SlotScheduleRelation;
  activeSlots: number[];
}

/** Determine a slot's schedule relation alongside the fetched active slots list. */
export async function getSlotScheduleInfo(
  db: Kysely<Database>,
  slot: number,
  todayHelsinki: string | Date = new Date(),
): Promise<SlotScheduleInfo> {
  const [activeSlots, epochDateStr] = await Promise.all([getActiveSlots(db), getEpochDate(db)]);
  if (!activeSlots.includes(slot)) {
    return { relation: 'inactive', activeSlots };
  }

  const todayDateStr = normalizeHelsinkiDate(todayHelsinki);
  const daysSinceEpoch = Math.round(
    (parseIsoDateUtcMs(todayDateStr) - parseIsoDateUtcMs(epochDateStr)) / 86_400_000,
  );
  const startIndex = getCycleStartIndex(activeSlots);
  const totalActive = activeSlots.length;
  const todayIndex = (((startIndex + daysSinceEpoch) % totalActive) + totalActive) % totalActive;
  if (activeSlots[todayIndex] === slot) return { relation: 'today', activeSlots };
  if (daysSinceEpoch <= 0) return { relation: 'future', activeSlots };
  if (daysSinceEpoch >= totalActive) return { relation: 'past', activeSlots };

  for (let offset = 0; offset < daysSinceEpoch; offset += 1) {
    if (activeSlots[(startIndex + offset) % totalActive] === slot) {
      return { relation: 'past', activeSlots };
    }
  }
  return { relation: 'future', activeSlots };
}

/**
 * Fetch the raw active puzzle row for a given slot, or null if missing/inactive.
 */
async function getPuzzleRowBySlot(db: Kysely<Database>, slot: number): Promise<PuzzleRow | null> {
  const row = await db
    .selectFrom('puzzles')
    .select(['slot', 'letters', 'center', 'max_score', 'computed_data'])
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
    computed_data: row.computed_data ?? null,
  };
}

/**
 * Retrieve precomputed full puzzle data for an active slot directly from `puzzles.computed_data`,
 * falling back to lazy write-through computation if `computed_data` is absent.
 * Returns null if the slot does not exist or is soft-deleted (`is_active = 0`).
 */
export async function getFullPuzzleBySlot(
  db: Kysely<Database>,
  slot: number,
  preloadedActiveSlots?: number[],
): Promise<FullPuzzleData | null> {
  const [row, activeSlots] = preloadedActiveSlots
    ? [await getPuzzleRowBySlot(db, slot), preloadedActiveSlots]
    : await Promise.all([getPuzzleRowBySlot(db, slot), getActiveSlots(db)]);

  if (!row) {
    return null;
  }

  const activeIndex = activeSlots.indexOf(slot);
  if (activeIndex === -1) {
    return null;
  }

  const displayNumber = activeIndex + 1;
  const totalActive = activeSlots.length;
  const centerNormalized = row.center.trim().toLowerCase();
  const outerLetters = parseOuterLetters(row.letters, centerNormalized);

  const precomputed = parseComputedPuzzleData(row.computed_data);
  if (precomputed) {
    return {
      center: centerNormalized,
      letters: outerLetters,
      all_letters: row.letters,
      slot: row.slot,
      display_number: displayNumber,
      total_puzzles: totalActive,
      ...precomputed,
    };
  }

  const blockedWords = await getBlockedWords(db);
  const computed = computePuzzle(row.letters, row.center, blockedWords);

  await db
    .updateTable('puzzles')
    .set({
      max_score: computed.max_score,
      computed_data: JSON.stringify(computed),
    })
    .where('slot', '=', slot)
    .execute();

  return {
    center: centerNormalized,
    letters: outerLetters,
    all_letters: row.letters,
    slot: row.slot,
    display_number: displayNumber,
    total_puzzles: totalActive,
    ...computed,
  };
}

/**
 * Resolve the active puzzle for a given date (or today in Helsinki) and return its full data.
 */
export async function getFullPuzzleForDate(
  db: Kysely<Database>,
  dateStr: string | Date = new Date(),
): Promise<FullPuzzleData | null> {
  const [activeSlots, epochDateStr] = await Promise.all([getActiveSlots(db), getEpochDate(db)]);
  const slot = computePuzzleSlotForDate(activeSlots, epochDateStr, dateStr);
  if (slot === null) {
    return null;
  }
  return getFullPuzzleBySlot(db, slot, activeSlots);
}

/**
 * Add or subtract days from a YYYY-MM-DD ISO date string in UTC.
 */
function addDaysToIsoDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + deltaDays));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retrieve high-level archive metadata in a single fast query without wordlist scans or cache pollution.
 * Caps returned days so the archive never walks before `epoch_date` or wraps modulo into future slots.
 */
export async function getArchiveMetadata(
  db: Kysely<Database>,
  todayHelsinki: string,
  requestedDays: number | 'all' = 7,
): Promise<ArchiveEntry[]> {
  const [activeRows, epochDateStr] = await Promise.all([
    db
      .selectFrom('puzzles')
      .select(['slot', 'letters', 'center', 'max_score'])
      .where('is_active', '=', 1)
      .orderBy('slot', 'asc')
      .execute(),
    getEpochDate(db),
  ]);

  if (activeRows.length === 0) {
    return [];
  }

  const activeSlots = activeRows.map((r) => Number(r.slot));
  const slotToRow = new Map(activeRows.map((r) => [Number(r.slot), r]));
  const startIndex = getCycleStartIndex(activeSlots);
  const totalActive = activeSlots.length;
  const epochUtcMs = parseIsoDateUtcMs(epochDateStr);
  const todayUtcMs = parseIsoDateUtcMs(todayHelsinki);
  const daysSinceEpoch = Math.round((todayUtcMs - epochUtcMs) / 86_400_000);
  if (daysSinceEpoch < 0) {
    return [];
  }

  const targetDays = requestedDays === 'all' ? totalActive : requestedDays;
  const days = Math.max(0, Math.min(targetDays, daysSinceEpoch + 1, totalActive));

  const entries: ArchiveEntry[] = [];
  const missingScoresToUpdate: Array<{ slot: number; max_score: number; computed_data: string }> =
    [];
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
      missingScoresToUpdate.push({
        slot,
        max_score: maxScore,
        computed_data: JSON.stringify(computed),
      });
      row.max_score = maxScore;
    }

    const centerNormalized = row.center.trim().toLowerCase();
    const outerLetters = parseOuterLetters(row.letters, centerNormalized);

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
        .set({ max_score: update.max_score, computed_data: update.computed_data })
        .where('slot', '=', update.slot)
        .execute();
    }
  }

  return entries;
}
