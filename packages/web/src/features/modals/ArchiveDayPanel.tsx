import type { ArchiveEntry } from '@sanakenno/shared';
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from '../gameplay/icons.js';
import { formatFinnishDate, getArchivePlayStatus } from './archiveStatus.js';

export interface ArchiveDayPanelProps {
  entry: ArchiveEntry;
  currentPuzzleNumber: number | null;
  confirmReveal: boolean;
  onPlay: (entry: ArchiveEntry) => void;
  onReveal: (entry: ArchiveEntry) => void;
  onConfirmReveal: (entry: ArchiveEntry) => void;
  onCancelConfirm: () => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  canPrevDay: boolean;
  canNextDay: boolean;
}

export function ArchiveDayPanel({
  entry,
  currentPuzzleNumber,
  confirmReveal,
  onPlay,
  onReveal,
  onConfirmReveal,
  onCancelConfirm,
  onPrevDay,
  onNextDay,
  canPrevDay,
  canNextDay,
}: ArchiveDayPanelProps): React.JSX.Element {
  const status = getArchivePlayStatus(entry.puzzle_number, entry.max_score);
  const isCurrent = entry.puzzle_number === currentPuzzleNumber;
  const outerLetters = entry.letters.filter((l) => l !== entry.center);

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Day Stepper & Header */}
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label="Edellinen kenno"
          title="Edellinen kenno"
          onClick={onPrevDay}
          disabled={!canPrevDay}
          className="h-8 w-8 rounded-lg flex items-center justify-center bg-transparent border-none cursor-pointer disabled:cursor-default disabled:opacity-30 transition-opacity"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <ChevronLeftIcon size={18} />
        </button>

        <div className="text-center min-w-0 px-1">
          <div
            className="text-sm font-bold truncate leading-tight"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Kenno #{entry.display_number}
            {entry.is_today && (
              <span
                className="ml-1.5 text-xs font-semibold"
                style={{ color: 'var(--color-accent)' }}
              >
                tänään
              </span>
            )}
            {isCurrent && !entry.is_today && (
              <span className="ml-1.5 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
                avoinna
              </span>
            )}
          </div>
          <div
            className="text-[11px] leading-tight mt-0.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {formatFinnishDate(entry.date)}
          </div>
        </div>

        <button
          type="button"
          aria-label="Seuraava kenno"
          title="Seuraava kenno"
          onClick={onNextDay}
          disabled={!canNextDay}
          className="h-8 w-8 rounded-lg flex items-center justify-center bg-transparent border-none cursor-pointer disabled:cursor-default disabled:opacity-30 transition-opacity"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      {/* 7-Letter Hex Preview */}
      <div className="flex items-center justify-center gap-1.5 font-[var(--font-mono)]">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shadow-xs"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-on-accent)',
          }}
          title={`Keskikirjain: ${entry.center.toUpperCase()}`}
        >
          {entry.center.toUpperCase()}
        </span>
        {outerLetters.map((l, i) => (
          <span
            key={i}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            {l.toUpperCase()}
          </span>
        ))}
      </div>

      {/* Status & Progress Summary */}
      <div
        className="rounded-lg p-2.5 flex flex-col gap-1.5"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
        }}
      >
        {status.played ? (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-sm" style={{ color: 'var(--color-accent)' }}>
                {status.rank}
              </span>
              <div className="flex items-center gap-1.5">
                {!status.hintsUsed && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      backgroundColor:
                        'color-mix(in srgb, var(--color-accent) 15%, var(--color-bg-primary))',
                      color: 'var(--color-accent)',
                    }}
                  >
                    Avuitta
                  </span>
                )}
                <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  {status.wordsFound} sanaa
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: 'var(--color-text-tertiary)' }}>Pisteet</span>
              <span
                className="font-semibold tabular-nums"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {status.score} / {status.maxScore} p ({status.percentage} %)
              </span>
            </div>

            <div
              className="w-full h-1.5 rounded-full overflow-hidden border border-solid"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${status.percentage}%`,
                  backgroundColor: 'var(--color-accent)',
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between text-xs py-1">
            <span style={{ color: 'var(--color-text-tertiary)' }}>Ei vielä pelattu</span>
            <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
              Enimmäispisteet: {entry.max_score} p
            </span>
          </div>
        )}

        {status.isRevealed && (
          <div
            className="flex items-center gap-1.5 text-xs pt-1 border-t"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-accent)',
            }}
          >
            <EyeIcon size={14} />
            <span>Vastaukset paljastettu</span>
          </div>
        )}
      </div>

      {/* Action Buttons & Inline Reveal Confirmation */}
      {confirmReveal ? (
        <div className="flex flex-col gap-2">
          <div
            className="rounded-lg p-2 text-xs text-center leading-normal"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            Vastauksien paljastamisen jälkeen tästä kennosta ei enää kerry tilastoja.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancelConfirm}
              className="w-1/2 py-2.5 rounded-lg font-medium text-sm cursor-pointer border"
              style={{
                backgroundColor: 'transparent',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              Takaisin
            </button>
            <button
              type="button"
              onClick={() => onConfirmReveal(entry)}
              className="w-1/2 py-2.5 rounded-lg font-semibold text-sm cursor-pointer border-none"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
              }}
            >
              Paljasta vastaukset
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onPlay(entry)}
            className="w-full py-2.5 rounded-lg font-semibold text-sm cursor-pointer border-none shadow-xs transition-opacity hover:opacity-95"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-on-accent)',
            }}
          >
            {isCurrent ? 'Jatka peliä' : 'Pelaa'}
          </button>

          {!entry.is_today && (
            <button
              type="button"
              onClick={() => onReveal(entry)}
              className="w-full py-2 rounded-lg font-medium text-xs cursor-pointer border transition-colors"
              style={{
                backgroundColor: 'transparent',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              Näytä vastaukset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
