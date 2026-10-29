import type { FormEvent } from 'react';
import type { VariationData } from '@sanakenno/shared';
import { ManualPuzzleForm } from './ManualPuzzleForm.js';
import { VariationsGrid } from './VariationsGrid.js';

interface PuzzleSlotControlsProps {
  currentSlot: number | null;
  currentDisplayNumber: number | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  totalPuzzles: number;
  variations: VariationData[];
  activeCenter: string;
  isActive: boolean;
  isDirty: boolean;
  saving: boolean;
  loading: boolean;
  jumpTarget: string;
  swapTarget: string;
  newLetters: string;
  newCenter: string;
  newSlot: number | '';
  forceRequired: boolean;
  onJumpTargetChange: (val: string) => void;
  onSwapTargetChange: (val: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onJump: (e: FormEvent) => void;
  onSwap: () => void;
  onCenterSelect: (center: string) => void;
  onSave: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onReactivate: () => void;
  onToggleCreateMode: () => void;
  onNewLettersChange: (val: string) => void;
  onNewCenterChange: (val: string) => void;
  onNewSlotChange: (val: number | '') => void;
  onPreviewForm: () => void;
  onCreateForm: (force?: boolean) => void;
}

export function PuzzleSlotControls({
  currentSlot,
  currentDisplayNumber,
  canGoPrev,
  canGoNext,
  totalPuzzles,
  variations,
  activeCenter,
  isActive,
  isDirty,
  saving,
  loading,
  jumpTarget,
  swapTarget,
  newLetters,
  newCenter,
  newSlot,
  forceRequired,
  onJumpTargetChange,
  onSwapTargetChange,
  onPrev,
  onNext,
  onJump,
  onSwap,
  onCenterSelect,
  onSave,
  onRestore,
  onDelete,
  onReactivate,
  onToggleCreateMode,
  onNewLettersChange,
  onNewCenterChange,
  onNewSlotChange,
  onPreviewForm,
  onCreateForm,
}: PuzzleSlotControlsProps): React.JSX.Element {
  return (
    <div
      className="p-5 rounded-2xl border space-y-5"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-400 font-bold text-sm">
            {currentDisplayNumber ?? '#'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {currentDisplayNumber !== null
                  ? `Peli ${currentDisplayNumber} / ${totalPuzzles}`
                  : currentSlot !== null
                    ? `Poistettu peli (slotti ${currentSlot})`
                    : 'Ei valittua peliä'}
              </h2>
              {isDirty && (
                <span
                  className="px-2 py-0.5 rounded text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-bg-primary)',
                  }}
                >
                  Muutoksia
                </span>
              )}
              {!isActive && currentSlot !== null && (
                <span
                  className="px-2 py-0.5 rounded text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--color-error)',
                    color: 'var(--color-bg-primary)',
                  }}
                >
                  Poistettu kierrosta
                </span>
              )}
            </div>
            {currentSlot !== null && (
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Slotti {currentSlot}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canGoPrev || loading}
            aria-label="Edellinen peli"
            className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            ← Edellinen
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext || loading}
            aria-label="Seuraava peli"
            className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            Seuraava →
          </button>
          <button
            type="button"
            onClick={onToggleCreateMode}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ml-1"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              borderColor: 'var(--color-border)',
            }}
          >
            + Uusi peli
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <form onSubmit={onJump} className="flex items-center gap-1.5">
          <label htmlFor="jump-input" style={{ color: 'var(--color-text-secondary)' }}>
            Siirry:
          </label>
          <input
            id="jump-input"
            aria-label="Siirry pelinumeroon"
            type="number"
            min={1}
            max={totalPuzzles || 9999}
            placeholder="#"
            value={jumpTarget}
            onChange={(e) => onJumpTargetChange(e.target.value)}
            className="w-16 px-2 py-1 rounded border text-center font-mono"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
          <button
            type="submit"
            className="px-2.5 py-1 rounded border font-medium cursor-pointer"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            Siirry
          </button>
        </form>

        <div className="flex items-center gap-1.5">
          <label htmlFor="swap-input" style={{ color: 'var(--color-text-secondary)' }}>
            Vaihda pelin #:
          </label>
          <input
            id="swap-input"
            type="number"
            min={1}
            max={totalPuzzles || 9999}
            placeholder="#"
            value={swapTarget}
            onChange={(e) => onSwapTargetChange(e.target.value)}
            className="w-16 px-2 py-1 rounded border text-center font-mono"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
          <button
            type="button"
            onClick={onSwap}
            disabled={!swapTarget || loading}
            className="px-2.5 py-1 rounded border font-medium cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            Vaihda
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={onRestore}
              title="Kumoa muutokset"
              className="px-3 py-1 rounded border text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              Kumoa muutokset
            </button>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || saving}
            className="px-3 py-1 rounded text-xs font-semibold cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-bg-primary)',
            }}
          >
            Tallenna muutokset
          </button>

          {currentSlot !== null &&
            (isActive ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="px-3 py-1 rounded text-xs font-medium cursor-pointer disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--color-error)',
                  color: 'var(--color-bg-primary)',
                }}
              >
                Poista kierrosta
              </button>
            ) : (
              <button
                type="button"
                onClick={onReactivate}
                disabled={saving}
                className="px-3 py-1 rounded text-xs font-semibold cursor-pointer disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-bg-primary)',
                }}
              >
                Palauta kiertoon
              </button>
            ))}
        </div>
      </div>

      <div className="space-y-2">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Keskuskirjaimen variaatiot (klikkaa vaihtaaksesi):
        </span>
        <VariationsGrid
          variations={variations}
          activeCenter={activeCenter}
          onSelect={onCenterSelect}
        />
      </div>

      <div className="pt-2">
        <ManualPuzzleForm
          newLetters={newLetters}
          newCenter={newCenter}
          newSlot={newSlot}
          saving={saving}
          forceRequired={forceRequired}
          onLettersChange={onNewLettersChange}
          onCenterChange={onNewCenterChange}
          onSlotChange={onNewSlotChange}
          onPreview={onPreviewForm}
          onCreate={onCreateForm}
          onDelete={typeof newSlot === 'number' && newSlot >= 0 ? onDelete : undefined}
        />
      </div>
    </div>
  );
}
