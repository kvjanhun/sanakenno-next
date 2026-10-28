import { useMemo } from 'react';
import { deriveHintData, type DerivedHintData } from '@sanakenno/shared';
import { useGameStore } from './useGameStore.js';

export type { DerivedHintData };

/** Visible web hint IDs. Hidden legacy IDs are intentionally excluded. */
export const VISIBLE_HINT_IDS = ['summary', 'distribution', 'pairs'] as const;

export type VisibleHintId = (typeof VISIBLE_HINT_IDS)[number];

const VISIBLE_HINT_ID_SET = new Set<string>(VISIBLE_HINT_IDS);

/** Return true when an ID maps to a visible, unlockable web hint. */
export function isVisibleHintId(id: string): id is VisibleHintId {
  return VISIBLE_HINT_ID_SET.has(id);
}

/** Drop legacy hidden or unknown hint IDs while preserving visible order. */
export function filterVisibleHintIds(ids: Iterable<string>): VisibleHintId[] {
  const seen = new Set<VisibleHintId>();
  for (const id of ids) {
    if (isVisibleHintId(id)) {
      seen.add(id);
    }
  }
  return VISIBLE_HINT_IDS.filter((id) => seen.has(id));
}

/**
 * Subscribe to the Zustand game store and return memoised derived hint data.
 */
export function useHintData(): DerivedHintData | null {
  const puzzle = useGameStore((s) => s.puzzle);
  const foundWords = useGameStore((s) => s.foundWords);

  return useMemo(() => {
    if (!puzzle) return null;
    const allLetters = new Set<string>([puzzle.center, ...puzzle.letters]);
    return deriveHintData(puzzle.hint_data, foundWords, allLetters);
  }, [puzzle, foundWords]);
}
