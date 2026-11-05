import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModalShell } from '../modals/ModalShell.js';
import { useAuthStore } from './useAuthStore.js';

export interface SyncModalProps {
  show: boolean;
  onClose: () => void;
}

type ViewMode = 'options' | 'email' | 'sent' | 'confirmRotate' | 'confirmUnlink';

export function SyncModal({ show, onClose }: SyncModalProps): React.JSX.Element {
  const playerKey = useAuthStore((s) => s.playerKey);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const [mode, setMode] = useState<ViewMode>('options');
  const [codeInput, setCodeInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [copiedTarget, setCopiedTarget] = useState<'code' | 'link' | null>(null);

  const connectUrl = useMemo(() => {
    if (!playerKey || typeof window === 'undefined') return '';
    return `${window.location.origin}/?connect=${encodeURIComponent(playerKey)}`;
  }, [playerKey]);

  useEffect(() => {
    if (!show) {
      setMode('options');
      setCodeInput('');
      setEmailInput('');
      setCopiedTarget(null);
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

  const handleConfirmRotate = useCallback(async () => {
    await useAuthStore.getState().rotatePlayerKey();
    if (!useAuthStore.getState().error) {
      setMode('options');
    }
  }, []);

  return (
    <ModalShell
      show={show}
      title="Tallennus ja synkronointi"
      titleId="sync-modal-title"
      onClose={onClose}
      headerClassName="mb-4"
    >
      {mode === 'options' && (
        <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Sanakenno tallentaa edistymisesi tälle laitteelle. Voit yhdistää toisen laitteen
            jakamalla koodin tai linkin.
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

          {playerKey && (
            <div
              className="p-3 rounded-lg space-y-2"
              style={{ backgroundColor: 'var(--color-bg-secondary)' }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-wider block"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Tämän laitteen yhdistämiskoodi
              </span>
              <div
                className="font-mono text-xs break-all select-all select-text p-2 rounded"
                style={{ backgroundColor: 'var(--color-bg-primary)' }}
              >
                {playerKey}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => copyText(playerKey, 'code')}
                  className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-opacity"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-bg-primary)',
                  }}
                >
                  <span className="inline-grid [grid-template-areas:'stack'] items-center justify-center">
                    <span
                      aria-hidden="true"
                      className="invisible [grid-area:stack] select-none pointer-events-none"
                    >
                      Kopioi koodi
                    </span>
                    <span className="[grid-area:stack]">
                      {copiedTarget === 'code' ? 'Kopioitu!' : 'Kopioi koodi'}
                    </span>
                  </span>
                </button>
                {connectUrl && (
                  <button
                    type="button"
                    onClick={() => copyText(connectUrl, 'link')}
                    className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-opacity"
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
          )}

          <div
            className="p-3 rounded-lg space-y-2"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-wider block"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Yhdistä toiseen laitteeseen
            </span>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Syötä toisen laitteen yhdistämiskoodi siirtääksesi edistymisesi tähän laitteeseen:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Liitä yhdistämiskoodi tähän"
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
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
              >
                {isLoading ? 'Yhdistetään...' : 'Yhdistä'}
              </button>
            </div>
          </div>

          <div className="pt-2 flex justify-between items-center text-xs">
            <button
              type="button"
              onClick={() => setMode('confirmRotate')}
              className="underline cursor-pointer"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Katkaise muut laitteet ja vaihda koodi
            </button>
            <button
              type="button"
              onClick={() => setMode('confirmUnlink')}
              className="cursor-pointer font-medium"
              style={{ color: 'var(--color-error)' }}
            >
              Irrota tämä laite tilistä
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

      {mode === 'confirmRotate' && (
        <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Haluatko varmasti vaihtaa koodin?
          </p>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Uusi koodi mitätöi aiemmat toisilla laitteilla aktiiviset istunnot. Tämän laitteen
            edistyminen säilyy.
          </p>
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
              Peruuta
            </button>
            <button
              type="button"
              onClick={handleConfirmRotate}
              disabled={isLoading}
              className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: 'var(--color-error)',
                color: 'var(--color-bg-primary)',
              }}
            >
              {isLoading ? 'Vaihdetaan...' : 'Vaihda koodi'}
            </button>
          </div>
        </div>
      )}

      {mode === 'confirmUnlink' && (
        <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Haluatko varmasti irrottaa tämän laitteen tilistä?
          </p>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: '0.78rem',
              lineHeight: '1.4',
            }}
          >
            Tämä laite ei enää synkronoidu muiden laitteidesi kanssa. Muut laitteet jatkavat
            ennallaan vanhalla tilillä.
          </p>
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => handleUnlink(false)}
              disabled={isLoading}
              className="w-full p-2.5 rounded-lg border font-semibold text-xs cursor-pointer text-left transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              <div className="font-semibold text-xs mb-0.5">
                Säilytä edistyminen uudella tilillä
              </div>
              <div
                className="text-[11px] font-normal"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Pelitilanne ja tilastot säilyvät tällä laitteella, mutta uusi peli ei enää siirry
                muille laitteille.
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleUnlink(true)}
              disabled={isLoading}
              className="w-full p-2.5 rounded-lg border font-semibold text-xs cursor-pointer text-left transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-error)',
              }}
            >
              <div className="font-semibold text-xs mb-0.5">Tyhjennä laite ja aloita alusta</div>
              <div
                className="text-[11px] font-normal"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Kaikki tämän laitteen paikalliset tiedot tyhjennetään ja laite aloittaa puhtaalta
                pöydältä.
              </div>
            </button>
          </div>
          <div className="flex justify-end pt-1">
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
          </div>
        </div>
      )}
    </ModalShell>
  );
}
