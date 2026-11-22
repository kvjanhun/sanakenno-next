import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BlockedWords,
  CombinationsBrowser,
  LoginPage,
  ManualPuzzleForm,
  Schedule,
  Stats,
  SuggestionPanel,
  SuggestionRejections,
  useAdminStore,
  WordFinds,
} from '@sanakenno/admin';

const mockAdminGetBlocked = vi.fn();
const mockAdminBlockWord = vi.fn();
const mockAdminUnblockWord = vi.fn();
const mockAdminGetSchedule = vi.fn();
const mockAdminGetSuggestion = vi.fn();
const mockAdminRejectSuggestion = vi.fn();
const mockAdminGetSuggestionRejections = vi.fn();
const mockAdminDeleteSuggestionRejection = vi.fn();
const mockAdminGetAchievements = vi.fn();
const mockAdminGetCombinations = vi.fn();
const mockAdminGetWordFinds = vi.fn();
const mockAdminGetSlots = vi.fn();

vi.mock('../../packages/admin/src/api/admin-client.js', () => ({
  adminGetBlocked: (...args: unknown[]) => mockAdminGetBlocked(...args),
  adminBlockWord: (...args: unknown[]) => mockAdminBlockWord(...args),
  adminUnblockWord: (...args: unknown[]) => mockAdminUnblockWord(...args),
  adminGetSchedule: (...args: unknown[]) => mockAdminGetSchedule(...args),
  adminGetSuggestion: (...args: unknown[]) => mockAdminGetSuggestion(...args),
  adminRejectSuggestion: (...args: unknown[]) => mockAdminRejectSuggestion(...args),
  adminGetSuggestionRejections: (...args: unknown[]) => mockAdminGetSuggestionRejections(...args),
  adminDeleteSuggestionRejection: (...args: unknown[]) =>
    mockAdminDeleteSuggestionRejection(...args),
  adminGetAchievements: (...args: unknown[]) => mockAdminGetAchievements(...args),
  adminGetCombinations: (...args: unknown[]) => mockAdminGetCombinations(...args),
  adminGetWordFinds: (...args: unknown[]) => mockAdminGetWordFinds(...args),
  adminGetSlots: (...args: unknown[]) => mockAdminGetSlots(...args),
}));

function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Admin UI Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAdminStore.setState({
      isAuthenticated: true,
      username: 'admin',
      csrfToken: 'test-csrf-token',
      isLoading: false,
      error: null,
    });
  });

  describe('LoginPage', () => {
    it('renders login form and submits username and password', async () => {
      const mockLogin = vi.fn().mockResolvedValue(undefined);
      useAdminStore.setState({
        isAuthenticated: false,
        username: null,
        csrfToken: null,
        login: mockLogin,
      } as unknown as Partial<ReturnType<typeof useAdminStore.getState>>);

      render(<LoginPage />);

      expect(screen.getByText('Sanakenno Admin')).toBeInTheDocument();

      const userInput = screen.getByLabelText(/Käyttäjätunnus/i);
      const passInput = screen.getByLabelText(/Salasana/i);
      fireEvent.change(userInput, { target: { value: 'admin' } });
      fireEvent.change(passInput, { target: { value: 'secret123' } });

      const submitBtn = screen.getByRole('button', { name: /Kirjaudu/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('admin', 'secret123');
      });
    });

    it('displays error banner if login fails', () => {
      useAdminStore.setState({
        error: 'Virheellinen käyttäjätunnus tai salasana',
      });

      render(<LoginPage />);
      expect(screen.getByText('Virheellinen käyttäjätunnus tai salasana')).toBeInTheDocument();
    });
  });

  describe('BlockedWords', () => {
    it('loads and renders blocked words, and blocks a new word', async () => {
      mockAdminGetBlocked.mockResolvedValue({
        blocked: [
          { id: 1, word: 'pahatsanat', blocked_at: '2026-04-10' },
          { id: 2, word: 'rumasana', blocked_at: '2026-04-11' },
        ],
      });
      mockAdminBlockWord.mockResolvedValue({ status: 'ok' });

      renderWithQuery(<BlockedWords />);

      await waitFor(() => {
        expect(screen.getByText('pahatsanat')).toBeInTheDocument();
        expect(screen.getByText('rumasana')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Estä uusi sana...');
      fireEvent.change(input, { target: { value: 'uudensana' } });

      const form = input.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockAdminBlockWord).toHaveBeenCalledWith('test-csrf-token', 'uudensana');
      });
    });

    it('unblocks a word when delete button is clicked', async () => {
      mockAdminGetBlocked.mockResolvedValue({
        blocked: [{ id: 42, word: 'poistettava', blocked_at: '2026-04-10' }],
      });
      mockAdminUnblockWord.mockResolvedValue({ status: 'ok' });

      renderWithQuery(<BlockedWords />);

      await waitFor(() => {
        expect(screen.getByText('poistettava')).toBeInTheDocument();
      });

      const deleteBtn = screen.getByRole('button', { name: 'Poista esto' });
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(mockAdminUnblockWord).toHaveBeenCalledWith('test-csrf-token', 42);
      });
    });
  });

  describe('Schedule', () => {
    it('loads and renders 14-day schedule', async () => {
      mockAdminGetSchedule.mockResolvedValue({
        schedule: [
          {
            date: '2026-04-10',
            slot: 1,
            display_number: 1,
            letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
            center: 'a',
            word_count: 35,
            max_score: 110,
            pangram_count: 1,
            is_today: true,
          },
          {
            date: '2026-04-11',
            slot: 2,
            display_number: 2,
            letters: ['e', 'h', 'i', 'k', 'n', 'o', 's'],
            center: 'n',
            word_count: 28,
            max_score: 95,
            pangram_count: 1,
            is_today: false,
          },
        ],
      });

      renderWithQuery(<Schedule />);

      await waitFor(() => {
        expect(screen.getByText('14 päivän kierrosaikataulu')).toBeInTheDocument();
        expect(screen.getByText('(Tänään)')).toBeInTheDocument();
        expect(screen.getByText('2026-04-11')).toBeInTheDocument();
        expect(screen.getByText('35')).toBeInTheDocument();
        expect(screen.getByText('28')).toBeInTheDocument();
      });
    });
  });

  describe('ManualPuzzleForm', () => {
    it('renders form inputs and forwards changes and actions', () => {
      const onLettersChange = vi.fn();
      const onCenterChange = vi.fn();
      const onSlotChange = vi.fn();
      const onPreview = vi.fn();
      const onCreate = vi.fn();

      render(
        <ManualPuzzleForm
          newLetters="a,e,i,k,l,n,s"
          newCenter="a"
          newSlot={5}
          saving={false}
          forceRequired={false}
          onLettersChange={onLettersChange}
          onCenterChange={onCenterChange}
          onSlotChange={onSlotChange}
          onPreview={onPreview}
          onCreate={onCreate}
        />,
      );

      expect(screen.getByText('Luo tai muokkaa peliä käsin')).toBeInTheDocument();

      const lettersInput = screen.getByLabelText(/Kirjaimet/i);
      fireEvent.change(lettersInput, { target: { value: 'a,e,i,k,m,o,s' } });
      expect(onLettersChange).toHaveBeenCalledWith('a,e,i,k,m,o,s');

      const previewBtn = screen.getByRole('button', { name: /Esikatsele/i });
      fireEvent.click(previewBtn);
      expect(onPreview).toHaveBeenCalled();

      const createBtn = screen.getByRole('button', { name: /Tallenna peli/i });
      fireEvent.click(createBtn);
      expect(onCreate).toHaveBeenCalled();
    });
  });

  describe('SuggestionPanel', () => {
    const firstSuggestion = {
      letters: ['a', 'e', 'k', 'm', 'n', 'o', 's'],
      letters_key: 'aekmnos',
      center: 'a',
      word_count: 30,
      pangram_count: 1,
      max_score: 110,
      quality_grade: 'good',
      quality_label: 'Hyvä pangrammilaatu',
      score: 900,
      overlaps: {
        previous: { slot: 1, shared_letters: 2, shared_short_words: 1 },
        next: { slot: 2, shared_letters: 1, shared_short_words: 0 },
      },
      variations: [],
      reasons: ['sanamäärä tuo vaihtelua (tavallinen)'],
      pangrams: ['kaamoksen'],
    };

    const secondSuggestion = {
      ...firstSuggestion,
      letters: ['e', 'i', 'l', 'm', 'o', 'r', 's'],
      letters_key: 'eilmors',
      center: 'e',
      word_count: 45,
      pangram_count: 2,
      max_score: 160,
      pangrams: ['reilomies', 'mielisero'],
    };

    it('renders pangrams directly, advances declined list on "Ehdota toista", and supports adding/previewing', async () => {
      mockAdminGetSuggestion
        .mockResolvedValueOnce(firstSuggestion)
        .mockResolvedValueOnce(secondSuggestion);

      const onAddSuggestion = vi.fn().mockResolvedValue(undefined);
      const onPreviewSuggestion = vi.fn();
      renderWithQuery(
        <SuggestionPanel
          csrfToken="test-csrf-token"
          onAddSuggestion={onAddSuggestion}
          onPreviewSuggestion={onPreviewSuggestion}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Ehdota peliä' }));

      await waitFor(() => {
        expect(screen.getByText('30')).toBeInTheDocument();
        expect(screen.getByText('kaamoksen')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /Spoileri/i })).not.toBeInTheDocument();
      expect(mockAdminGetSuggestion).toHaveBeenNthCalledWith(1, 'test-csrf-token', {
        declined: [],
      });

      fireEvent.click(screen.getByRole('button', { name: 'Ehdota toista' }));

      await waitFor(() => {
        expect(screen.getByText('45')).toBeInTheDocument();
        expect(screen.getByText('reilomies, mielisero')).toBeInTheDocument();
      });
      expect(mockAdminGetSuggestion).toHaveBeenNthCalledWith(2, 'test-csrf-token', {
        declined: ['aekmnos:a'],
      });

      fireEvent.click(screen.getByRole('button', { name: 'Esikatsele ehdotus' }));
      expect(onPreviewSuggestion).toHaveBeenCalledWith('e,i,l,m,o,r,s', 'e');

      fireEvent.click(screen.getByRole('button', { name: 'Lisää peli' }));
      await waitFor(() => {
        expect(onAddSuggestion).toHaveBeenCalledWith('e,i,l,m,o,r,s', 'e');
      });
    });

    it('rejects current suggestion permanently and loads the next suggestion', async () => {
      mockAdminGetSuggestion
        .mockResolvedValueOnce(firstSuggestion)
        .mockResolvedValueOnce(secondSuggestion);
      mockAdminRejectSuggestion.mockResolvedValueOnce({ id: 1 });

      renderWithQuery(
        <SuggestionPanel
          csrfToken="test-csrf-token"
          onAddSuggestion={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Ehdota peliä' }));
      await waitFor(() => {
        expect(screen.getByText('30')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Hylkää pysyvästi' }));

      await waitFor(() => {
        expect(mockAdminRejectSuggestion).toHaveBeenCalledWith(
          'test-csrf-token',
          firstSuggestion.letters,
          'a',
        );
        expect(screen.getByText('45')).toBeInTheDocument();
      });
      expect(mockAdminGetSuggestion).toHaveBeenNthCalledWith(2, 'test-csrf-token', {
        declined: ['aekmnos:a'],
      });
    });
  });

  describe('SuggestionRejections', () => {
    it('loads and renders rejected suggestions and handles restore', async () => {
      mockAdminGetSuggestionRejections.mockResolvedValue({
        rejections: [
          {
            id: 10,
            letters_key: 'aeiklns',
            center: 'a',
            rejected_at: '2026-04-10 12:00:00',
          },
        ],
      });
      mockAdminDeleteSuggestionRejection.mockResolvedValue({ status: 'ok' });

      renderWithQuery(<SuggestionRejections csrfToken="test-csrf-token" />);

      await waitFor(() => {
        expect(screen.getByText('Hylätyt peliehdotukset')).toBeInTheDocument();
        expect(screen.getByText('aeiklns')).toBeInTheDocument();
      });

      const restoreBtn = screen.getByRole('button', { name: 'Palauta jonoon' });
      fireEvent.click(restoreBtn);

      await waitFor(() => {
        expect(mockAdminDeleteSuggestionRejection).toHaveBeenCalledWith('test-csrf-token', 10);
      });
    });
  });

  describe('Stats', () => {
    it('loads and renders achievements data with grand total', async () => {
      mockAdminGetAchievements.mockResolvedValue({
        totals: { 'Hyvä alku': 12, Onnistuja: 8 },
        daily: [
          {
            date: '2026-04-10',
            counts: { 'Hyvä alku': 6, Onnistuja: 4 },
            total: 10,
          },
          {
            date: '2026-04-11',
            counts: { 'Hyvä alku': 6, Onnistuja: 4 },
            total: 10,
          },
        ],
      });

      renderWithQuery(<Stats csrfToken="test-csrf-token" />);

      await waitFor(() => {
        expect(screen.getByText('Saavutustilastot')).toBeInTheDocument();
        expect(screen.getByText(/20 tapahtumaa/)).toBeInTheDocument();
      });
    });
  });

  describe('CombinationsBrowser & WordFinds regressions', () => {
    it('advances CombinationsBrowser to page 2 without bouncing back to page 1', async () => {
      mockAdminGetCombinations.mockImplementation(
        async (_token: string, params: { page?: number }) => ({
          combinations: [
            {
              letters: params.page === 2 ? 'bceklno' : 'aeiklns',
              total_pangrams: 2,
              min_word_count: 20,
              max_word_count: 45,
              min_max_score: 70,
              max_max_score: 140,
              in_rotation: true,
              variations: [],
            },
          ],
          total: 50,
          page: params.page ?? 1,
          pages: 2,
        }),
      );

      renderWithQuery(<CombinationsBrowser csrfToken="test-csrf-token" />);

      await waitFor(() => {
        expect(screen.getByText(/Sivu 1 \/ 2/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Seuraava' }));

      await waitFor(() => {
        expect(screen.getByText(/Sivu 2 \/ 2/)).toBeInTheDocument();
      });
      expect(mockAdminGetCombinations).toHaveBeenCalledTimes(2);
      expect(mockAdminGetCombinations).toHaveBeenLastCalledWith(
        'test-csrf-token',
        expect.objectContaining({ page: 2 }),
      );
    });

    it('invalidates WordFinds after blocking a word and disables "Seuraava peli" at the last puzzle', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockAdminGetSlots.mockResolvedValue({
        slots: [{ slot: 0, display_number: 1 }],
        active_slots: [0],
        total_puzzles: 1,
        today_slot: 0,
      });
      mockAdminGetWordFinds
        .mockResolvedValueOnce({
          puzzle_number: 0,
          display_number: 1,
          letters: 'aeiklns',
          center: 'a',
          total_words: 2,
          recorded_words: 1,
          total_finds: 3,
          words: [
            { word: 'poistettava', find_count: 0 },
            { word: 'kana', find_count: 3 },
          ],
        })
        .mockResolvedValueOnce({
          puzzle_number: 0,
          display_number: 1,
          letters: 'aeiklns',
          center: 'a',
          total_words: 1,
          recorded_words: 1,
          total_finds: 3,
          words: [{ word: 'kana', find_count: 3 }],
        });
      mockAdminBlockWord.mockResolvedValue({ status: 'blocked' });

      renderWithQuery(<WordFinds csrfToken="test-csrf-token" />);

      await waitFor(() => {
        expect(screen.getByText('poistettava')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Seuraava peli/i })).toBeDisabled();
      });

      const blockButtons = screen.getAllByRole('button', { name: 'Estä sana' });
      fireEvent.click(blockButtons[0]!);

      await waitFor(() => {
        expect(mockAdminBlockWord).toHaveBeenCalledWith('test-csrf-token', 'poistettava');
        expect(mockAdminGetWordFinds).toHaveBeenCalledTimes(2);
        expect(screen.queryByText('poistettava')).not.toBeInTheDocument();
      });
    });
  });
});
