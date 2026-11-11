import { useState } from 'react';
import { ChevronDownIcon } from '../gameplay/icons.js';

/**
 * Collapsible privacy and data management disclosure for SettingsModal.
 * Informs users about GDPR data controller info, transit logging in Resend,
 * localStorage usage, and erasure rights.
 */
export function PrivacySection(): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-2.5 rounded-lg border-none cursor-pointer text-left transition-colors"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
        }}
        aria-expanded={open}
      >
        <div className="space-y-0.5">
          <div
            className="text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Tietosuoja ja evästeet
          </div>
          <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            Mitä tietoja tallennetaan ja miten niitä käsitellään
          </div>
        </div>
        <ChevronDownIcon
          size={14}
          strokeWidth={2.5}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
            color: 'var(--color-text-secondary)',
          }}
        />
      </button>

      {open && (
        <div
          className="p-3 rounded-lg space-y-3 text-[11px] leading-relaxed border"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <div>
            <h4
              className="font-semibold m-0 text-[11.5px]"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Rekisterinpitäjä ja tarkoitus
            </h4>
            <p className="m-0 mt-0.5">
              Sanakenno on voittoa tavoittelematon avoimen lähdekoodin sanapeli. Tietoja käsitellään
              ainoastaan pelitilanteen tallentamiseen ja synkronoimiseen laitteidesi välillä.
            </p>
          </div>

          <div>
            <h4
              className="font-semibold m-0 text-[11.5px]"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Sähköpostit ja Resend-palvelu
            </h4>
            <p className="m-0 mt-0.5">
              Jos pyydät yhdistämislinkin sähköpostiisi, osoite välitetään Resend-sähköpostipalvelun
              kautta. Sähköpostiosoitteita ei tallenneta Sanakennon tietokantaan. Resend säilyttää
              viestin sisällön ja tekniset lähetyslokit enintään 30 päivää toimituksen varmistusta
              ja vikatilanteiden selvitystä varten, minkä jälkeen tiedot poistetaan automaattisesti.{' '}
              <a
                href="https://resend.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
                style={{ color: 'var(--color-accent)' }}
              >
                Resendin tietosuojaseloste
              </a>
              .
            </p>
          </div>

          <div>
            <h4
              className="font-semibold m-0 text-[11.5px]"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Selaimen paikallinen muisti (localStorage)
            </h4>
            <p className="m-0 mt-0.5">
              Pelin edistyminen, sanalöydöt, tilastot ja ulkoasuasetukset tallennetaan selaimesi
              paikalliseen muistiin (localStorage). Sivusto ei käytä markkinointi- tai
              seurantaevästeitä.
            </p>
          </div>

          <div>
            <h4
              className="font-semibold m-0 text-[11.5px]"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Tietojen poisto ja omat oikeutesi
            </h4>
            <p className="m-0 mt-0.5">
              Voit milloin tahansa poistaa kaikki paikalliset tietosi käyttämällä
              synkronointivalikon toimintoa &quot;Nollaa tämän laitteen pelitiedot&quot; tai
              tyhjentämällä selaimesi sivustokohtaiset tiedot.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
