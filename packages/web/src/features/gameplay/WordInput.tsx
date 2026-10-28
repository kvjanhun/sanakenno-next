import { colorizeWord } from '@sanakenno/shared';

export interface WordInputProps {
  currentWord: string;
  center: string;
  allLetters: Set<string>;
  shake: boolean;
  allFound: boolean;
  wordCount?: number;
}

const COLOR_MAP: Record<string, string> = {
  accent: 'var(--color-accent)',
  primary: 'var(--color-text-primary)',
  tertiary: 'var(--color-text-tertiary)',
};

export function WordInput({
  currentWord,
  center,
  allLetters,
  shake,
  allFound,
  wordCount,
}: WordInputProps): React.JSX.Element {
  if (allFound) {
    return (
      <div
        className="text-center text-lg font-semibold"
        style={{ color: 'var(--color-accent)' }}
        aria-live="polite"
        aria-atomic="true"
        data-testid="word-input"
      >
        Kaikki {wordCount} sanaa löydetty!
      </div>
    );
  }

  const chars = currentWord ? colorizeWord(currentWord, center, allLetters) : null;

  return (
    <div
      className={`text-center text-[30px] font-semibold leading-none${shake ? ' word-shake' : ''}`}
      style={{
        fontFamily: 'var(--font-game)',
        fontKerning: 'normal',
        letterSpacing: '0',
        minHeight: '44px',
      }}
      aria-live="polite"
      aria-atomic="true"
      data-testid="word-input"
    >
      {chars ? (
        chars.map((c, i) => (
          <span
            key={i}
            style={{
              color: COLOR_MAP[c.color],
              marginInline: '1px',
            }}
          >
            {c.char.toUpperCase()}
          </span>
        ))
      ) : (
        <span className="idle-character" style={{ color: 'var(--color-text-tertiary)' }}>
          |
        </span>
      )}
    </div>
  );
}
