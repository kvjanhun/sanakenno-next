import type { DerivedHintData } from './hints.js';

export interface HintMatrixTableProps {
  data: DerivedHintData;
  activeLengths: number[];
  activeLetters: string[];
  isRevealed: boolean;
}

/**
 * 2D Matrix Table rendering starting letters, totals column, and word lengths.
 * When isRevealed is false (Step 1), length columns render faint dots.
 * When isRevealed is true (Step 2), all counts count down dynamically.
 */
export function HintMatrixTable({
  data,
  activeLengths,
  activeLetters,
  isRevealed,
}: HintMatrixTableProps): React.JSX.Element {
  return (
    <table
      className="w-full text-center text-[10.5px] leading-[13.5px]"
      style={{
        fontFamily: 'var(--font-sans)',
        fontVariantNumeric: 'tabular-nums',
        borderCollapse: 'collapse',
      }}
    >
      <thead>
        <tr style={{ color: 'var(--color-text-tertiary)' }}>
          <th className="text-left font-medium pb-0.5 w-6">Kirj.</th>
          <th
            className="text-right font-semibold pb-0.5 w-8 pr-2"
            style={{ borderRight: '1px solid var(--color-border)' }}
          >
            Yht.
          </th>
          {activeLengths.map((len) => (
            <th
              key={len}
              className="font-medium pb-0.5 text-right px-0.5"
              style={{
                color: isRevealed
                  ? 'var(--color-text-tertiary)'
                  : 'color-mix(in srgb, var(--color-text-tertiary) 40%, transparent)',
              }}
            >
              {len}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {activeLetters.map((letter) => {
          const totalLeft = data.matrix.totalsByLetter[letter] ?? 0;
          return (
            <tr
              key={letter}
              style={{
                color: totalLeft === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
              }}
            >
              <td className="text-left font-bold py-[0.5px]">{letter.toUpperCase()}</td>
              <td
                className="text-right font-bold py-[0.5px] pr-2"
                style={{ borderRight: '1px solid var(--color-border)' }}
              >
                {totalLeft > 0 ? totalLeft : '✓'}
              </td>
              {activeLengths.map((len) => {
                const rem = data.matrix.cells[letter]?.[len]?.remaining ?? 0;
                return (
                  <td
                    key={len}
                    className="py-[0.5px] text-right px-0.5"
                    style={{
                      color: !isRevealed
                        ? 'color-mix(in srgb, var(--color-text-tertiary) 25%, transparent)'
                        : rem > 0
                          ? 'var(--color-text-primary)'
                          : 'color-mix(in srgb, var(--color-text-tertiary) 35%, transparent)',
                      fontWeight: isRevealed && rem > 0 ? 600 : 400,
                    }}
                  >
                    {isRevealed ? (rem > 0 ? rem : '·') : '·'}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
