import { UpgradeButton } from './HintParts.js';
import type { DerivedHintData } from './hints.js';

export interface HintMatrixTableProps {
  data: DerivedHintData;
  activeLengths: number[];
  activeLetters: string[];
  isRevealed: boolean;
  onUpgrade?: () => void;
}

const FAINT = 'color-mix(in srgb, var(--color-text-tertiary) 30%, transparent)';

/**
 * 2D Matrix Table rendering starting letters, totals column, and word lengths.
 * When isRevealed is false (level 1), length columns render faint dots.
 * When isRevealed is true (level 2), all counts count down dynamically.
 */
export function HintMatrixTable({
  data,
  activeLengths,
  activeLetters,
  isRevealed,
  onUpgrade,
}: HintMatrixTableProps): React.JSX.Element {
  // Adaptive column width: generous breathing room (up to 32px) for typical puzzles,
  // dynamically tightening down to 17px when up to 16 columns must fit within 332px mobile width.
  const colWidth = Math.max(17, Math.min(32, Math.floor(272 / Math.max(1, activeLengths.length))));

  return (
    <div className="relative w-full h-full flex flex-col items-start justify-start">
      <table
        className="w-max text-[11.5px] leading-[15px] table-fixed"
        style={{
          fontFamily: 'var(--font-sans)',
          fontVariantNumeric: 'tabular-nums',
          borderCollapse: 'collapse',
        }}
      >
        <colgroup>
          <col className="w-[28px] min-w-[28px] max-w-[28px]" />
          <col className="w-[32px] min-w-[32px] max-w-[32px]" />
          {activeLengths.map((len) => (
            <col
              key={len}
              style={{
                width: `${colWidth}px`,
                minWidth: `${colWidth}px`,
                maxWidth: `${colWidth}px`,
              }}
            />
          ))}
        </colgroup>
        <thead>
          <tr style={{ color: 'var(--color-text-secondary)' }}>
            <th className="text-left font-semibold pb-1 w-[28px] pl-1 text-[11px]">Kirj.</th>
            <th
              className="text-right font-semibold pb-1 w-[32px] pr-2 text-[11px]"
              style={{ borderRight: '1px solid var(--color-border)' }}
            >
              Yht.
            </th>
            {activeLengths.map((len) => {
              const lenDone = (data.matrix.totalsByLength[len] ?? 0) === 0;
              return (
                <th
                  key={len}
                  className="font-semibold pb-1 text-center text-[11px]"
                  style={{
                    width: `${colWidth}px`,
                    minWidth: `${colWidth}px`,
                    maxWidth: `${colWidth}px`,
                    color:
                      isRevealed && !lenDone ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {len}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {activeLetters.map((letter) => {
            const totalLeft = data.matrix.totalsByLetter[letter] ?? 0;
            const done = totalLeft === 0;
            return (
              <tr key={letter}>
                <td
                  className="text-left font-bold pl-1 py-[1px] w-[28px]"
                  style={{
                    color: done ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
                  }}
                >
                  {letter.toUpperCase()}
                </td>
                <td
                  className="text-right font-bold pr-2 py-[1px] w-[32px]"
                  style={{
                    borderRight: '1px solid var(--color-border)',
                    color: done ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                  }}
                >
                  {done ? '✓' : totalLeft}
                </td>
                {activeLengths.map((len) => {
                  const rem = data.matrix.cells[letter]?.[len]?.remaining ?? 0;
                  const show = isRevealed && rem > 0;
                  return (
                    <td
                      key={len}
                      className="text-center py-[1px]"
                      style={{
                        width: `${colWidth}px`,
                        minWidth: `${colWidth}px`,
                        maxWidth: `${colWidth}px`,
                        color: show ? 'var(--color-text-primary)' : FAINT,
                        fontWeight: show ? 600 : 400,
                      }}
                    >
                      {show ? rem : '·'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!isRevealed && onUpgrade && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center pointer-events-none"
          style={{ left: '60px' }}
        >
          <div className="pointer-events-auto">
            <UpgradeButton onClick={onUpgrade} />
          </div>
        </div>
      )}
    </div>
  );
}
