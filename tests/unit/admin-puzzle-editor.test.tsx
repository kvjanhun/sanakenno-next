import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VariationData } from '@sanakenno/shared';
import { AdminWordListPanel } from '../../packages/web/src/features/admin/AdminWordListPanel.js';
import { PuzzleEditor } from '../../packages/web/src/features/admin/PuzzleEditor.js';
import { PuzzleSlotControls } from '../../packages/web/src/features/admin/PuzzleSlotControls.js';
import { useAdminStore } from '../../packages/web/src/features/admin/useAdminStore.js';
import { VariationsGrid } from '../../packages/web/src/features/admin/VariationsGrid.js';
import { WordList } from '../../packages/web/src/features/admin/WordList.js';

const mockAdminGetSlots = vi.fn();
const mockAdminGetPuzzleVariations = vi.fn();
const mockAdminPreview = vi.fn();
const mockAdminSavePuzzle = vi.fn();
const mockAdminGetSuggestion = vi.fn();

vi.mock('../../packages/web/src/api/client.js', () => ({
  adminGetSlots: (...args: unknown[]) => mockAdminGetSlots(...args),
  adminGetPuzzleVariations: (...args: unknown[]) => mockAdminGetPuzzleVariations(...args),
  adminPreview: (...args: unknown[]) => mockAdminPreview(...args),
  adminSavePuzzle: (...args: unknown[]) => mockAdminSavePuzzle(...args),
  adminGetSuggestion: (...args: unknown[]) => mockAdminGetSuggestion(...args),
  adminRejectSuggestion: vi.fn(),
  adminDeletePuzzle: vi.fn(),
  adminSwapPuzzles: vi.fn(),
  adminBlockWord: vi.fn(),
}));

describe('Admin Puzzle Editor UI Components', () => {
  const sampleVariations: VariationData[] = [
    { center: 'a', word_count: 25, max_score: 90, pangram_count: 1, is_active: true },
    { center: 'e', word_count: 12, max_score: 45, pangram_count: 1, is_active: false },
    { center: 'i', word_count: 18, max_score: 60, pangram_count: 1, is_active: false },
    { center: 'k', word_count: 22, max_score: 80, pangram_count: 1, is_active: false },
    { center: 'l', word_count: 14, max_score: 50, pangram_count: 1, is_active: false },
    { center: 'n', word_count: 16, max_score: 55, pangram_count: 1, is_active: false },
    { center: 's', word_count: 20, max_score: 75, pangram_count: 1, is_active: false },
  ];

  it('renders VariationsGrid with 7 buttons, variation stats, and handles center selection', () => {
    const onSelect = vi.fn();
    render(<VariationsGrid variations={sampleVariations} activeCenter="a" onSelect={onSelect} />);

    expect(screen.getByText('25 sanaa')).toBeInTheDocument();
    expect(screen.getByText('90 p')).toBeInTheDocument();
    expect(screen.getByTitle('A on valittu keskuskirjain')).toBeInTheDocument();

    const kBtn = screen.getByTitle('Valitse K keskuskirjaimeksi');
    fireEvent.click(kBtn);
    expect(onSelect).toHaveBeenCalledWith('k');
  });

  it('renders WordList with words, marks pangrams, and calls onBlock on trash click', () => {
    const onBlock = vi.fn();
    const words = ['kala', 'kana', 'kansallinen'];
    render(<WordList words={words} letters="a,e,i,k,l,n,s" loading={false} onBlock={onBlock} />);

    expect(screen.getByText('kala')).toBeInTheDocument();
    expect(screen.getByText('kana')).toBeInTheDocument();
    expect(screen.getByText('kansallinen')).toBeInTheDocument();

    const blockBtn = screen.getByLabelText('Estä kala');
    fireEvent.click(blockBtn);
    expect(onBlock).toHaveBeenCalledWith('kala');
  });

  it('renders AdminWordListPanel with header and empty state when loading or empty', () => {
    const onBlock = vi.fn();
    const { rerender } = render(
      <AdminWordListPanel words={[]} letters="a,e,i,k,l,n,s" loading={true} onBlock={onBlock} />,
    );
    expect(screen.getByText('Ladataan sanoja...')).toBeInTheDocument();

    rerender(
      <AdminWordListPanel words={[]} letters="a,e,i,k,l,n,s" loading={false} onBlock={onBlock} />,
    );
    expect(screen.getByText('Ei sanoja')).toBeInTheDocument();
  });

  it('renders PuzzleSlotControls with navigation, jump, swap, and variations', () => {
    const onFirst = vi.fn();
    const onPrev = vi.fn();
    const onToday = vi.fn();
    const onNext = vi.fn();
    const onLast = vi.fn();
    const onJump = vi.fn((e) => e.preventDefault());
    const onSwap = vi.fn();
    const onCenterSelect = vi.fn();
    const onSave = vi.fn();
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    const onReactivate = vi.fn();
    const onToggleCreateMode = vi.fn();
    const onPreviewForm = vi.fn();
    const onCreateForm = vi.fn();

    render(
      <PuzzleSlotControls
        currentSlot={0}
        currentDisplayNumber={1}
        canGoFirst={false}
        canGoPrev={false}
        canGoToday={true}
        canGoNext={true}
        canGoLast={true}
        totalPuzzles={307}
        variations={sampleVariations}
        activeCenter="a"
        isActive={true}
        isDirty={true}
        saving={false}
        loading={false}
        jumpTarget="5"
        swapTarget="10"
        newLetters="a,e,i,k,l,n,s"
        newCenter="a"
        newSlot=""
        forceRequired={false}
        onJumpTargetChange={vi.fn()}
        onSwapTargetChange={vi.fn()}
        onFirst={onFirst}
        onPrev={onPrev}
        onToday={onToday}
        onNext={onNext}
        onLast={onLast}
        onJump={onJump}
        onSwap={onSwap}
        onCenterSelect={onCenterSelect}
        onSave={onSave}
        onRestore={onRestore}
        onDelete={onDelete}
        onReactivate={onReactivate}
        onToggleCreateMode={onToggleCreateMode}
        onNewLettersChange={vi.fn()}
        onNewCenterChange={vi.fn()}
        onNewSlotChange={vi.fn()}
        onPreviewForm={onPreviewForm}
        onCreateForm={onCreateForm}
      />,
    );

    expect(screen.getByText('Peli 1 / 307')).toBeInTheDocument();
    expect(screen.getByText('Slotti 0')).toBeInTheDocument();
    expect(screen.getByText('Muutoksia')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Ensimmäinen peli' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Tämän päivän peli' }));
    expect(onToday).toHaveBeenCalled();

    const nextBtn = screen.getByRole('button', { name: 'Seuraava peli' });
    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Viimeinen peli' }));
    expect(onLast).toHaveBeenCalled();

    const saveChangesBtn = screen.getByRole('button', { name: 'Tallenna muutokset' });
    fireEvent.click(saveChangesBtn);
    expect(onSave).toHaveBeenCalled();

    const undoBtn = screen.getByTitle('Kumoa muutokset');
    fireEvent.click(undoBtn);
    expect(onRestore).toHaveBeenCalled();
  });

  describe('PuzzleEditor integration', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      useAdminStore.setState({
        isAuthenticated: true,
        username: 'admin',
        csrfToken: 'test-csrf',
        isLoading: false,
        error: null,
      });
    });

    it('defaults to today_slot on mount, keeps pangram count accurate on suggestion preview, and saves suggestion on "Lisää peli"', async () => {
      mockAdminGetSlots.mockResolvedValue({
        slots: [
          { slot: 0, display_number: 1 },
          { slot: 5, display_number: 2 },
          { slot: 9, display_number: 3 },
        ],
        active_slots: [0, 5, 9],
        total_puzzles: 3,
        today_slot: 5,
      });

      mockAdminGetPuzzleVariations.mockImplementation(
        async (_token: string, params: { slot?: number }) => {
          if (params.slot === 5) {
            return {
              slot: 5,
              display_number: 2,
              total_puzzles: 3,
              prev_slot: 0,
              next_slot: 9,
              letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
              center: 'a',
              variations: sampleVariations,
              is_active: true,
            };
          }
          return {
            slot: params.slot ?? 10,
            display_number: 4,
            total_puzzles: 4,
            prev_slot: 9,
            next_slot: null,
            letters: ['a', 'e', 'k', 'm', 'n', 'o', 's'],
            center: 'a',
            variations: sampleVariations,
            is_active: true,
          };
        },
      );

      mockAdminPreview.mockImplementation(
        async (_token: string, payload: { letters: string | string[] }) => {
          const lettersStr = Array.isArray(payload.letters)
            ? payload.letters.join(',')
            : payload.letters;
          if (lettersStr.includes('m')) {
            return {
              words: ['kaamo', 'kaamoksen'],
              max_score: 20,
              word_count: 2,
              pangram_count: 1,
              hint_data: { word_count: 2, pangram_count: 1 },
              variations: [],
            };
          }
          return {
            words: ['kala', 'kansallinen'],
            max_score: 20,
            word_count: 2,
            pangram_count: 1,
            hint_data: { word_count: 2, pangram_count: 1 },
            variations: [],
          };
        },
      );

      mockAdminGetSuggestion.mockResolvedValueOnce({
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
          previous: { slot: 9, shared_letters: 2, shared_short_words: 0 },
          next: { slot: 0, shared_letters: 1, shared_short_words: 0 },
        },
        variations: [],
        reasons: ['sanamäärä tuo vaihtelua'],
        pangrams: ['kaamoksen'],
      });

      mockAdminSavePuzzle.mockResolvedValueOnce({
        status: 'saved',
        slot: 10,
        display_number: 4,
        total_puzzles: 4,
      });

      render(<PuzzleEditor />);

      await waitFor(() => {
        expect(mockAdminGetPuzzleVariations).toHaveBeenCalledWith('test-csrf', { slot: 5 });
        expect(screen.getByText('Peli 2 / 3')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Ehdota peliä' }));
      await waitFor(() => {
        expect(screen.getByText('kaamoksen')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Esikatsele ehdotus' }));
      await waitFor(() => {
        expect(screen.getByText('kaamo')).toBeInTheDocument();
        expect(screen.getByText('2 sanaa, 1 pangrammia')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Lisää peli' }));
      await waitFor(() => {
        expect(mockAdminSavePuzzle).toHaveBeenCalledWith('test-csrf', {
          letters: 'a,e,k,m,n,o,s',
          center: 'a',
        });
        expect(
          screen.getByText('Ehdotettu peli lisätty kiertoon (peli #4, slotti 10)!'),
        ).toBeInTheDocument();
      });
    });

    it('handles center selection save and requires_force confirmation retry', async () => {
      mockAdminGetSlots.mockResolvedValue({
        slots: [{ slot: 5, display_number: 1 }],
        active_slots: [5],
        total_puzzles: 1,
        today_slot: 5,
      });

      mockAdminGetPuzzleVariations.mockResolvedValue({
        slot: 5,
        display_number: 1,
        total_puzzles: 1,
        prev_slot: null,
        next_slot: null,
        letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
        center: 'a',
        variations: sampleVariations,
        is_active: true,
      });

      mockAdminPreview.mockResolvedValue({
        words: ['kala', 'kansa'],
        max_score: 20,
        word_count: 2,
        pangram_count: 1,
        hint_data: { word_count: 2, pangram_count: 1 },
        variations: [],
      });

      const forceError = new Error('Pelissä on alle 15 sanaa') as Error & {
        requires_force?: boolean;
      };
      forceError.requires_force = true;

      mockAdminSavePuzzle
        .mockResolvedValueOnce({
          status: 'saved',
          slot: 5,
          display_number: 1,
          total_puzzles: 1,
        })
        .mockRejectedValueOnce(forceError)
        .mockResolvedValueOnce({
          status: 'saved',
          slot: 5,
          display_number: 1,
          total_puzzles: 1,
        });

      render(<PuzzleEditor />);

      await waitFor(() => {
        expect(screen.getByText('Peli 1 / 1')).toBeInTheDocument();
      });

      // Change variation center and save dirty change
      fireEvent.click(screen.getByTitle('Valitse K keskuskirjaimeksi'));
      expect(screen.getByText('Muutoksia')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Tallenna muutokset' }));

      await waitFor(() => {
        expect(mockAdminSavePuzzle).toHaveBeenNthCalledWith(1, 'test-csrf', {
          slot: 5,
          letters: 'a,e,i,k,l,n,s',
          center: 'k',
          force: false,
        });
        expect(screen.getByText('Peli tallennettu onnistuneesti!')).toBeInTheDocument();
      });

      // Submit manual puzzle that triggers requires_force, then confirm override
      fireEvent.change(screen.getByLabelText(/Kirjaimet/i), {
        target: { value: 'a,e,i,k,l,n,s' },
      });
      fireEvent.change(screen.getByLabelText(/Keskuskirjain/i), {
        target: { value: 'e' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Tallenna peli' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Pelissä on alle 15 sanaa');
      });

      const forceBtn = screen.getByRole('button', { name: 'Luo silti (Ohita varoitus)' });
      fireEvent.click(forceBtn);

      await waitFor(() => {
        expect(mockAdminSavePuzzle).toHaveBeenNthCalledWith(3, 'test-csrf', {
          letters: 'a,e,i,k,l,n,s',
          center: 'e',
          force: true,
        });
      });
    });
  });
});
