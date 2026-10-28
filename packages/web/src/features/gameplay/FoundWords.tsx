import { useEffect, useMemo, useRef } from 'react';
import { buildKotusUrl, isPangram, toColumns } from '@sanakenno/shared';
import { ChevronDownIcon } from './icons.js';

export interface FoundWordsProps {
  foundWords: string[];
  recentWords: string[];
  showAll: boolean;
  allLetters: Set<string>;
  onToggleShowAll: () => void;
  lastResubmittedWord: string | null;
}

export function FoundWords({
  foundWords,
  recentWords,
  showAll,
  allLetters,
  onToggleShowAll,
  lastResubmittedWord,
}: FoundWordsProps): React.JSX.Element | null {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const sorted = useMemo(
    () => [...foundWords].sort((a, b) => a.localeCompare(b, 'fi')),
    [foundWords],
  );

  const columns = useMemo(() => toColumns(sorted), [sorted]);

  const count = recentWords.length;
  const latestWord = recentWords[0];

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
    }
  }, [count, latestWord]);

  if (foundWords.length === 0) return null;

  const countText = foundWords.length === 1 ? 'löydetty sana' : 'löydettyä sanaa';
  const showToggle = foundWords.length >= 1;
  const collapsed = recentWords;

  return (
    <section className="w-full" data-testid="found-words">
      <div className="flex items-center justify-between mb-2">
        <div
          className={`flex items-center gap-1.5 text-sm font-medium ${showAll ? '' : 'pl-2'}`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <span data-testid="found-words-count" style={{ color: 'var(--color-accent)' }}>
            {foundWords.length}
          </span>
          <span>{countText}</span>
        </div>
        {showToggle && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="flex items-center gap-1 text-sm font-medium cursor-pointer bg-transparent border-none p-0 transition-colors"
            style={{ color: 'var(--color-accent)' }}
          >
            <span>{showAll ? 'Vähemmän' : 'Kaikki'}</span>
            <span
              aria-hidden="true"
              className="inline-flex h-3.5 w-3.5 items-center justify-center transition-transform duration-150"
              style={{
                transform: showAll ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <ChevronDownIcon size={14} strokeWidth={2.5} />
            </span>
          </button>
        )}
      </div>

      {showAll ? (
        <div className="flex gap-6 flex-wrap">
          {columns.map((col, ci) => (
            <ul key={ci} className="list-none p-0 m-0">
              {col.map((word) => (
                <li
                  key={word}
                  className="font-[var(--font-mono)] text-sm transition-colors duration-300"
                  style={{
                    color:
                      word === lastResubmittedWord
                        ? 'var(--color-accent)'
                        : 'var(--color-text-primary)',
                    fontWeight: isPangram(word, allLetters) ? 700 : 400,
                  }}
                >
                  <a
                    href={buildKotusUrl(word)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Avaa sanan "${word}" määritelmä Kotuksessa`}
                    aria-label={`Avaa sanan "${word}" määritelmä Kotuksessa`}
                    style={{
                      color: 'inherit',
                      textDecoration: 'none',
                    }}
                  >
                    {word}
                  </a>
                </li>
              ))}
            </ul>
          ))}
        </div>
      ) : (
        <div ref={scrollContainerRef} className="w-full overflow-x-auto scrollbar-none">
          <div className="flex gap-1.5" style={{ flexWrap: 'nowrap', width: 'max-content' }}>
            {collapsed.map((word) => (
              <a
                key={word}
                className="font-[var(--font-mono)] text-sm px-2 py-0.5 rounded-full transition-colors duration-300 animate-pill-slide-in"
                href={buildKotusUrl(word)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Avaa sanan "${word}" määritelmä Kotuksessa`}
                aria-label={`Avaa sanan "${word}" määritelmä Kotuksessa`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flexShrink: 0,
                  backgroundColor:
                    word === lastResubmittedWord
                      ? 'var(--color-accent)'
                      : 'var(--color-bg-secondary)',
                  color:
                    word === lastResubmittedWord
                      ? 'var(--color-on-accent)'
                      : 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  fontWeight: isPangram(word, allLetters) ? 700 : 400,
                  textDecoration: 'none',
                }}
              >
                {word}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
