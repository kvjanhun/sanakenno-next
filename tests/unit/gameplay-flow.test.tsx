import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleResponse } from '@sanakenno/shared';
import { hashWord } from '../../packages/web/src/features/gameplay/hash.js';
import { puzzleStateKey } from '../../packages/web/src/features/gameplay/storage.js';
import { useGameStore } from '../../packages/web/src/features/gameplay/useGameStore.js';
import { useUiStore } from '../../packages/web/src/features/gameplay/useUiStore.js';
import { GameplayView } from '../../packages/web/src/features/gameplay/GameplayView.js';

const mockPostAchievement = vi.fn();
const mockPostFailedGuess = vi.fn();
const mockPostWordFind = vi.fn();

let mockPuzzleData: PuzzleResponse | null = null;

vi.mock('../../packages/web/src/api/client.js', () => ({
  apiClient: {
    api: {
      puzzle: {
        $get: vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => mockPuzzleData,
        })),
      },
      player: {
        me: {
          $get: vi.fn(async () => ({
            ok: false,
            status: 401,
          })),
        },
        auth: {
          init: {
            $post: vi.fn(async () => ({
              ok: false,
              status: 400,
            })),
          },
        },
      },
    },
  },
  postAchievement: (...args: unknown[]) => mockPostAchievement(...args),
  postFailedGuess: (...args: unknown[]) => mockPostFailedGuess(...args),
  postWordFind: (...args: unknown[]) => mockPostWordFind(...args),
}));

describe('Integrated Gameplay Flow (in-process)', () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    window.localStorage.clear();

    // Reset stores
    useGameStore.setState({
      puzzle: null,
      outerLetters: [],
      currentWord: '',
      foundWords: new Set<string>(),
      score: 0,
      hintsUnlocked: new Set<string>(),
      scoreBeforeHints: null,
      startedAt: 0,
      totalPausedMs: 0,
    });
    useUiStore.setState({
      viewingPuzzleDate: null,
      message: '',
      messageType: 'ok',
      secondaryMessage: '',
      secondaryType: 'ok',
      showRanks: false,
      showRules: false,
      showAllFoundWords: false,
      showArchive: false,
      showStats: false,
      showSettings: false,
      showAuth: false,
      celebration: null,
      wordShake: false,
      lastResubmittedWord: null,
      shareCopied: false,
      pressedHexIndex: null,
    });

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockPuzzleData = {
      puzzle_number: 1,
      display_number: 1,
      total_puzzles: 10,
      center: 'a',
      letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
      word_hashes: [await hashWord('kana'), await hashWord('kansallinen'), await hashWord('kala')],
      max_score: 100,
      hint_data: {
        word_count: 3,
        pangram_count: 1,
        by_letter: { k: 3 },
        by_length: { '4': 2, '11': 1 },
        by_pair: {},
        matrix: { k: { '4': 2, '11': 1 } },
        pangram_details: [{ length: 11, first_letter: 'k' }],
        suffixes: { inen: 1 },
      },
    };
  });

  it('renders puzzle, handles valid and invalid word submissions, updates score/rank, Kotus links, and restores from localStorage', async () => {
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <GameplayView />
      </QueryClientProvider>,
    );

    // Initial render: honeycomb, score 0, rank "Etsi sanoja!"
    await waitFor(() => {
      expect(screen.getByRole('img', { name: /Kirjainkenno/i })).toBeInTheDocument();
    });
    expect(screen.getByTestId('score-display')).toHaveTextContent('0 pistettä');
    expect(screen.getByTestId('rank-button')).toHaveTextContent('Etsi sanoja!');
    expect(screen.queryByTestId('found-words-count')).not.toBeInTheDocument();

    // 1. Invalid attempt: too short ("ei")
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByTestId('word-input')).toHaveTextContent('EI');
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('message-bar')).toHaveTextContent('Liian lyhyt!');
    });

    // 2. Invalid attempt: missing center letter 'a' ("keski")
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'i' });
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('message-bar')).toHaveTextContent("Kirjain 'A' puuttuu!");
    });

    // 3. Invalid attempt: not in dictionary ("kissa")
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'i' });
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('message-bar')).toHaveTextContent('Ei sanakirjassa');
    });
    expect(mockPostFailedGuess).toHaveBeenCalledWith(expect.objectContaining({ word: 'kissa' }));

    // 4. Valid word submission via keyboard: "kana" (4 letters = 1 point)
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByTestId('word-input')).toHaveTextContent('KANA');
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('score-display')).toHaveTextContent('1 piste');
    });
    expect(screen.getByTestId('found-words-count')).toHaveTextContent('1');
    expect(
      screen.getByRole('link', { name: 'Avaa sanan "kana" määritelmä Kotuksessa' }),
    ).toHaveAttribute('href', 'https://www.kielitoimistonsanakirja.fi/#/kana');
    expect(mockPostWordFind).toHaveBeenCalledWith({ word: 'kana', puzzle_number: 1 });

    // 5. Valid word submission via Honeycomb cell clicks: "kansallinen" (pangram = 11 + 7 = 18 points)
    const lettersToClick = ['k', 'a', 'n', 's', 'a', 'l', 'l', 'i', 'n', 'e', 'n'];
    for (const char of lettersToClick) {
      fireEvent.pointerDown(screen.getByTestId(`hex-cell-${char}`));
    }
    expect(screen.getByTestId('word-input')).toHaveTextContent('KANSALLINEN');
    fireEvent.keyDown(window, { key: 'Enter' });

    // Score increments from 1 to 19 (1 + 18)
    await waitFor(() => {
      expect(screen.getByTestId('score-display')).toHaveTextContent('19 pistettä');
    });
    expect(screen.getByTestId('found-words-count')).toHaveTextContent('2');
    expect(screen.getByTestId('rank-button')).not.toHaveTextContent('Etsi sanoja!');
    expect(
      screen.getByRole('link', { name: 'Avaa sanan "kansallinen" määritelmä Kotuksessa' }),
    ).toBeInTheDocument();

    // Verify localStorage has persisted state
    const savedRaw = window.localStorage.getItem(puzzleStateKey(1));
    expect(savedRaw).toBeTruthy();
    const saved = JSON.parse(savedRaw!);
    expect(saved.score).toBe(19);
    expect(saved.foundWords).toContain('kana');
    expect(saved.foundWords).toContain('kansallinen');

    // 6. Test space key shuffles outer letters without typing space
    const initialOuter = [...useGameStore.getState().outerLetters];
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByTestId('word-input')).toHaveTextContent('|');
    expect(useGameStore.getState().outerLetters).toHaveLength(initialOuter.length);

    // 7. Unmount and remount: simulate page reload and verify state restore from localStorage
    unmount();

    // Reset store in-memory state before remounting
    useGameStore.setState({
      puzzle: null,
      outerLetters: [],
      currentWord: '',
      foundWords: new Set<string>(),
      score: 0,
      hintsUnlocked: new Set<string>(),
      scoreBeforeHints: null,
      startedAt: 0,
      totalPausedMs: 0,
    });

    const newQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={newQueryClient}>
        <GameplayView />
      </QueryClientProvider>,
    );

    // Verify restored state from localStorage
    await waitFor(() => {
      expect(screen.getByTestId('score-display')).toHaveTextContent('19 pistettä');
    });
    expect(screen.getByTestId('found-words-count')).toHaveTextContent('2');
    expect(screen.getByTestId('rank-button')).not.toHaveTextContent('Etsi sanoja!');
    expect(
      screen.getByRole('link', { name: 'Avaa sanan "kana" määritelmä Kotuksessa' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Avaa sanan "kansallinen" määritelmä Kotuksessa' }),
    ).toBeInTheDocument();
  });
});
