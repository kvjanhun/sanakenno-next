import { useMemo } from 'react';
import type { ArchiveEntry } from '@sanakenno/shared';
import { ChevronLeftIcon, ChevronRightIcon } from '../gameplay/icons.js';
import {
  formatFinnishMonth,
  getArchivePlayStatus,
  type ArchivePlayStatus,
} from './archiveStatus.js';

const WEEKDAYS = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

export interface YearMonth {
  year: number;
  monthIndex: number;
}

export interface ArchiveCalendarProps {
  entries: ArchiveEntry[];
  selectedEntry: ArchiveEntry | null;
  currentPuzzleNumber: number | null;
  onSelectEntry: (entry: ArchiveEntry) => void;
  yearMonth: YearMonth;
  onYearMonthChange: (ym: YearMonth) => void;
  onJumpToToday: () => void;
  availableYearMonths: string[];
  todayYearMonthKey: string;
}

export function ArchiveCalendar({
  entries,
  selectedEntry,
  currentPuzzleNumber,
  onSelectEntry,
  yearMonth,
  onYearMonthChange,
  onJumpToToday,
  availableYearMonths,
  todayYearMonthKey,
}: ArchiveCalendarProps): React.JSX.Element {
  const currentKey = `${yearMonth.year}-${String(yearMonth.monthIndex + 1).padStart(2, '0')}`;
  const currentIndex = availableYearMonths.indexOf(currentKey);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex !== -1 && currentIndex < availableYearMonths.length - 1;

  const entryByDate = useMemo(() => {
    const map = new Map<string, ArchiveEntry>();
    for (const e of entries) {
      map.set(e.date, e);
    }
    return map;
  }, [entries]);

  const { daysInMonth, leadingEmptyCount, trailingEmptyCount } = useMemo(() => {
    const count = new Date(yearMonth.year, yearMonth.monthIndex + 1, 0).getDate();
    const firstDay = new Date(yearMonth.year, yearMonth.monthIndex, 1).getDay();
    const mondayFirst = (firstDay + 6) % 7;
    const trailing = Math.max(0, 42 - mondayFirst - count);
    return {
      daysInMonth: count,
      leadingEmptyCount: mondayFirst,
      trailingEmptyCount: trailing,
    };
  }, [yearMonth]);

  const handlePrev = () => {
    if (!canGoPrev) return;
    const prevKey = availableYearMonths[currentIndex - 1];
    if (!prevKey) return;
    const [y, m] = prevKey.split('-').map(Number);
    if (y && m) onYearMonthChange({ year: y, monthIndex: m - 1 });
  };

  const handleNext = () => {
    if (!canGoNext) return;
    const nextKey = availableYearMonths[currentIndex + 1];
    if (!nextKey) return;
    const [y, m] = nextKey.split('-').map(Number);
    if (y && m) onYearMonthChange({ year: y, monthIndex: m - 1 });
  };

  const isViewingTodayMonth = currentKey === todayYearMonthKey;
  const showJumpToToday =
    !isViewingTodayMonth || (selectedEntry !== null && !selectedEntry.is_today);

  return (
    <div className="w-full max-w-[272px] mx-auto flex flex-col gap-1">
      {/* Slim Month Header */}
      <div className="h-7 flex items-center justify-between">
        <button
          type="button"
          aria-label="Edellinen kuukausi"
          onClick={handlePrev}
          disabled={!canGoPrev}
          className="h-7 w-7 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer disabled:cursor-default disabled:opacity-25"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <ChevronLeftIcon size={16} />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {formatFinnishMonth(yearMonth.year, yearMonth.monthIndex)}
          </span>
          {showJumpToToday && (
            <button
              type="button"
              onClick={onJumpToToday}
              className="text-[11px] px-2.5 py-0.5 rounded-full border cursor-pointer font-semibold transition-opacity hover:opacity-90"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--color-accent) 15%, var(--color-bg-secondary))',
                borderColor: 'color-mix(in srgb, var(--color-accent) 45%, var(--color-border))',
                color: 'var(--color-accent)',
              }}
            >
              Tänään
            </button>
          )}
        </div>

        <button
          type="button"
          aria-label="Seuraava kuukausi"
          onClick={handleNext}
          disabled={!canGoNext}
          className="h-7 w-7 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer disabled:cursor-default disabled:opacity-25"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>

      {/* Weekdays Row */}
      <div className="grid grid-cols-7 gap-1 text-center" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-[10px] font-medium py-0.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Square Days Grid */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Arkiston kalenteripäivät">
        {Array.from({ length: leadingEmptyCount }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" aria-hidden="true" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const dateStr = `${yearMonth.year}-${String(yearMonth.monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const entry = entryByDate.get(dateStr);

          if (!entry) {
            return (
              <div
                key={dateStr}
                className="aspect-square flex flex-col items-center justify-center text-xs opacity-25 rounded-lg"
                style={{ color: 'var(--color-text-tertiary)' }}
                aria-hidden="true"
              >
                <span className="leading-none tabular-nums">{d}</span>
                <span className="h-2 mt-0.5" />
              </div>
            );
          }

          const status: ArchivePlayStatus = getArchivePlayStatus(
            entry.puzzle_number,
            entry.max_score,
          );
          const isSelected = selectedEntry?.date === entry.date;
          const isCurrent = entry.puzzle_number === currentPuzzleNumber;

          return (
            <button
              key={dateStr}
              type="button"
              data-testid={`archive-entry-${entry.display_number}`}
              data-date={dateStr}
              aria-pressed={isSelected}
              aria-label={`${d}. ${formatFinnishMonth(yearMonth.year, yearMonth.monthIndex)}, Kenno #${entry.display_number}${entry.is_today ? ', tänään' : ''}${status.played ? `, ${status.rank}, ${status.wordsFound} sanaa` : ', ei pelattu'}`}
              onClick={() => onSelectEntry(entry)}
              className="aspect-square rounded-lg flex flex-col items-center justify-center relative cursor-pointer border-none transition-colors"
              style={{
                backgroundColor: isSelected
                  ? 'color-mix(in srgb, var(--color-accent) 16%, var(--color-bg-secondary))'
                  : 'var(--color-bg-secondary)',
                boxShadow: isSelected
                  ? 'inset 0 0 0 1.5px var(--color-accent)'
                  : entry.is_today
                    ? 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 60%, transparent)'
                    : isCurrent
                      ? 'inset 0 0 0 1px var(--color-border)'
                      : undefined,
              }}
            >
              <span
                className="text-xs leading-none tabular-nums"
                style={{
                  fontWeight: isSelected || entry.is_today ? 700 : 500,
                  color: entry.is_today ? 'var(--color-accent)' : 'var(--color-text-primary)',
                }}
              >
                {d}
              </span>

              <span className="h-2 flex items-center justify-center mt-0.5">
                {status.played && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: status.isFullBoard
                        ? 'var(--color-accent)'
                        : 'var(--color-text-tertiary)',
                    }}
                    title={status.rank ?? undefined}
                  />
                )}
              </span>
            </button>
          );
        })}

        {Array.from({ length: trailingEmptyCount }).map((_, i) => (
          <div key={`trailing-empty-${i}`} className="aspect-square" aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}
