import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveHintData } from '@sanakenno/shared';
import { HintPanels } from '../../packages/web/src/features/gameplay/HintPanels.js';
import { useUiStore } from '../../packages/web/src/features/gameplay/useUiStore.js';

describe('Vihjeet Clues Deck & Granular Unlocks (Spec 16)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.getState().setHintsHidden(false);
  });
  const letters = new Set(['a', 'e', 'i', 'k', 'l', 'm', 'n', 's', 't']);

  const sampleHintData = deriveHintData(
    {
      word_count: 10,
      pangram_count: 2,
      by_letter: { k: 5, l: 3, s: 2 },
      by_length: { '4': 4, '5': 3, '8': 1, '9': 2 },
      by_pair: {
        ka: 3,
        ki: 2,
        ko: 1,
        la: 2,
        li: 1,
        sa: 1,
        si: 1,
        ta: 1, // 8th pair (should be truncated out of top 7)
      },
      matrix: {
        k: { '4': 2, '5': 2, '9': 1 },
        l: { '4': 1, '5': 1, '9': 1 },
        s: { '4': 1, '8': 1 },
      },
      pangram_details: [
        { length: 9, first_letter: 'k' },
        { length: 9, first_letter: 'l' },
      ],
      suffixes: {
        inen: 3,
        ton: 2,
        sto: 2,
        kas: 1,
        sti: 1,
        lla: 1,
        va: 1,
        tu: 1, // 8th suffix (should be truncated out of top 7)
      },
    },
    new Set(['kissa', 'kala']), // 2 words found
    letters,
  );

  it('renders all three parts closed (0 open) with 0/3 pips and compact locked rows', () => {
    const onUnlock = vi.fn();
    render(<HintPanels hintsUnlocked={new Set()} onUnlock={onUnlock} hintData={sampleHintData} />);

    // Switch to Vihjeet tab
    fireEvent.click(screen.getByTestId('tier-tab-2'));

    // Pips reflect 0/3
    expect(screen.getByLabelText('Taso 0/3')).toBeInTheDocument();

    // All 3 locked rows present
    expect(screen.getByTestId('clue-locked-pangrams')).toBeInTheDocument();
    expect(screen.getByTestId('clue-locked-pairs')).toBeInTheDocument();
    expect(screen.getByTestId('clue-locked-suffixes')).toBeInTheDocument();

    // Unlocked clue views not in document
    expect(screen.queryByTestId('clue-section-pangrams')).not.toBeInTheDocument();
    expect(screen.queryByTestId('clue-section-pairs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('clue-section-suffixes')).not.toBeInTheDocument();

    // Fixed height
    expect(screen.getByTestId('hint-deck')).toHaveStyle({ height: '172px' });
  });

  it('allows unlocking Alkuparit independently (1 open: pairs only)', () => {
    const onUnlock = vi.fn();
    render(
      <HintPanels
        hintsUnlocked={new Set(['pairs'])}
        onUnlock={onUnlock}
        hintData={sampleHintData}
      />,
    );

    fireEvent.click(screen.getByTestId('tier-tab-2'));

    // Pips reflect 1/3
    expect(screen.getByLabelText('Taso 1/3')).toBeInTheDocument();

    // Pairs is open, others are locked
    expect(screen.getByTestId('clue-section-pairs')).toBeInTheDocument();
    expect(screen.getByTestId('clue-locked-pangrams')).toBeInTheDocument();
    expect(screen.getByTestId('clue-locked-suffixes')).toBeInTheDocument();

    // Only top 7 pairs are shown (8th 'ta' omitted by count/alphabetical order)
    const pairSection = screen.getByTestId('clue-section-pairs');
    expect(pairSection).toHaveTextContent(/ka/i);
    expect(pairSection).toHaveTextContent(/ki/i);
    expect(pairSection).toHaveTextContent(/la/i);
    expect(pairSection).not.toHaveTextContent(/ta/i);

    expect(screen.getByTestId('hint-deck')).toHaveStyle({ height: '172px' });
  });

  it('allows unlocking two parts (2 open: pangrams + suffixes)', () => {
    const onUnlock = vi.fn();
    render(
      <HintPanels
        hintsUnlocked={new Set(['tier2', 'tier4'])}
        onUnlock={onUnlock}
        hintData={sampleHintData}
      />,
    );

    fireEvent.click(screen.getByTestId('tier-tab-2'));

    // Pips reflect 2/3
    expect(screen.getByLabelText('Taso 2/3')).toBeInTheDocument();

    expect(screen.getByTestId('clue-section-pangrams')).toBeInTheDocument();
    expect(screen.getByTestId('clue-section-suffixes')).toBeInTheDocument();
    expect(screen.getByTestId('clue-locked-pairs')).toBeInTheDocument();

    // Suffixes show top 7 only (8th '-va' omitted by alphabetical tie-break)
    const suffixSection = screen.getByTestId('clue-section-suffixes');
    expect(suffixSection).toHaveTextContent('-inen');
    expect(suffixSection).toHaveTextContent('-ton');
    expect(suffixSection).not.toHaveTextContent('-va');

    expect(screen.getByTestId('hint-deck')).toHaveStyle({ height: '172px' });
  });

  it('renders all three parts unlocked (3 open: all open) with completion marks', () => {
    const onUnlock = vi.fn();
    render(
      <HintPanels
        hintsUnlocked={new Set(['tier2', 'pairs', 'tier4'])}
        onUnlock={onUnlock}
        hintData={sampleHintData}
      />,
    );

    fireEvent.click(screen.getByTestId('tier-tab-2'));

    // Pips reflect 3/3
    expect(screen.getByLabelText('Taso 3/3')).toBeInTheDocument();

    expect(screen.getByTestId('clue-section-pangrams')).toBeInTheDocument();
    expect(screen.getByTestId('clue-section-pairs')).toBeInTheDocument();
    expect(screen.getByTestId('clue-section-suffixes')).toBeInTheDocument();

    // No locked rows remain
    expect(screen.queryByTestId('clue-locked-pangrams')).not.toBeInTheDocument();
    expect(screen.queryByTestId('clue-locked-pairs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('clue-locked-suffixes')).not.toBeInTheDocument();

    // Deck preserves fixed height
    expect(screen.getByTestId('hint-deck')).toHaveStyle({ height: '172px' });
  });

  it('defaults to collapsed and expands when user clicks "Näytä avut"', () => {
    useUiStore.getState().setHintsHidden(true);
    render(<HintPanels hintsUnlocked={new Set()} onUnlock={vi.fn()} hintData={sampleHintData} />);

    expect(screen.getByTestId('show-hints-button')).toBeInTheDocument();
    expect(screen.queryByTestId('tier-tab-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('show-hints-button'));
    expect(screen.getByTestId('tier-tab-2')).toBeInTheDocument();
    expect(screen.getByTestId('hide-hints-button')).toBeInTheDocument();
  });
});
