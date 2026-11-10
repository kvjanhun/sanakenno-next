import { CheckIcon, CircleHelpIcon, SparklesIcon } from '../gameplay/icons.js';
import { ModalShell } from './ModalShell.js';

export interface RulesModalProps {
  show: boolean;
  onClose: () => void;
}

/**
 * Render a modal overlay presenting the Finnish game rules.
 */
export function RulesModal({ show, onClose }: RulesModalProps): React.JSX.Element {
  return (
    <ModalShell show={show} title="Pelin säännöt" titleId="rules-modal-title" onClose={onClose}>
      <div className="text-sm space-y-3.5" style={{ color: 'var(--color-text-secondary)' }}>
        <p className="m-b-10" style={{ color: 'var(--color-text-primary)' }}>
          Tavoitteenasi on löytää mahdollisimman monta sanaa seitsemästä annetusta kirjaimesta.
        </p>

        <div
          className="rounded-xl p-3 space-y-2"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <div
            className="font-semibold text-xs uppercase tracking-wider mb-1"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Säännöt
          </div>
          <ul className="space-y-1.5 pl-0 m-0 list-none">
            <li className="flex items-start gap-2 text-xs">
              <span className="h-4 flex items-center shrink-0">
                <CheckIcon size={14} style={{ color: 'var(--color-accent)' }} />
              </span>
              <span>
                Sanan täytyy sisältää{' '}
                <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                  keskimmäinen kirjain.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-2 text-xs">
              <span className="h-4 flex items-center shrink-0">
                <CheckIcon size={14} style={{ color: 'var(--color-accent)' }} />
              </span>
              <span>Sanan pituus on vähintään 4 kirjainta.</span>
            </li>
            <li className="flex items-start gap-2 text-xs">
              <span className="h-4 flex items-center shrink-0">
                <CheckIcon size={14} style={{ color: 'var(--color-accent)' }} />
              </span>
              <span>Samaa kirjainta voi käyttää useasti.</span>
            </li>
            <li className="flex items-start gap-2 text-xs">
              <span className="h-4 flex items-center shrink-0">
                <CheckIcon size={14} style={{ color: 'var(--color-accent)' }} />
              </span>
              <span>
                Sanan täytyy löytyä Kotuksen sanalistasta (
                <a
                  href="https://kotus.fi/sanakirjat/kielitoimiston-sanakirja/nykysuomen-sana-aineistot/nykysuomen-sanalista"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--color-accent)',
                    textDecoration: 'underline',
                  }}
                >
                  Kotus
                </a>
                ).
              </span>
            </li>
          </ul>
        </div>

        <div
          className="rounded-xl p-3 space-y-2"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <div
            className="font-semibold text-xs uppercase tracking-wider mb-1"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Pisteytys
          </div>
          <ul className="space-y-1.5 pl-0 m-0 list-none">
            <li className="flex items-start gap-2 text-xs">
              <span className="h-4 flex items-center shrink-0">
                <SparklesIcon size={14} style={{ color: 'var(--color-accent)' }} />
              </span>
              <span>4-kirjaiminen sana: 1 piste</span>
            </li>
            <li className="flex items-start gap-2 text-xs">
              <span className="h-4 flex items-center shrink-0">
                <SparklesIcon size={14} style={{ color: 'var(--color-accent)' }} />
              </span>
              <span>Pidempi sana: 1 piste jokaisesta kirjaimesta</span>
            </li>
            <li className="flex items-start gap-2 text-xs">
              <span className="h-4 flex items-center shrink-0">
                <SparklesIcon size={14} style={{ color: 'var(--color-accent)' }} />
              </span>
              <span>Pangrammi (sisältää kaikki 7 kirjainta): +7 lisäpistettä</span>
            </li>
          </ul>
        </div>

        <div
          className="rounded-xl p-3 space-y-2"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <div
            className="font-semibold text-xs uppercase tracking-wider mb-1"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Avut
          </div>
          <ul className="space-y-1.5 pl-0 m-0 list-none">
            <li className="flex items-start gap-2 text-xs">
              <span className="h-4 flex items-center shrink-0">
                <CircleHelpIcon size={14} style={{ color: 'var(--color-accent)' }} />
              </span>
              <span>
                <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Matriisi:
                </span>{' '}
                sanojen määrä alkukirjaimittain ja pituudet alkukirjaimittain.
              </span>
            </li>
            <li className="flex items-start gap-2 text-xs">
              <span className="h-4 flex items-center shrink-0">
                <CircleHelpIcon size={14} style={{ color: 'var(--color-accent)' }} />
              </span>
              <span>
                <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Vihjeet:
                </span>{' '}
                erikseen avattavat osiot pangrammeille (alkukirjaimet ja pituudet), alkupareille (7
                yleisintä jäljellä olevaa alkuparia) sekä sananpäätteille (7 yleisintä jäljellä
                olevaa päätettä).
              </span>
            </li>
          </ul>
        </div>

        <div
          className="rounded-xl p-3 space-y-2"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <div
            className="font-semibold text-xs uppercase tracking-wider mb-1"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Yhdyssanat
          </div>
          <p className="text-xs m-0 leading-relaxed">
            Sanalista sisältää myös yhdyssanoja. Yhdysviivallisen sanan voi kirjoittaa joko viivalla
            tai ilman. Esimerkiksi{' '}
            <span
              className="font-mono bg-[var(--color-bg-primary)] px-1 py-0.5 rounded border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              palo-ovi
            </span>{' '}
            tai{' '}
            <span
              className="font-mono bg-[var(--color-bg-primary)] px-1 py-0.5 rounded border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              paloovi
            </span>{' '}
            ovat molemmat hyväksyttäviä.
          </p>
        </div>
      </div>
    </ModalShell>
  );
}
