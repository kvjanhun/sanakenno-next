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
  return (
    <div className="relative w-full h-full flex flex-col justify-start">
      <table
        className="w-full text-center text-[11.5px] leading-[15px]"
        style={{
          fontFamily: 'var(--font-sans)',
          fontVariantNumeric: 'tabular-nums',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr style={{ color: 'var(--color-text-secondary)' }}>
            <th className="text-left font-semibold pb-1 w-8 pl-1 text-[11px]">Kirj.</th>
            <th
              className="text-right font-semibold pb-1 w-10 pr-2.5 text-[11px]"
              style={{ borderRight: '1px solid var(--color-border)' }}
            >
              Yht.
            </th>
            {activeLengths.map((len) => (
              <th
                key={len}
                className="font-semibold pb-1 text-right px-0.5 text-[11px]"
                style={{
                  color: isRevealed ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
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
            const done = totalLeft === 0;
            return (
              <tr key={letter}>
                <td
                  className="text-left font-bold pl-1 py-[1px]"
                  style={{
                    color: done ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
                  }}
                >
                  {letter.toUpperCase()}
                </td>
                <td
                  className="text-right font-bold pr-2.5 py-[1px]"
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
                      className="text-right px-0.5 py-[1px]"
                      style={{
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
          style={{ left: '72px' }}
        >
          <div className="pointer-events-auto">
            <UpgradeButton onClick={onUpgrade} />
          </div>
        </div>
      )}
    </div>
  );
}
