import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { VariationData } from '@sanakenno/shared';
import {
  adminBlockWord,
  adminDeletePuzzle,
  adminGetPuzzleVariations,
  adminGetSlots,
  adminPreview,
  adminSavePuzzle,
  adminSwapPuzzles,
} from '../../api/client.js';
import { AdminWordListPanel } from './AdminWordListPanel.js';
import { PuzzleSlotControls } from './PuzzleSlotControls.js';
import { SuggestionPanel } from './SuggestionPanel.js';
import { useAdminStore } from './useAdminStore.js';

export function PuzzleEditor(): React.JSX.Element {
  const csrfToken = useAdminStore((s) => s.csrfToken);

  const [currentSlot, setCurrentSlot] = useState<number | null>(null);
  const [currentDisplayNumber, setCurrentDisplayNumber] = useState<number | null>(null);
  const [prevSlot, setPrevSlot] = useState<number | null>(null);
  const [nextSlot, setNextSlot] = useState<number | null>(null);
  const [totalPuzzles, setTotalPuzzles] = useState(0);
  const [activeSlots, setActiveSlots] = useState<number[]>([]);
  const [savedLetters, setSavedLetters] = useState('');
  const [savedCenter, setSavedCenter] = useState('');
  const [activeLetters, setActiveLetters] = useState('');
  const [activeCenter, setActiveCenter] = useState('');
  const [variations, setVariations] = useState<VariationData[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [words, setWords] = useState<string[]>([]);
  const [wordsLoading, setWordsLoading] = useState(false);

  const [jumpTarget, setJumpTarget] = useState('');
  const [swapTarget, setSwapTarget] = useState('');
  const [newLetters, setNewLetters] = useState('');
  const [newCenter, setNewCenter] = useState('');
  const [newSlot, setNewSlot] = useState<number | ''>('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | 'warning' | null>(null);
  const [forceRequired, setForceRequired] = useState(false);

  const [preview, setPreview] = useState<{
    words: string[];
    max_score: number;
    hint_data: { word_count: number; pangram_count: number };
  } | null>(null);

  const isDirty = activeLetters !== savedLetters || activeCenter !== savedCenter;

  const loadWordsFor = useCallback(
    async (letters: string | string[], center: string) => {
      if (!csrfToken || !letters || !center) return;
      setWordsLoading(true);
      try {
        const res = await adminPreview(csrfToken, { letters, center });
        setWords(res.words);
        setPreview({
          words: res.words,
          max_score: res.max_score,
          hint_data: res.hint_data,
        });
      } catch {
        setWords([]);
      } finally {
        setWordsLoading(false);
      }
    },
    [csrfToken],
  );

  const loadPuzzle = useCallback(
    async (params: { slot?: number; display_number?: number }) => {
      if (!csrfToken) return;
      setLoading(true);
      try {
        const data = await adminGetPuzzleVariations(csrfToken, params);
        setCurrentSlot(data.slot);
        setCurrentDisplayNumber(data.display_number);
        setPrevSlot(data.prev_slot);
        setNextSlot(data.next_slot);
        setTotalPuzzles(data.total_puzzles);
        const lStr = data.letters.join(',');
        setSavedLetters(lStr);
        setSavedCenter(data.center);
        setActiveLetters(lStr);
        setActiveCenter(data.center);
        setVariations(data.variations);
        setIsActive(data.is_active);

        setJumpTarget(data.display_number !== null ? String(data.display_number) : '');

        void loadWordsFor(data.letters, data.center);
      } catch (err: unknown) {
        setStatusMessage(err instanceof Error ? err.message : 'Pelin lataus epäonnistui');
        setStatusType('error');
      } finally {
        setLoading(false);
      }
    },
    [csrfToken, loadWordsFor],
  );

  const refreshSlotsList = useCallback(async () => {
    if (!csrfToken) return;
    try {
      const res = await adminGetSlots(csrfToken);
      const slots = res.active_slots ?? res.slots.map((s) => s.slot);
      setActiveSlots(slots);
      setTotalPuzzles(res.total_puzzles);
      return slots;
    } catch {
      return [];
    }
  }, [csrfToken]);

  useEffect(() => {
    void refreshSlotsList().then((slots) => {
      if (slots && slots.length > 0 && currentSlot === null) {
        void loadPuzzle({ slot: slots[0] });
      }
    });
  }, [refreshSlotsList, loadPuzzle, currentSlot]);

  const handleCenterSelect = (center: string) => {
    setActiveCenter(center);
    setNewCenter(center);
    void loadWordsFor(activeLetters, center);
  };

  const handleRestore = () => {
    setActiveLetters(savedLetters);
    setActiveCenter(savedCenter);
    setNewLetters(savedLetters);
    setNewCenter(savedCenter);
    void loadWordsFor(savedLetters, savedCenter);
  };

  const handleSaveCurrent = async (force = false) => {
    if (!csrfToken || currentSlot === null) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      await adminSavePuzzle(csrfToken, {
        slot: currentSlot,
        letters: activeLetters,
        center: activeCenter,
        force,
      });
      setStatusMessage('Peli tallennettu onnistuneesti!');
      setStatusType('success');
      setForceRequired(false);
      await refreshSlotsList();
      await loadPuzzle({ slot: currentSlot });
    } catch (err: unknown) {
      const reqForce = (err as { requires_force?: boolean }).requires_force;
      if (reqForce) setForceRequired(true);
      setStatusMessage(err instanceof Error ? err.message : 'Tallennus epäonnistui');
      setStatusType('error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrev = () => {
    if (prevSlot !== null) void loadPuzzle({ slot: prevSlot });
  };

  const handleNext = () => {
    if (nextSlot !== null) void loadPuzzle({ slot: nextSlot });
  };

  const handleJump = (e: FormEvent) => {
    e.preventDefault();
    const target = parseInt(jumpTarget, 10);
    if (!Number.isInteger(target) || target < 1 || target > totalPuzzles) {
      setStatusMessage(`Anna pelinumero 1-${totalPuzzles}`);
      setStatusType('warning');
      return;
    }
    void loadPuzzle({ display_number: target });
  };

  const handleSwap = async () => {
    if (!csrfToken || currentSlot === null) return;
    const targetDisp = parseInt(swapTarget, 10);
    if (
      !Number.isInteger(targetDisp) ||
      targetDisp < 1 ||
      targetDisp > totalPuzzles ||
      targetDisp === currentDisplayNumber
    ) {
      setStatusMessage(`Anna vaihtopelin numero 1-${totalPuzzles} (ei nykyinen)`);
      setStatusType('warning');
      return;
    }
    const targetSlot = activeSlots[targetDisp - 1];
    if (targetSlot === undefined || targetSlot === currentSlot) return;

    setSaving(true);
    try {
      await adminSwapPuzzles(csrfToken, currentSlot, targetSlot);
      setStatusMessage('Pelit vaihdettu keskenään onnistuneesti!');
      setStatusType('success');
      setSwapTarget('');
      await refreshSlotsList();
      await loadPuzzle({ slot: targetSlot });
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Vaihto epäonnistui');
      setStatusType('error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!csrfToken) return;
    const target = typeof newSlot === 'number' && newSlot >= 0 ? newSlot : currentSlot;
    if (target === null) return;
    if (!window.confirm(`Haluatko varmasti poistaa slotin ${target}?`)) return;

    setSaving(true);
    setStatusMessage(null);
    try {
      await adminDeletePuzzle(csrfToken, target);
      setStatusMessage(`Slotti ${target} poistettu.`);
      setStatusType('success');
      const slots = await refreshSlotsList();
      if (slots && slots.length > 0) {
        await loadPuzzle({ slot: slots[0] });
      } else {
        setCurrentSlot(null);
        setCurrentDisplayNumber(null);
        setWords([]);
        setVariations([]);
      }
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Poisto epäonnistui');
      setStatusType('error');
    } finally {
      setSaving(false);
    }
  };

  const handleReactivate = async () => {
    if (!csrfToken || currentSlot === null) return;
    setSaving(true);
    try {
      await adminSavePuzzle(csrfToken, {
        slot: currentSlot,
        letters: activeLetters,
        center: activeCenter,
        force: true,
      });
      setStatusMessage('Peli palautettu onnistuneesti kiertoon!');
      setStatusType('success');
      await refreshSlotsList();
      await loadPuzzle({ slot: currentSlot });
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Palautus epäonnistui');
      setStatusType('error');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewForm = async () => {
    if (!csrfToken || !newLetters || !newCenter) return;
    setSaving(true);
    try {
      const res = await adminPreview(csrfToken, { letters: newLetters, center: newCenter });
      setPreview({
        words: res.words,
        max_score: res.max_score,
        hint_data: res.hint_data,
      });
      setWords(res.words);
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Esikatselu epäonnistui');
      setStatusType('error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveForm = async (overrideForce = false) => {
    if (!csrfToken || !newLetters || !newCenter) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const payload: { slot?: number; letters: string; center: string; force?: boolean } = {
        letters: newLetters,
        center: newCenter,
        force: overrideForce || forceRequired,
      };
      if (typeof newSlot === 'number' && newSlot >= 0) {
        payload.slot = newSlot;
      }
      const res = (await adminSavePuzzle(csrfToken, payload)) as { slot: number };
      setStatusMessage('Peli tallennettu onnistuneesti!');
      setStatusType('success');
      setForceRequired(false);
      await refreshSlotsList();
      await loadPuzzle({ slot: res.slot });
    } catch (err: unknown) {
      const reqForce = (err as { requires_force?: boolean }).requires_force;
      if (reqForce) setForceRequired(true);
      setStatusMessage(err instanceof Error ? err.message : 'Tallennus epäonnistui');
      setStatusType('error');
    } finally {
      setSaving(false);
    }
  };

  const handleBlockWord = async (word: string) => {
    if (!csrfToken) return;
    if (!window.confirm(`Estä sana "${word}" pysyvästi?`)) return;
    try {
      await adminBlockWord(csrfToken, word);
      setStatusMessage(`Sana "${word}" estetty.`);
      setStatusType('success');
      if (currentSlot !== null) {
        await loadPuzzle({ slot: currentSlot });
      }
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Sanan esto epäonnistui');
      setStatusType('error');
    }
  };

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      {statusMessage && (
        <div
          role="alert"
          className="p-3 rounded-lg text-xs font-semibold flex items-center justify-between border"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
            color:
              statusType === 'error'
                ? 'var(--color-error)'
                : statusType === 'warning'
                  ? 'var(--color-accent)'
                  : 'var(--color-accent)',
          }}
        >
          <span>{statusMessage}</span>
        </div>
      )}

      {preview && (
        <div
          className="p-3 rounded-xl border flex flex-wrap gap-4 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
          }}
        >
          <span>Sanoja: {preview.hint_data.word_count}</span>
          <span>Maksimipisteet: {preview.max_score}</span>
          <span>Pangrammeja: {preview.hint_data.pangram_count}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <PuzzleSlotControls
            currentSlot={currentSlot}
            currentDisplayNumber={currentDisplayNumber}
            canGoPrev={prevSlot !== null}
            canGoNext={nextSlot !== null}
            totalPuzzles={totalPuzzles}
            variations={variations}
            activeCenter={activeCenter}
            isActive={isActive}
            isDirty={isDirty}
            saving={saving}
            loading={loading}
            jumpTarget={jumpTarget}
            swapTarget={swapTarget}
            newLetters={newLetters}
            newCenter={newCenter}
            newSlot={newSlot}
            forceRequired={forceRequired}
            onJumpTargetChange={setJumpTarget}
            onSwapTargetChange={setSwapTarget}
            onPrev={handlePrev}
            onNext={handleNext}
            onJump={handleJump}
            onSwap={handleSwap}
            onCenterSelect={handleCenterSelect}
            onSave={() => handleSaveCurrent(false)}
            onRestore={handleRestore}
            onDelete={handleDelete}
            onReactivate={handleReactivate}
            onToggleCreateMode={() => {
              setNewLetters('');
              setNewCenter('');
              setNewSlot('');
              setForceRequired(false);
              setStatusMessage(null);
            }}
            onNewLettersChange={setNewLetters}
            onNewCenterChange={setNewCenter}
            onNewSlotChange={setNewSlot}
            onPreviewForm={handlePreviewForm}
            onCreateForm={handleSaveForm}
          />

          <SuggestionPanel
            csrfToken={csrfToken}
            onSelectSuggestion={(sLetters, sCenter) => {
              setNewLetters(sLetters);
              setNewCenter(sCenter);
              setNewSlot('');
              setForceRequired(false);
              setStatusMessage(null);
              void loadWordsFor(sLetters, sCenter);
            }}
          />
        </div>

        <div className="lg:col-span-5 flex flex-col">
          <AdminWordListPanel
            words={words}
            letters={activeLetters || newLetters}
            loading={wordsLoading}
            onBlock={handleBlockWord}
          />
        </div>
      </div>
    </div>
  );
}
