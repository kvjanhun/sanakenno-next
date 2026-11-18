import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deriveHintData } from '../../packages/shared/src/hint-data.js';
import { HintMatrixTable } from '../../packages/web/src/features/gameplay/HintMatrixTable.js';

describe('HintMatrixTable (Behavior & Omitted Empty Columns)', () => {
  it('renders 16 active word lengths and counts remaining words per letter and length when revealed', () => {
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

    const ths = container.querySelectorAll('thead th');
    expect(ths).toHaveLength(2 + 16);
    expect(ths[0]).toHaveTextContent('Kirj.');
    expect(ths[1]).toHaveTextContent('Yht.');
    activeLengths.forEach((len, idx) => {
      expect(ths[2 + idx]).toHaveTextContent(String(len));
    });

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const firstRowCells = rows[0]!.querySelectorAll('td');
    expect(firstRowCells[0]).toHaveTextContent('A');
    expect(firstRowCells[1]).toHaveTextContent('4');
    expect(firstRowCells[2]).toHaveTextContent('2'); // length 4
    expect(firstRowCells[3]).toHaveTextContent('1'); // length 5
    expect(firstRowCells[firstRowCells.length - 1]).toHaveTextContent('1'); // length 19
  });

  it('omits empty length columns and marks completed letters with a checkmark', () => {
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
      new Set<string>(['laakso']), // exhausts letter 'l'
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
    expect(ths).toHaveLength(5);
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();

    const rows = container.querySelectorAll('tbody tr');
    expect(rows[1]!.querySelectorAll('td')[0]).toHaveTextContent('L');
    expect(rows[1]!.querySelectorAll('td')[1]).toHaveTextContent('✓');
  });

  it('masks matrix counts and invokes onUpgrade when unrevealed button is clicked', () => {
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

    const cells = container.querySelectorAll('tbody tr:first-child td');
    expect(cells[1]).toHaveTextContent('2'); // row total visible at tier 1
    expect(cells[2]).toHaveTextContent('·'); // per-length cell masked

    fireEvent.click(screen.getByTestId('upgrade-tier-button'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});
