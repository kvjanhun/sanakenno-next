import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VariationData } from '@sanakenno/shared';
import { AdminWordListPanel } from '../../packages/web/src/features/admin/AdminWordListPanel.js';
import { PuzzleSlotControls } from '../../packages/web/src/features/admin/PuzzleSlotControls.js';
import { VariationsGrid } from '../../packages/web/src/features/admin/VariationsGrid.js';
import { WordList } from '../../packages/web/src/features/admin/WordList.js';

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
    const onPrev = vi.fn();
    const onNext = vi.fn();
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
        canGoPrev={false}
        canGoNext={true}
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
        onPrev={onPrev}
        onNext={onNext}
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

    const nextBtn = screen.getByRole('button', { name: 'Seuraava peli' });
    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalled();

    const saveChangesBtn = screen.getByRole('button', { name: 'Tallenna muutokset' });
    fireEvent.click(saveChangesBtn);
    expect(onSave).toHaveBeenCalled();

    const undoBtn = screen.getByTitle('Kumoa muutokset');
    fireEvent.click(undoBtn);
    expect(onRestore).toHaveBeenCalled();
  });
});
