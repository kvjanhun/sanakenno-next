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

describe('Gameplay UI Components', () => {
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

    // Level 0: both tabs locked, matrix tab shows a single unlock button
    expect(screen.getByTestId('hint-words-counter')).toHaveTextContent('3/4');
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
    expect(matrixUpgradeBtn).toHaveTextContent('Avaa seuraava taso');
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
    expect(window.localStorage.getItem('sanakenno_hints_hidden')).toBe('1');
    fireEvent.click(screen.getByTestId('show-hints-button'));
    expect(screen.getByTestId('hint-content-tier4')).toBeInTheDocument();
    expect(deck).toHaveStyle({ height: '172px' });
    expect(window.localStorage.getItem('sanakenno_hints_hidden')).toBe('0');
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

  it('rotates only hexagon polygons while letters remain upright, and triggers new rotation on each shuffle', () => {
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

    // Initial state: letters upright, outer hex group has no animation
    const outerGroupInitial = screen.getByTestId('outer-hex-group');
    expect(outerGroupInitial).toHaveStyle({ animation: 'none' });
    const letterTextK = screen.getByText('K');
    expect(letterTextK).not.toHaveStyle({ transform: expect.stringContaining('rotate') });
    // All 7 letters are visible
    for (const letter of ['A', 'E', 'I', 'K', 'L', 'N', 'S']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }

    // First shuffle
    act(() => {
      useUiStore.getState().triggerShuffleSpin();
    });
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

    const outerGroup1 = screen.getByTestId('outer-hex-group');
    expect(outerGroup1).toHaveStyle({
      animation: 'hex-shuffle-spin 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    // Outer letter moves with hex while counter-spinning to stay upright
    expect(screen.getByText('K')).toHaveStyle({
      animation: 'letter-counter-spin 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    // Center letter does not animate
    expect(screen.getByText('A')).not.toHaveStyle({
      animation: expect.stringContaining('counter-spin'),
    });
    // All 7 letters remain visible
    for (const letter of ['A', 'K', 'E', 'I', 'S', 'N', 'L']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }

    // Rapid second shuffle before previous timer would end
    act(() => {
      useUiStore.getState().triggerShuffleSpin();
    });
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

    const outerGroup2 = screen.getByTestId('outer-hex-group');
    expect(outerGroup2).toHaveStyle({
      animation: 'hex-shuffle-spin 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    expect(screen.getByText('S')).toHaveStyle({
      animation: 'letter-counter-spin 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    // All letters remain visible after repeated rapid shuffle
    for (const letter of ['A', 'S', 'K', 'E', 'L', 'I', 'N']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }
  });

  it('verifies responsive viewport alignment and spacing constraints (Spec 14)', () => {
    // FoundWords count text must not have artificial left indent pl-2
    const { container: fwContainer } = render(
      <FoundWords
        foundWords={['omena', 'ananas']}
        recentWords={['ananas', 'omena']}
        showAll={false}
        allLetters={new Set(['a', 'e', 'm', 'n', 'o', 's'])}
        onToggleShowAll={vi.fn()}
        lastResubmittedWord={null}
      />,
    );
    const countWrapper = fwContainer.querySelector(
      '[data-testid="found-words-count"]',
    )?.parentElement;
    expect(countWrapper?.className).not.toContain('pl-2');
    expect(countWrapper?.className).toContain('flex items-center gap-1.5');

    // HintPanels deck container must not have inset px-0.5
    const hintData = deriveHintData(
      {
        word_count: 2,
        pangram_count: 0,
        by_letter: { o: 1, a: 1 },
        by_length: { '5': 1, '6': 1 },
        matrix: { o: { '5': 1 }, a: { '6': 1 } },
      },
      new Set(['omena', 'ananas']),
      new Set(),
    );
    render(<HintPanels hintsUnlocked={new Set()} onUnlock={vi.fn()} hintData={hintData} />);
    const deck = screen.getByTestId('hint-deck');
    expect(deck.className).not.toContain('px-0.5');

    // GameControls has responsive gap for resilient small screens
    const { container: gcContainer } = render(
      <GameControls
        onDelete={vi.fn()}
        onShuffle={vi.fn()}
        onShare={vi.fn()}
        shareCopied={false}
        onSubmit={vi.fn()}
      />,
    );
    const controlsRow = gcContainer.firstElementChild;
    expect(controlsRow?.className).toContain('gap-2.5 sm:gap-3');
  });
});
