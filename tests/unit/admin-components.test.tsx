import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedWords } from '../../packages/web/src/features/admin/BlockedWords.js';
import { LoginPage } from '../../packages/web/src/features/admin/LoginPage.js';
import { ManualPuzzleForm } from '../../packages/web/src/features/admin/ManualPuzzleForm.js';
import { Schedule } from '../../packages/web/src/features/admin/Schedule.js';
import { Stats } from '../../packages/web/src/features/admin/Stats.js';
import { SuggestionRejections } from '../../packages/web/src/features/admin/SuggestionRejections.js';
import { useAdminStore } from '../../packages/web/src/features/admin/useAdminStore.js';

const mockAdminGetBlocked = vi.fn();
const mockAdminBlockWord = vi.fn();
const mockAdminUnblockWord = vi.fn();
const mockAdminGetSchedule = vi.fn();
const mockAdminGetSuggestionRejections = vi.fn();
const mockAdminDeleteSuggestionRejection = vi.fn();
const mockAdminGetAchievements = vi.fn();

vi.mock('../../packages/web/src/api/client.js', () => ({
  adminGetBlocked: (...args: unknown[]) => mockAdminGetBlocked(...args),
  adminBlockWord: (...args: unknown[]) => mockAdminBlockWord(...args),
  adminUnblockWord: (...args: unknown[]) => mockAdminUnblockWord(...args),
  adminGetSchedule: (...args: unknown[]) => mockAdminGetSchedule(...args),
  adminGetSuggestionRejections: (...args: unknown[]) => mockAdminGetSuggestionRejections(...args),
  adminDeleteSuggestionRejection: (...args: unknown[]) =>
    mockAdminDeleteSuggestionRejection(...args),
  adminGetAchievements: (...args: unknown[]) => mockAdminGetAchievements(...args),
}));

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

      render(<BlockedWords />);

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

      render(<BlockedWords />);

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

      render(<Schedule />);

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

      render(<SuggestionRejections csrfToken="test-csrf-token" />);

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

      render(<Stats csrfToken="test-csrf-token" />);

      await waitFor(() => {
        expect(screen.getByText('Saavutustilastot')).toBeInTheDocument();
        expect(screen.getByText(/20 tapahtumaa/)).toBeInTheDocument();
      });
    });
  });
});
