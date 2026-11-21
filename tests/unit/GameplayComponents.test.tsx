import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deriveHintData } from '../../packages/shared/src/index.js';
import { FoundWords } from '../../packages/web/src/features/gameplay/FoundWords.js';
import { GameControls } from '../../packages/web/src/features/gameplay/GameControls.js';
import { HintMatrixTable } from '../../packages/web/src/features/gameplay/HintMatrixTable.js';
import { HintPanels } from '../../packages/web/src/features/gameplay/HintPanels.js';
import { Honeycomb } from '../../packages/web/src/features/gameplay/Honeycomb.js';
import { useKeyboard } from '../../packages/web/src/features/gameplay/useKeyboard.js';
import { useUiStore } from '../../packages/web/src/features/gameplay/useUiStore.js';
import { beforeEach } from 'vitest';

describe('Gameplay UI Components', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.getState().setHintsHidden(true);
  });
  it('renders Honeycomb center and outer letters and fires letter callbacks on interaction', () => {
    const onLetterPress = vi.fn();
    const onHexDown = vi.fn();
    const onHexUp = vi.fn();

    render(
      <Honeycomb
        center="a"
        outerLetters={['e', 'i', 'k', 'l', 'n', 's']}
        pressedHexIndex={null}
        onLetterPress={onLetterPress}
        onHexDown={onHexDown}
        onHexUp={onHexUp}
      />,
    );

    const img = screen.getByRole('img', { name: /Kirjainkenno/i });
    expect(img).toBeInTheDocument();

    const centerCell = screen.getByTestId('hex-cell-a');
    expect(centerCell).toHaveAttribute('data-hex-center', 'true');

    const outerCellK = screen.getByTestId('hex-cell-k');
    expect(outerCellK).toHaveAttribute('data-hex-center', 'false');

    fireEvent.pointerDown(outerCellK);
    expect(onHexDown).toHaveBeenCalled();
    expect(onLetterPress).toHaveBeenCalledWith('k');
  });

  it('supports HintPanels progressive 4-tier deck and tier unlocking', () => {
    const onUnlock = vi.fn();
    const hintData = deriveHintData(
      {
        word_count: 4,
        pangram_count: 1,
        by_letter: { k: 3, l: 1 },
        by_length: { '4': 2, '6': 1, '11': 1 },
        matrix: {
          k: { '4': 2, '11': 1 },
          l: { '6': 1 },
        },
        pangram_details: [{ length: 11, first_letter: 'k' }],
        suffixes: { inen: 1 },
      },
      new Set(['kana']),
      new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']),
    );

    const { rerender } = render(
      <HintPanels hintsUnlocked={new Set()} onUnlock={onUnlock} hintData={hintData} />,
    );

    // Hints default to collapsed (shows counter and "Näytä avut" button)
    expect(screen.getByTestId('hint-words-counter')).toHaveTextContent('3/4');
    const showHintsBtn = screen.getByTestId('show-hints-button');
    expect(showHintsBtn).toHaveTextContent('Näytä avut');
    expect(screen.queryByTestId('activate-hints-button')).not.toBeInTheDocument();

    // Expanding hints shows the active tab content
    fireEvent.click(showHintsBtn);
    expect(useUiStore.getState().hintsHidden).toBe(false);

    // Level 0: both tabs locked, matrix tab shows a single unlock button
    expect(screen.queryByTestId('upgrade-tier-button')).not.toBeInTheDocument();
    const activateBtn = screen.getByTestId('activate-hints-button');
    fireEvent.click(activateBtn);
    expect(onUnlock).toHaveBeenCalledWith('tier1');

    // Rerender with Tier 1 unlocked -> shows starting letters & next-level CTA in matrix area
    rerender(
      <HintPanels hintsUnlocked={new Set(['tier1'])} onUnlock={onUnlock} hintData={hintData} />,
    );
    expect(screen.getByTestId('hint-words-counter')).toHaveTextContent('3/4');
    const matrixTier1Content = screen.getByTestId('hint-content-tier1');
    expect(matrixTier1Content).toBeInTheDocument();
    const matrixUpgradeBtn = screen.getByTestId('upgrade-tier-button');
    expect(matrixUpgradeBtn).toHaveTextContent('Näytä pituudet kirjaimittain');
    expect(matrixTier1Content).toContainElement(matrixUpgradeBtn);

    // Upgrade to Matrix Step 2 (tier3)
    fireEvent.click(matrixUpgradeBtn);
    expect(onUnlock).toHaveBeenCalledWith('tier3');

    // Rerender with Tier 3 unlocked -> shows full 2D matrix
    rerender(
      <HintPanels
        hintsUnlocked={new Set(['tier1', 'tier3'])}
        onUnlock={onUnlock}
        hintData={hintData}
      />,
    );
    expect(screen.getByTestId('hint-content-tier3')).toBeInTheDocument();
    expect(screen.getByTestId('hint-words-counter')).toHaveTextContent('3/4');
    // Matrix fully open: no further CTA and no status text on this tab
    expect(screen.queryByTestId('upgrade-tier-button')).not.toBeInTheDocument();

    // Switch to Vihjeet tab while all 3 parts are still locked
    fireEvent.click(screen.getByTestId('tier-tab-2'));
    expect(screen.getByLabelText('Taso 0/3')).toBeInTheDocument();
    expect(screen.getByTestId('clue-locked-pangrams')).toBeInTheDocument();
    expect(screen.getByTestId('clue-locked-pairs')).toBeInTheDocument();
    expect(screen.getByTestId('clue-locked-suffixes')).toBeInTheDocument();

    // Unlock Pangrams independently
    const unlockPangramsBtn = screen.getByTestId('unlock-pangrams-button');
    fireEvent.click(unlockPangramsBtn);
    expect(onUnlock).toHaveBeenCalledWith('tier2');

    // Rerender with Pangrams unlocked (1/3 open)
    rerender(
      <HintPanels
        hintsUnlocked={new Set(['tier1', 'tier2', 'tier3'])}
        onUnlock={onUnlock}
        hintData={hintData}
      />,
    );
    fireEvent.click(screen.getByTestId('tier-tab-2'));
    expect(screen.getByLabelText('Taso 1/3')).toBeInTheDocument();
    const vihjeetTier2Content = screen.getByTestId('hint-content-tier2');
    expect(vihjeetTier2Content).toHaveTextContent(/k\s*\(11\)/);
    expect(screen.getByTestId('hint-words-counter')).toHaveTextContent('3/4');

    // Unlock Pairs independently
    const unlockPairsBtn = screen.getByTestId('unlock-pairs-button');
    fireEvent.click(unlockPairsBtn);
    expect(onUnlock).toHaveBeenCalledWith('pairs');

    // Rerender with Pangrams + Pairs unlocked (2/3 open)
    rerender(
      <HintPanels
        hintsUnlocked={new Set(['tier1', 'tier2', 'tier3', 'pairs'])}
        onUnlock={onUnlock}
        hintData={hintData}
      />,
    );
    fireEvent.click(screen.getByTestId('tier-tab-2'));
    expect(screen.getByLabelText('Taso 2/3')).toBeInTheDocument();
    expect(screen.getByTestId('clue-section-pairs')).toBeInTheDocument();

    // Unlock Suffixes independently
    const unlockSuffixesBtn = screen.getByTestId('unlock-suffixes-button');
    fireEvent.click(unlockSuffixesBtn);
    expect(onUnlock).toHaveBeenCalledWith('tier4');

    // Rerender with all 3 unlocked (3/3 open)
    rerender(
      <HintPanels
        hintsUnlocked={new Set(['tier1', 'tier2', 'tier3', 'tier4', 'pairs'])}
        onUnlock={onUnlock}
        hintData={hintData}
      />,
    );
    fireEvent.click(screen.getByTestId('tier-tab-2'));
    expect(screen.getByLabelText('Taso 3/3')).toBeInTheDocument();
    expect(screen.getByTestId('hint-content-tier4')).toHaveTextContent('-inen');
    expect(screen.getByTestId('clue-section-pangrams')).toBeInTheDocument();
    expect(screen.getByTestId('clue-section-pairs')).toBeInTheDocument();
    expect(screen.getByTestId('clue-section-suffixes')).toBeInTheDocument();
    expect(screen.getByTestId('hint-words-counter')).toHaveTextContent('3/4');

    // Verify toolbar layout: counter is left-aligned in both expanded and collapsed states
    const expandedToolbar = screen.getByTestId('hint-words-counter').parentElement?.parentElement;
    expect(expandedToolbar?.firstChild).toContainElement(screen.getByTestId('hint-words-counter'));
    expect(expandedToolbar?.lastChild).toContainElement(screen.getByTestId('tier-tab-1'));
    expect(expandedToolbar?.lastChild).toContainElement(screen.getByTestId('hide-hints-button'));

    // Hide toggle collapses the deck and persists the preference while keeping area reserved
    const deck = screen.getByTestId('hint-deck');
    expect(deck).toHaveStyle({ height: '172px' });
    fireEvent.click(screen.getByTestId('hide-hints-button'));
    expect(screen.queryByTestId('hint-content-tier4')).not.toBeInTheDocument();
    expect(screen.getByTestId('hint-words-counter')).toHaveTextContent('3/4');
    const collapsedToolbar = screen.getByTestId('hint-words-counter').parentElement?.parentElement;
    expect(collapsedToolbar?.firstChild).toContainElement(screen.getByTestId('hint-words-counter'));
    expect(collapsedToolbar?.lastChild).toContainElement(screen.getByTestId('show-hints-button'));
    expect(deck).toHaveStyle({ height: '172px' });
    expect(useUiStore.getState().hintsHidden).toBe(true);
    fireEvent.click(screen.getByTestId('show-hints-button'));
    expect(screen.getByTestId('hint-content-tier4')).toBeInTheDocument();
    expect(deck).toHaveStyle({ height: '172px' });
    expect(useUiStore.getState().hintsHidden).toBe(false);
  });

  it('renders FoundWords with Kotus dictionary links and pangram bolding', () => {
    const onToggleShowAll = vi.fn();
    const allLetters = new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']);

    render(
      <FoundWords
        foundWords={['kana', 'kansallinen']}
        recentWords={['kansallinen', 'kana']}
        showAll={false}
        allLetters={allLetters}
        onToggleShowAll={onToggleShowAll}
        lastResubmittedWord={null}
      />,
    );

    expect(screen.getByTestId('found-words-count')).toHaveTextContent('2');
    const link = screen.getByRole('link', {
      name: 'Avaa sanan "kansallinen" määritelmä Kotuksessa',
    });
    expect(link).toHaveAttribute('href', expect.stringContaining('kielitoimistonsanakirja.fi'));
  });

  it('triggers onShuffle when Space key is pressed and enabled', () => {
    const onShuffle = vi.fn();
    const onLetter = vi.fn();
    const onBackspace = vi.fn();
    const onEnter = vi.fn();
    const onEscape = vi.fn();

    renderHook(() =>
      useKeyboard({
        onShuffle,
        onLetter,
        onBackspace,
        onEnter,
        onEscape,
        enabled: true,
      }),
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(onShuffle).toHaveBeenCalledTimes(1);
    expect(onLetter).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(onLetter).toHaveBeenCalledWith('k');
  });

  it('colors word length numbers with accent when words of that length remain, and tertiary when 0 remain or unrevealed', () => {
    const hintData = deriveHintData(
      {
        word_count: 4,
        pangram_count: 1,
        by_letter: { k: 3, l: 1 },
        by_length: { '4': 2, '6': 1, '11': 1 },
        matrix: {
          k: { '4': 2, '11': 1 },
          l: { '6': 1 },
        },
        pangram_details: [{ length: 11, first_letter: 'k' }],
        suffixes: { inen: 1 },
      },
      new Set(['kana', 'kala']), // 4-letter words found, 6 and 11 remain
      new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']),
    );

    // When isRevealed is false: all length numbers are tertiary colored
    const { rerender } = render(
      <HintMatrixTable
        data={hintData}
        activeLengths={[4, 6, 11]}
        activeLetters={['k', 'l']}
        isRevealed={false}
      />,
    );

    const thLen4 = screen.getByText('4');
    const thLen6 = screen.getByText('6');
    const thLen11 = screen.getByText('11');
    expect(thLen4).toHaveStyle({ color: 'var(--color-text-tertiary)' });
    expect(thLen6).toHaveStyle({ color: 'var(--color-text-tertiary)' });
    expect(thLen11).toHaveStyle({ color: 'var(--color-text-tertiary)' });

    // When isRevealed is true: length 4 has 0 remaining -> tertiary; length 6 and 11 have words remaining -> accent
    rerender(
      <HintMatrixTable
        data={hintData}
        activeLengths={[4, 6, 11]}
        activeLetters={['k', 'l']}
        isRevealed={true}
      />,
    );

    expect(screen.getByText('4')).toHaveStyle({ color: 'var(--color-text-tertiary)' });
    expect(screen.getByText('6')).toHaveStyle({ color: 'var(--color-accent)' });
    expect(screen.getByText('11')).toHaveStyle({ color: 'var(--color-accent)' });
  });

  it('keeps all 7 letters rendered cleanly across rapid shuffle triggers', () => {
    act(() => {
      useUiStore.getState().resetUi();
    });

    const { rerender } = render(
      <Honeycomb
        center="a"
        outerLetters={['e', 'i', 'k', 'l', 'n', 's']}
        pressedHexIndex={null}
        onLetterPress={vi.fn()}
        onHexDown={vi.fn()}
        onHexUp={vi.fn()}
      />,
    );

    expect(useUiStore.getState().shuffleCount).toBe(0);
    for (const letter of ['A', 'E', 'I', 'K', 'L', 'N', 'S']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }

    // First shuffle
    act(() => {
      useUiStore.getState().triggerShuffleSpin();
    });
    expect(useUiStore.getState().shuffleCount).toBe(1);
    rerender(
      <Honeycomb
        center="a"
        outerLetters={['k', 'e', 'i', 's', 'n', 'l']}
        pressedHexIndex={null}
        onLetterPress={vi.fn()}
        onHexDown={vi.fn()}
        onHexUp={vi.fn()}
      />,
    );

    for (const letter of ['A', 'K', 'E', 'I', 'S', 'N', 'L']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }

    // Rapid second shuffle before previous timer ends
    act(() => {
      useUiStore.getState().triggerShuffleSpin();
    });
    expect(useUiStore.getState().shuffleCount).toBe(2);
    rerender(
      <Honeycomb
        center="a"
        outerLetters={['s', 'k', 'e', 'l', 'i', 'n']}
        pressedHexIndex={null}
        onLetterPress={vi.fn()}
        onHexDown={vi.fn()}
        onHexUp={vi.fn()}
      />,
    );

    for (const letter of ['A', 'S', 'K', 'E', 'L', 'I', 'N']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }
  });

  it('GameControls deactivates Poista, Sekoita, and OK when disabled while keeping Jaa active', () => {
    const onDelete = vi.fn();
    const onShuffle = vi.fn();
    const onShare = vi.fn();
    const onSubmit = vi.fn();

    render(
      <GameControls
        onDelete={onDelete}
        onShuffle={onShuffle}
        onShare={onShare}
        shareCopied={false}
        onSubmit={onSubmit}
        disabled={true}
      />,
    );

    const deleteBtn = screen.getByRole('button', { name: 'Poista' });
    const shuffleBtn = screen.getByRole('button', { name: 'Sekoita' });
    const shareBtn = screen.getByRole('button', { name: 'Jaa' });
    const submitBtn = screen.getByRole('button', { name: 'OK' });

    expect(deleteBtn).toBeDisabled();
    expect(shuffleBtn).toBeDisabled();
    expect(submitBtn).toBeDisabled();
    expect(shareBtn).not.toBeDisabled();

    fireEvent.pointerDown(deleteBtn);
    fireEvent.click(deleteBtn);
    fireEvent.pointerDown(shuffleBtn);
    fireEvent.click(shuffleBtn);
    fireEvent.pointerDown(submitBtn);
    fireEvent.click(submitBtn);

    expect(onDelete).not.toHaveBeenCalled();
    expect(onShuffle).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(shareBtn);
    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
