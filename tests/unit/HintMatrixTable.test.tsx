import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deriveHintData } from '../../packages/shared/src/hint-data.js';
import { HintMatrixTable } from '../../packages/web/src/features/gameplay/HintMatrixTable.js';

describe('HintMatrixTable & Column Sizing (Spec 15)', () => {
  it('confirms letter set aeilnst spans 16 distinct active word lengths (4-19)', () => {
    const kotusPath = path.resolve(
      import.meta.dirname,
      '../../packages/server/assets/kotus_words.txt',
    );
    const content = fs.readFileSync(kotusPath, 'utf-8');
    const words = content
      .split('\n')
      .map((w) => w.trim())
      .filter(Boolean);

    const letterSet = new Set(['a', 'e', 'i', 'l', 'n', 's', 't']);
    const puzzleWords = words.filter((w) => {
      const clean = w.replace(/-/g, '').toLowerCase();
      return clean.length >= 4 && [...clean].every((ch) => letterSet.has(ch));
    });

    const distinctLengths = [...new Set(puzzleWords.map((w) => w.replace(/-/g, '').length))].sort(
      (a, b) => a - b,
    );

    expect(distinctLengths).toHaveLength(16);
    expect(distinctLengths).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('renders length columns with constant width classes and left-aligned container', () => {
    const activeLengths = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const matrix: Record<string, Record<string, number>> = {
      a: { '4': 2, '5': 1, '19': 1 },
      s: { '4': 1, '6': 1 },
    };

    const hintData = deriveHintData(
      {
        word_count: 5,
        pangram_count: 1,
        by_letter: { a: 4, s: 2 },
        by_length: { '4': 3, '5': 1, '6': 1, '19': 1 },
        matrix,
        pangram_details: [{ length: 19, first_letter: 'a' }],
        suffixes: {},
      },
      new Set<string>(),
      new Set(['a', 'e', 'i', 'l', 'n', 's', 't']),
    );

    const { container } = render(
      <HintMatrixTable
        data={hintData}
        activeLengths={activeLengths}
        activeLetters={['a', 's']}
        isRevealed={true}
      />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass('items-start');

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveClass('w-max');
    expect(table).toHaveClass('table-fixed');

    // Check col elements for constant widths
    const cols = container.querySelectorAll('colgroup col');
    expect(cols).toHaveLength(2 + 16); // 2 header cols (Kirj, Yht) + 16 length cols
    expect(cols[0]).toHaveClass('w-[28px]');
    expect(cols[1]).toHaveClass('w-[32px]');
    for (let i = 2; i < cols.length; i++) {
      expect(cols[i]).toHaveStyle({ width: '17px' });
    }

    // Check th elements for centered alignment in length columns
    const ths = container.querySelectorAll('thead th');
    expect(ths[0]).toHaveTextContent('Kirj.');
    expect(ths[0]).toHaveClass('w-[28px]');
    expect(ths[1]).toHaveTextContent('Yht.');
    expect(ths[1]).toHaveClass('w-[32px]');

    activeLengths.forEach((len, idx) => {
      const th = ths[2 + idx];
      expect(th).toHaveTextContent(String(len));
      expect(th).toHaveStyle({ width: '17px' });
      expect(th).toHaveClass('text-center');
    });

    // Verify cell content centering and constant widths
    const firstRowCells = container.querySelectorAll('tbody tr:first-child td');
    expect(firstRowCells[0]).toHaveTextContent('A');
    expect(firstRowCells[0]).toHaveClass('w-[28px]');
    expect(firstRowCells[1]).toHaveClass('w-[32px]');
    for (let i = 2; i < firstRowCells.length; i++) {
      expect(firstRowCells[i]).toHaveStyle({ width: '17px' });
      expect(firstRowCells[i]).toHaveClass('text-center');
    }
  });

  it('omits empty columns and reserves space without stretching across full card', () => {
    // Only 3 lengths present -> width expands up to 32px for extra breathing room
    const activeLengths = [4, 6, 11];
    const hintData = deriveHintData(
      {
        word_count: 3,
        pangram_count: 1,
        by_letter: { k: 2, l: 1 },
        by_length: { '4': 1, '6': 1, '11': 1 },
        matrix: { k: { '4': 1, '11': 1 }, l: { '6': 1 } },
        pangram_details: [{ length: 11, first_letter: 'k' }],
        suffixes: {},
      },
      new Set<string>(),
      new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']),
    );

    const { container } = render(
      <HintMatrixTable
        data={hintData}
        activeLengths={activeLengths}
        activeLetters={['k', 'l']}
        isRevealed={true}
      />,
    );

    const ths = container.querySelectorAll('thead th');
    // Kirj + Yht + 3 length columns = 5 columns total
    expect(ths).toHaveLength(5);
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();

    // 3 columns expand to 32px breathing room
    const lengthCols = container.querySelectorAll('colgroup col');
    expect(lengthCols[2]).toHaveStyle({ width: '32px' });

    const table = container.querySelector('table');
    expect(table).not.toHaveClass('w-full');
    expect(table).toHaveClass('w-max');
  });

  it('positions UpgradeButton over length columns when isRevealed is false', () => {
    const onUpgrade = vi.fn();
    const hintData = deriveHintData(
      {
        word_count: 2,
        pangram_count: 0,
        by_letter: { a: 2 },
        by_length: { '4': 2 },
        matrix: { a: { '4': 2 } },
        pangram_details: [],
        suffixes: {},
      },
      new Set<string>(),
      new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']),
    );

    const { container } = render(
      <HintMatrixTable
        data={hintData}
        activeLengths={[4]}
        activeLetters={['a']}
        isRevealed={false}
        onUpgrade={onUpgrade}
      />,
    );

    const upgradeOverlay = container.querySelector('.absolute');
    expect(upgradeOverlay).toBeInTheDocument();
    expect(upgradeOverlay).toHaveStyle({ left: '60px' });
    expect(screen.getByTestId('upgrade-tier-button')).toBeInTheDocument();
  });
});
