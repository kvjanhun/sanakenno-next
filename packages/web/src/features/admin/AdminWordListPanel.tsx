import { WordList } from './WordList.js';

interface AdminWordListPanelProps {
  words: string[];
  letters: string;
  loading: boolean;
  onBlock: (word: string) => void;
}

export function AdminWordListPanel({
  words,
  letters,
  loading,
  onBlock,
}: AdminWordListPanelProps): React.JSX.Element {
  return (
    <section
      className="rounded-2xl border shadow-sm flex flex-col h-full overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div
        className="flex items-center gap-3 p-4 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-400">
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Sanalista
          </h3>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Pelin kaikki sallitut sanat. Vie hiiri sanan päälle ja poista sana estääksesi sen.
          </p>
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto max-h-96 lg:max-h-[600px]">
        <WordList words={words} letters={letters} loading={loading} onBlock={onBlock} />
      </div>
    </section>
  );
}
