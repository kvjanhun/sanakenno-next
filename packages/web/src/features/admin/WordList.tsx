import { useMemo } from 'react';

interface WordListProps {
  words: string[];
  letters: string;
  loading: boolean;
  onBlock: (word: string) => void;
}

function isPangramWord(word: string, letters: string): boolean {
  const chars = Array.from(new Set(letters.toLowerCase().replace(/[^a-zåäö]/g, '')));
  return chars.length === 7 && chars.every((l) => word.includes(l));
}

export function WordList({ words, letters, loading, onBlock }: WordListProps): React.JSX.Element {
  const sorted = useMemo(() => [...words].sort(), [words]);
  const pangramCount = useMemo(
    () => sorted.filter((w) => isPangramWord(w, letters)).length,
    [sorted, letters],
  );

  if (loading) {
    return (
      <div className="text-sm py-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        Ladataan sanoja...
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className="text-sm py-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        Ei sanoja
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {words.length} sanaa, {pangramCount} pangrammia
      </div>
      <div
        className="grid gap-x-4 gap-y-1 text-xs"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        }}
      >
        {sorted.map((word) => {
          const pg = isPangramWord(word, letters);
          return (
            <div key={word} className="flex items-center gap-1.5 group py-0.5">
              <button
                type="button"
                onClick={() => onBlock(word)}
                className="inline-flex h-4 w-4 items-center justify-center rounded opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                style={{
                  color: 'var(--color-error)',
                  background: 'none',
                  border: 'none',
                }}
                title={`Estä "${word}"`}
                aria-label={`Estä ${word}`}
              >
                <svg
                  width={13}
                  height={13}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
              <span
                style={{
                  color: pg ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  fontWeight: pg ? 700 : 400,
                }}
              >
                {word}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
