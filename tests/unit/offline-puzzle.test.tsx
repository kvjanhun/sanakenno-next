import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHelsinkiDateString, type PuzzleResponse } from '../../packages/shared/src/index.js';
import { hashWord } from '../../packages/web/src/features/gameplay/hash.js';
import {
  loadCachedPuzzleResponse,
  PUZZLE_CACHE_STORAGE_KEY,
  puzzleStateKey,
  saveCachedPuzzleResponse,
  saveToStorage,
} from '../../packages/web/src/features/gameplay/storage.js';
import { useGameStore } from '../../packages/web/src/features/gameplay/useGameStore.js';
import { usePuzzleQuery } from '../../packages/web/src/features/gameplay/usePuzzleQuery.js';

async function makePuzzle(slot = 42): Promise<PuzzleResponse> {
  return {
    puzzle_number: slot,
    display_number: 10,
    total_puzzles: 50,
    center: 'a',
    letters: ['k', 'e', 'i', 'l', 'n', 'o', 's'],
    word_hashes: [await hashWord('kissa'), await hashWord('kana')],
    max_score: 20,
    date: getHelsinkiDateString(),
    hint_data: {
      word_count: 2,
      pangram_count: 0,
      by_letter: { k: 2 },
      by_length: { '4': 1, '5': 1 },
      by_pair: { ka: 1, ki: 1 },
    },
  };
}

function PuzzleHarness({ date = null }: { date?: string | null }) {
  const { data, isError } = usePuzzleQuery(date);
  const foundWords = useGameStore((s) => s.foundWords);
  const score = useGameStore((s) => s.score);

  if (isError && !data) {
    return <div>Lataus epäonnistui.</div>;
  }
  if (!data) {
    return <div>Ladataan...</div>;
  }

  return (
    <div>
      <div data-testid="puzzle-num">{data.puzzle_number}</div>
      <div data-testid="score">{score}</div>
      <div data-testid="words">{Array.from(foundWords).join(',')}</div>
    </div>
  );
}

describe('Offline puzzle cache & hydration', () => {
  const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useGameStore.setState({
      puzzle: null,
      foundWords: new Set(),
      score: 0,
      hintsUnlocked: new Set(),
      scoreBeforeHints: null,
      totalPausedMs: 0,
    });
  });

  afterEach(() => {
    if (originalOnLineDescriptor) {
      Object.defineProperty(Navigator.prototype, 'onLine', originalOnLineDescriptor);
    }
  });

  it('bounds cached PuzzleResponse history to at most 7 entries', async () => {
    const sample = await makePuzzle(1);
    vi.useFakeTimers();
    for (let i = 1; i <= 9; i++) {
      vi.setSystemTime(new Date(1_700_000_000_000 + i * 1000));
      saveCachedPuzzleResponse(`2026-04-0${i}`, { ...sample, puzzle_number: i });
    }
    vi.useRealTimers();

    const raw = JSON.parse(localStorage.getItem(PUZZLE_CACHE_STORAGE_KEY) || '{}') as Record<
      string,
      unknown
    >;
    expect(Object.keys(raw)).toHaveLength(7);
    expect(loadCachedPuzzleResponse('2026-04-01')).toBeNull();
    expect(loadCachedPuzzleResponse('2026-04-02')).toBeNull();
    expect(loadCachedPuzzleResponse('2026-04-09')?.puzzle_number).toBe(9);
  });

  it('caches fetched puzzle and restores foundWords/score while offline without error UI', async () => {
    const puzzle = await makePuzzle(42);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(puzzle), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const onlineClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const firstRender = render(
      <QueryClientProvider client={onlineClient}>
        <PuzzleHarness />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('puzzle-num')).toHaveTextContent('42');
    });
    expect(loadCachedPuzzleResponse(getHelsinkiDateString())?.puzzle_number).toBe(42);

    // Save local progress for slot 42
    saveToStorage(puzzleStateKey(42), {
      foundWords: ['kissa'],
      score: 5,
      hintsUnlocked: [],
      startedAt: 1000,
      totalPausedMs: 0,
      scoreBeforeHints: 5,
    });
    firstRender.unmount();

    // Reset memory state and go offline cleanly
    useGameStore.setState({
      puzzle: null,
      foundWords: new Set(),
      score: 0,
    });
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => false,
    });
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const offlineClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={offlineClient}>
        <PuzzleHarness />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('puzzle-num')).toHaveTextContent('42');
      expect(screen.getByTestId('score')).toHaveTextContent('5');
      expect(screen.getByTestId('words')).toHaveTextContent('kissa');
    });
    expect(screen.queryByText('Lataus epäonnistui.')).not.toBeInTheDocument();
  });
});
