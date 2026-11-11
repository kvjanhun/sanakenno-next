import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModalShell } from '../modals/ModalShell.js';
import { useAuthStore } from './useAuthStore.js';

export interface SyncModalProps {
  show: boolean;
  onClose: () => void;
}

type ViewMode = 'options' | 'email' | 'sent' | 'confirmUnlink' | 'confirmReset';

export function SyncModal({ show, onClose }: SyncModalProps): React.JSX.Element {
  const playerKey = useAuthStore((s) => s.playerKey);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const sessionCount = useAuthStore((s) => s.sessionCount);
  const [mode, setMode] = useState<ViewMode>('options');
  const [codeInput, setCodeInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [copiedTarget, setCopiedTarget] = useState<'code' | 'link' | null>(null);
  const [ticketData, setTicketData] = useState<{ ticket: string; code: string } | null>(null);
  const [isTicketLoading, setIsTicketLoading] = useState(false);

  const connectUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const codeOrTicket = ticketData?.ticket || playerKey;
    if (!codeOrTicket) return '';
    return `${window.location.origin}/?connect=${encodeURIComponent(codeOrTicket)}`;
  }, [ticketData, playerKey]);

  useEffect(() => {
    if (show) {
      void useAuthStore.getState().refreshSessionCount();
      setIsTicketLoading(true);
      void useAuthStore
        .getState()
        .requestTransferTicket()
        .then((res) => {
          setTicketData({ ticket: res.ticket, code: res.code });
        })
        .catch(() => {
          setTicketData(null);
        })
        .finally(() => {
          setIsTicketLoading(false);
        });
    } else {
      setMode('options');
      setCodeInput('');
      setEmailInput('');
      setCopiedTarget(null);
      setTicketData(null);
      useAuthStore.getState().clearError();
    }
  }, [show]);

  const copyText = useCallback(async (text: string, target: 'code' | 'link') => {
    if (!text || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 2000);
    } catch {
      useAuthStore.setState({ error: 'Kopiointi leikepöydälle epäonnistui' });
    }
  }, []);

  const handleUseCode = useCallback(async () => {
    const token = codeInput.trim();
    if (!token) return;
    await useAuthStore.getState().useTransfer(token);
    if (!useAuthStore.getState().error) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sanakenno:sync-reload'));
      }
      onClose();
    }
  }, [codeInput, onClose]);

  const handleUnlink = useCallback(
    async (clearLocalProgress: boolean) => {
      await useAuthStore.getState().logout({ clearLocalProgress });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sanakenno:sync-reload'));
      }
      onClose();
    },
    [onClose],
  );

  const handleSendEmail = useCallback(async () => {
    const email = emailInput.trim();
    if (!email || !email.includes('@')) {
      useAuthStore.setState({ error: 'Tarkista sähköpostiosoite' });
      return;
    }
    await useAuthStore.getState().sendTransferEmail(email);
    if (!useAuthStore.getState().error) {
      setMode('sent');
    }
  }, [emailInput]);

  return (
    <ModalShell
      show={show}
      title="Tallennus ja synkronointi"
      titleId="sync-modal-title"
      onClose={onClose}
    >
      {mode === 'options' && (
        <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <p className="m-0" style={{ color: 'var(--color-text-secondary)' }}>
            Pelitilanteesi tallentuu pilveen. Voit yhdistää toisen laitteen jakamalla koodin tai
            linkin.
          </p>

          {error && (
            <div
              className="p-3 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}

          <div
            className="p-3 rounded-lg space-y-2.5"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-wider block"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Tämän laitteen yhdistämiskoodi
            </span>
            <div className="flex gap-2 items-center">
              <div
                tabIndex={0}
                role="region"
                aria-label="Tämän laitteen yhdistämiskoodi"
                className="flex-1 min-w-0 h-10 px-3 rounded text-sm font-mono font-bold tracking-widest border overflow-x-auto whitespace-nowrap flex items-center justify-center select-all cursor-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-accent)',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--color-border) transparent',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {isTicketLoading ? (
                  <span className="text-xs font-normal opacity-60">Luodaan koodia...</span>
                ) : (
                  ticketData?.code || playerKey || '—'
                )}
              </div>
              <button
                type="button"
                onClick={() => copyText(ticketData?.code || playerKey || '', 'code')}
                disabled={isTicketLoading || (!ticketData && !playerKey)}
                aria-label={copiedTarget === 'code' ? 'Kopioitu!' : 'Kopioi koodi'}
                className="h-10 px-3 rounded text-xs font-medium cursor-pointer shrink-0 transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                }}
              >
                <span className="inline-grid [grid-template-areas:'stack'] items-center justify-center">
                  <span
                    aria-hidden="true"
                    className="invisible [grid-area:stack] select-none pointer-events-none"
                  >
                    Kopioitu!
                  </span>
                  <span className="[grid-area:stack]">
                    {copiedTarget === 'code' ? 'Kopioitu!' : 'Kopioi'}
                  </span>
                </span>
              </button>
            </div>
            <p className="text-[11px] m-0" style={{ color: 'var(--color-text-tertiary)' }}>
              Kertakäyttöinen koodi ja linkki ovat voimassa 15 minuuttia.
            </p>
            <div className="flex gap-2 pt-0.5">
              {connectUrl && (
                <button
                  type="button"
                  onClick={() => copyText(connectUrl, 'link')}
                  disabled={isTicketLoading}
                  className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-opacity disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <span className="inline-grid [grid-template-areas:'stack'] items-center justify-center">
                    <span
                      aria-hidden="true"
                      className="invisible [grid-area:stack] select-none pointer-events-none"
                    >
                      Linkki kopioitu!
                    </span>
                    <span className="[grid-area:stack]">
                      {copiedTarget === 'link' ? 'Linkki kopioitu!' : 'Kopioi linkki'}
                    </span>
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode('email')}
                className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Lähetä sähköpostitse
              </button>
            </div>
          </div>

          <div
            className="p-3 rounded-lg space-y-2"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-wider block"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Yhdistä toinen laite
            </span>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Syötä toisen laitteen 6-numeroinen koodi tai liitä yhdistämistunniste tähän:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Esim. 123-456"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded text-xs font-mono outline-none border"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
              <button
                type="button"
                onClick={handleUseCode}
                disabled={isLoading || !codeInput.trim()}
                className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
              >
                {isLoading ? 'Yhdistetään...' : 'Yhdistä'}
              </button>
            </div>
          </div>

          <div className="pt-2 flex justify-between items-center text-xs">
            {sessionCount > 1 ? (
              <button
                type="button"
                onClick={() => setMode('confirmUnlink')}
                className="underline cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Lopeta synkronointi
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setMode('confirmReset')}
              className="cursor-pointer font-medium"
              style={{ color: 'var(--color-error)' }}
            >
              Nollaa tämän laitteen pelitiedot
            </button>
          </div>
        </div>
      )}

      {mode === 'email' && (
        <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Lähetämme yhdistämislinkin sähköpostiisi. Voit avata sen toisella laitteella jatkaaksesi
            peliäsi.
          </p>
          {error && (
            <div
              className="p-3 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}
          <input
            type="email"
            placeholder="nimi@esimerkki.fi"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="w-full px-3 py-2 rounded text-sm outline-none border"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode('options')}
              className="px-3 py-1.5 rounded text-xs cursor-pointer"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              Takaisin
            </button>
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={isLoading || !emailInput.trim()}
              className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
            >
              {isLoading ? 'Lähetetään...' : 'Lähetä linkki'}
            </button>
          </div>
        </div>
      )}

      {mode === 'sent' && (
        <div
          className="space-y-4 text-sm text-center"
          style={{ color: 'var(--color-text-primary)' }}
        >
          <p className="font-medium">Linkki lähetetty osoitteeseen {emailInput}!</p>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Avaa linkki sillä laitteella tai selaimella, johon haluat siirtää sanapelisi.
          </p>
          <button
            type="button"
            onClick={() => setMode('options')}
            className="px-4 py-2 rounded text-xs font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
          >
            Valmis
          </button>
        </div>
      )}

      {mode === 'confirmUnlink' && (
        <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Haluatko lopettaa synkronoinnin?
          </p>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: '0.78rem',
              lineHeight: '1.4',
            }}
          >
            Pelitilanteesi ja tilastosi säilyvät tällä laitteella, mutta laitteet eivät enää päivity
            keskenään.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMode('options')}
              className="px-3 py-1.5 rounded text-xs cursor-pointer"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              Peruuta
            </button>
            <button
              type="button"
              onClick={() => handleUnlink(false)}
              disabled={isLoading}
              className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
              }}
            >
              {isLoading ? 'Lopetetaan...' : 'Lopeta synkronointi'}
            </button>
          </div>
        </div>
      )}

      {mode === 'confirmReset' && (
        <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <p className="font-semibold" style={{ color: 'var(--color-error)' }}>
            Haluatko varmasti nollata tämän laitteen pelitiedot?
          </p>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: '0.78rem',
              lineHeight: '1.4',
            }}
          >
            Kaikki tämän laitteen löydetyt sanat, pistetilanne ja tilastot tyhjennetään pysyvästi.
            Tätä toimintoa ei voi perua.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMode('options')}
              className="px-3 py-1.5 rounded text-xs cursor-pointer"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              Peruuta
            </button>
            <button
              type="button"
              onClick={() => handleUnlink(true)}
              disabled={isLoading}
              className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: 'var(--color-error)',
                color: 'var(--color-bg-primary)',
              }}
            >
              {isLoading ? 'Nollataan...' : 'Nollaa pelitiedot'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
