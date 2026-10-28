import { useEffect } from 'react';

export type CelebrationOverlayType = 'allistyttava' | 'nohint-allistyttava' | 'taysikenno';

export interface CelebrationProps {
  show: boolean;
  type: CelebrationOverlayType | null;
  score: number;
  maxScore: number;
  onClose: () => void;
  onShare: () => void;
}

interface CelebrationConfig {
  title: string;
  description: string;
  target: number;
  closeLabel: string;
  cardClass: string;
}

export function Celebration({
  show,
  type,
  score,
  maxScore,
  onClose,
  onShare,
}: CelebrationProps): React.JSX.Element | null {
  const autoCloseMs = type === 'taysikenno' ? 8000 : 5000;

  useEffect(() => {
    if (!show || !type) return;
    const timer = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(timer);
  }, [type, onClose, autoCloseMs, show]);

  if (!show || !type) return null;

  const config: CelebrationConfig =
    type === 'taysikenno'
      ? {
          title: 'Täysi kenno!',
          description: 'Täydellinen tulos! Löysit kaikki sanat.',
          target: maxScore,
          closeLabel: 'OK',
          cardClass: 'celebration-card-intense',
        }
      : type === 'nohint-allistyttava'
        ? {
            title: 'Ällistyttävä ilman apuja!',
            description: 'Saavutit 70 % kennon pisteistä avaamatta apuja.',
            target: maxScore,
            closeLabel: 'Jatka pelaamista',
            cardClass: 'celebration-card',
          }
        : {
            title: 'Ällistyttävä!',
            description: 'Huikea suoritus! Olet saavuttanut huipputason.',
            target: maxScore,
            closeLabel: 'Jatka pelaamista',
            cardClass: 'celebration-card',
          };

  const handleShare = (): void => {
    onShare();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'rgb(0 0 0 / 0.5)',
      }}
      onClick={onClose}
    >
      <div
        className={`rounded-xl p-8 max-w-sm w-full mx-4 shadow-lg text-center ${config.cardClass}`}
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          color: 'var(--color-text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={config.title}
      >
        <h2 className="text-2xl font-bold mb-2">{config.title}</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          {config.description}
        </p>
        <p className="text-lg font-semibold mb-6">
          {score}/{config.target} pistettä
        </p>

        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={handleShare}
            className="px-4 py-2 rounded-lg font-semibold cursor-pointer border-none"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-on-accent)',
            }}
          >
            Jaa tulos
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {config.closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
