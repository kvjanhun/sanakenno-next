import { useCallback, useState } from 'react';
import { toColumns } from '@sanakenno/shared';
import { useHintData, type DerivedHintData } from './hints.js';
import { CheckIcon, LockIcon } from './icons.js';

export interface HintPanelsProps {
  hintsUnlocked: Set<string>;
  onUnlock: (id: string) => void;
  hintData?: DerivedHintData | null;
}

type VisiblePanelId = 'summary' | 'distribution' | 'pairs';

interface PanelConfig {
  id: VisiblePanelId;
  label: string;
  teaser: string;
}

const VISIBLE_PANELS: readonly PanelConfig[] = [
  {
    id: 'summary',
    label: 'Yleiskuva',
    teaser: 'Yhteenveto jäljellä olevista sanoista.',
  },
  {
    id: 'distribution',
    label: 'Pituudet',
    teaser: 'Jäljellä olevien sanojen pituudet.',
  },
  {
    id: 'pairs',
    label: 'Alkuparit',
    teaser: 'Jäljellä olevien sanojen alkukirjainparit.',
  },
];

const CONTENT_HEIGHT_PX = 108;
const RESERVED_PANEL_SPACE = `${CONTENT_HEIGHT_PX + 1}px`;
const PANEL_INNER_HEIGHT_PX = CONTENT_HEIGHT_PX - 20;
const BAR_HEIGHT_PX = 26;
const PAIRS_PER_COLUMN = 4;
const SOFT_PANEL_BORDER = 'color-mix(in srgb, var(--color-border) 72%, transparent)';

function SummaryMetric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div
      className="flex items-center gap-1.5"
      style={{
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: '999px',
        padding: '5px 8px',
      }}
    >
      <span
        style={{
          color: 'var(--color-text-tertiary)',
          fontSize: '10.5px',
          fontWeight: 600,
          lineHeight: '13px',
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: 'var(--color-text-primary)',
          fontSize: '11.5px',
          fontWeight: 700,
          lineHeight: '14px',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SummaryContent({ data }: { data: DerivedHintData }): React.JSX.Element {
  const pct = data.wordCount > 0 ? Math.round((data.wordsFound / data.wordCount) * 100) : 0;
  const { pangramStats } = data;
  const pangramLabel = pangramStats.total === 1 ? 'Pangrammi' : 'Pangrammit';
  const unfoundLengths = data.lengthDistribution.filter((e) => e.remaining > 0);
  const uniqueCount = unfoundLengths.length;
  const longest = unfoundLengths.length > 0 ? Math.max(...unfoundLengths.map((e) => e.len)) : 0;
  const allFound = data.wordsRemaining === 0;
  const primaryColor = allFound ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)';
  const secondaryColor = allFound ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)';

  return (
    <div className="flex flex-col gap-2 w-full" data-testid="hint-panel-summary">
      <div className="flex flex-wrap items-center gap-1.5">
        <div
          style={{
            color: primaryColor,
            fontSize: '16px',
            fontWeight: 700,
            lineHeight: '20px',
          }}
        >
          {data.wordsRemaining}/{data.wordCount}
        </div>
        <div
          style={{
            color: primaryColor,
            fontSize: '12.5px',
            fontWeight: 600,
            lineHeight: '16px',
          }}
        >
          sanaa löytämättä
        </div>
        <div
          style={{
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: '999px',
            color: secondaryColor,
            fontSize: '11px',
            fontWeight: 700,
            lineHeight: '14px',
            padding: '3px 7px',
          }}
        >
          {pct}%
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <SummaryMetric
          label={pangramLabel}
          value={`${pangramStats.remaining}/${pangramStats.total}`}
        />
        <SummaryMetric label="Pituuksia" value={`${uniqueCount} eri`} />
        <SummaryMetric label="Pisin" value={`${longest} kirj.`} />
      </div>
    </div>
  );
}

function DistributionContent({ data }: { data: DerivedHintData }): React.JSX.Element {
  return (
    <div
      className="flex flex-col items-center w-full"
      style={{ gap: '4px' }}
      data-testid="hint-panel-distribution"
    >
      <span
        style={{
          fontSize: '10px',
          lineHeight: '12px',
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
        }}
      >
        Sanoja jäljellä
      </span>
      <div className="flex items-end gap-1 w-full">
        {data.lengthDistribution.map((item) => {
          const done = item.remaining === 0;
          const fillHeight =
            item.total > 0 ? Math.round(BAR_HEIGHT_PX * (item.found / item.total)) : 0;

          return (
            <div
              key={item.len}
              className="flex flex-col items-center"
              style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
            >
              <span
                style={{
                  fontSize: '9px',
                  lineHeight: '11px',
                  marginBottom: '1px',
                  color: done ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                }}
              >
                {item.remaining}
              </span>
              <div
                style={{
                  width: '100%',
                  height: `${BAR_HEIGHT_PX}px`,
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${fillHeight}px`,
                    background: done ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: '9px',
                  lineHeight: '11px',
                  marginTop: '1px',
                  color: done ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                }}
              >
                {item.len}
              </span>
            </div>
          );
        })}
      </div>
      <span
        style={{
          fontSize: '10px',
          lineHeight: '12px',
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
        }}
      >
        Pituus, kirjainta
      </span>
    </div>
  );
}

function PairsContent({ data }: { data: DerivedHintData }): React.JSX.Element {
  const columns = toColumns(data.pairMap, PAIRS_PER_COLUMN);

  return (
    <div
      className="flex flex-wrap w-full"
      style={{ columnGap: '10px', rowGap: '4px' }}
      data-testid="hint-panel-pairs"
    >
      {columns.map((column, index) => (
        <div key={`pairs-col-${index}`} className="flex flex-col gap-1">
          {column.map((item) => (
            <span
              key={item.pair}
              style={{
                fontFamily: 'var(--font-mono)',
                color:
                  item.remaining === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                fontSize: '13px',
                lineHeight: '17px',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>
                {item.pair.toUpperCase()}:{' '}
              </span>
              {item.remaining}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const PANEL_CONTENT: Record<
  VisiblePanelId,
  (props: { data: DerivedHintData }) => React.JSX.Element
> = {
  summary: SummaryContent,
  distribution: DistributionContent,
  pairs: PairsContent,
};

function LockedHintState({
  panel,
  onUnlock,
}: {
  panel: PanelConfig;
  onUnlock: () => void;
}): React.JSX.Element {
  return (
    <div
      className="flex flex-col justify-center gap-2 w-full"
      style={{ minHeight: `${PANEL_INNER_HEIGHT_PX}px` }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div
          style={{
            color: 'var(--color-accent)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            lineHeight: '13px',
            textTransform: 'uppercase',
          }}
        >
          {panel.label}
        </div>
        <div
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: '13px',
            lineHeight: '17px',
          }}
        >
          {panel.teaser}
        </div>
      </div>

      <button
        type="button"
        style={{
          alignSelf: 'stretch',
          background: 'var(--color-accent)',
          border: '1px solid var(--color-accent-faded)',
          borderRadius: '10px',
          color: 'var(--color-on-accent)',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 700,
          padding: '8px 14px',
        }}
        onClick={onUnlock}
      >
        Aktivoi apu
      </button>
    </div>
  );
}

export function HintPanels({
  hintsUnlocked,
  onUnlock,
  hintData: hintDataProp,
}: HintPanelsProps): React.JSX.Element | null {
  const storeHintData = useHintData();
  const hintData = hintDataProp !== undefined ? hintDataProp : storeHintData;
  const [activeTab, setActiveTab] = useState<VisiblePanelId | null>(null);

  const handleTabClick = useCallback((id: VisiblePanelId) => {
    setActiveTab((prev) => (prev === id ? null : id));
  }, []);

  if (!hintData) return null;

  const activePanel =
    activeTab !== null ? (VISIBLE_PANELS.find((panel) => panel.id === activeTab) ?? null) : null;
  const ActiveContent = activeTab !== null ? PANEL_CONTENT[activeTab] : null;
  const activeIsUnlocked = activeTab !== null ? hintsUnlocked.has(activeTab) : false;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div className="relative flex items-center gap-2" style={{ padding: '6px 0' }}>
        <span
          style={{
            color: 'var(--color-text-primary)',
            fontSize: '13px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          Avut
        </span>

        <div
          className="flex"
          style={{
            flex: 1,
            background: 'var(--color-bg-secondary)',
            borderRadius: '10px',
            padding: '2px',
          }}
        >
          {VISIBLE_PANELS.map((panel) => {
            const isActive = activeTab === panel.id;
            const isUnlocked = hintsUnlocked.has(panel.id);

            return (
              <button
                key={panel.id}
                type="button"
                onClick={() => handleTabClick(panel.id)}
                aria-pressed={isActive}
                data-hint-tab={panel.id}
                data-hint-state={isUnlocked ? 'unlocked' : 'locked'}
                style={{
                  flex: 1,
                  minHeight: '30px',
                  padding: '4px 14px',
                  borderRadius: '7px',
                  border: 'none',
                  background: isActive ? 'var(--color-bg-primary)' : 'transparent',
                  boxShadow: isActive ? '0 1px 2px -1px var(--color-button-shadow)' : 'none',
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  position: 'relative',
                }}
              >
                <span className="flex min-w-0 items-center justify-center">
                  <span className="min-w-0 truncate max-w-[calc(100%-18px)]">{panel.label}</span>
                </span>
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex shrink-0"
                  style={{
                    color: isUnlocked ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {isUnlocked ? (
                    <CheckIcon size={11} strokeWidth={3} />
                  ) : (
                    <LockIcon size={10} strokeWidth={2.5} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        aria-hidden={!activeTab}
        className="relative overflow-hidden text-sm"
        style={{
          boxSizing: 'border-box',
          fontFamily: 'var(--font-sans)',
          height: RESERVED_PANEL_SPACE,
        }}
      >
        {activeTab && (
          <div
            className="absolute inset-0 overflow-hidden transition-opacity duration-150"
            style={{
              background: 'var(--color-bg-primary)',
              borderTop: `1px solid ${SOFT_PANEL_BORDER}`,
            }}
          >
            <div
              className="relative z-10"
              style={{
                height: '100%',
                overflowY: 'auto',
                padding: '10px 10px',
              }}
            >
              <div
                style={{
                  minHeight: `${PANEL_INNER_HEIGHT_PX}px`,
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                {activeIsUnlocked && ActiveContent ? (
                  <div style={{ width: '100%' }}>
                    <ActiveContent data={hintData} />
                  </div>
                ) : (
                  activePanel && (
                    <LockedHintState
                      panel={activePanel}
                      onUnlock={() => onUnlock(activePanel.id)}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
