import type { ArchiveEntry } from '@sanakenno/shared';
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from '../gameplay/icons.js';
import { formatFinnishDate, getArchivePlayStatus } from './archiveStatus.js';

export interface ArchiveDayPanelProps {
  entry: ArchiveEntry;
  currentPuzzleNumber: number | null;
  onPlay: (entry: ArchiveEntry) => void;
  onReveal: (entry: ArchiveEntry) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  canPrevDay: boolean;
  canNextDay: boolean;
}

export function ArchiveDayPanel({
  entry,
  currentPuzzleNumber,
  onPlay,
  onReveal,
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
      className="rounded-lg p-2.5 flex flex-col gap-2.5"
      style={{ backgroundColor: 'var(--color-bg-secondary)' }}
    >
      {/* Slim Info Header Row */}
      <div className="h-9 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Edellinen kenno"
          title="Edellinen kenno"
          onClick={onPrevDay}
          disabled={!canPrevDay}
          className="h-7 w-7 -ml-1 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer disabled:cursor-default disabled:opacity-25 shrink-0"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <ChevronLeftIcon size={16} />
        </button>

        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div
              className="h-5 text-sm font-semibold leading-none truncate flex items-center gap-1.5"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <span>{formatFinnishDate(entry.date)}</span>
              {entry.is_today && (
                <span
                  className="text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor:
                      'color-mix(in srgb, var(--color-accent) 16%, var(--color-bg-primary))',
                    color: 'var(--color-accent)',
                  }}
                >
                  tänään
                </span>
              )}
            </div>
            <div
              className="h-4 text-xs leading-none flex items-center"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Kenno #{entry.display_number}
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-1.5 text-xs">
            {status.isRevealed && (
              <span
                aria-label="Vastaukset paljastettu"
                title="Vastaukset paljastettu"
                style={{ color: 'var(--color-accent)' }}
              >
                <EyeIcon />
              </span>
            )}
            {status.played ? (
              <span
                className="min-w-0 text-right leading-tight"
                title={`${status.wordsFound} sanaa, ${status.rank}`}
                aria-label={`${status.rank}, ${status.wordsFound} sanaa`}
              >
                <span
                  className="block truncate font-semibold"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {status.rank}
                </span>
                <span className="block" style={{ color: 'var(--color-text-tertiary)' }}>
                  {status.wordsFound} sanaa
                </span>
              </span>
            ) : (
              <span className="text-right" style={{ color: 'var(--color-text-tertiary)' }}>
                Ei pelattu
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-label="Seuraava kenno"
          title="Seuraava kenno"
          onClick={onNextDay}
          disabled={!canNextDay}
          className="h-7 w-7 -mr-1 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer disabled:cursor-default disabled:opacity-25 shrink-0"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>

      {/* Separate 7-Letter Tiles */}
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

      {/* Slim Action Buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPlay(entry)}
          className="flex-1 h-8 rounded-lg font-semibold text-xs flex items-center justify-center cursor-pointer border-none transition-opacity hover:opacity-90"
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
            className="flex-1 h-8 rounded-lg font-medium text-xs flex items-center justify-center cursor-pointer border transition-colors"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            Näytä vastaukset
          </button>
        )}
      </div>
    </div>
  );
}
