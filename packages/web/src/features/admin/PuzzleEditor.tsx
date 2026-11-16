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
import { AdminAlert } from './AdminPrimitives.js';
import { AdminWordListPanel } from './AdminWordListPanel.js';
import { PuzzleSlotControls } from './PuzzleSlotControls.js';
import { SuggestionPanel } from './SuggestionPanel.js';
import { useAdminStore } from './useAdminStore.js';

interface PuzzleEditorProps {
  prefillLetters?: string | null;
  onPrefillConsumed?: () => void;
}

export function PuzzleEditor({
  prefillLetters,
  onPrefillConsumed,
}: PuzzleEditorProps = {}): React.JSX.Element {
  const csrfToken = useAdminStore((s) => s.csrfToken);

  const [currentSlot, setCurrentSlot] = useState<number | null>(null);
  const [currentDisplayNumber, setCurrentDisplayNumber] = useState<number | null>(null);
  const [prevSlot, setPrevSlot] = useState<number | null>(null);
  const [nextSlot, setNextSlot] = useState<number | null>(null);
  const [totalPuzzles, setTotalPuzzles] = useState(0);
  const [activeSlots, setActiveSlots] = useState<number[]>([]);
  const [todaySlot, setTodaySlot] = useState<number | null>(null);
  const [savedLetters, setSavedLetters] = useState('');
  const [savedCenter, setSavedCenter] = useState('');
  const [activeLetters, setActiveLetters] = useState('');
  const [activeCenter, setActiveCenter] = useState('');
  const [variations, setVariations] = useState<VariationData[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [words, setWords] = useState<string[]>([]);
  const [wordsLetters, setWordsLetters] = useState('');
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
      const lettersStr = Array.isArray(letters) ? letters.join(',') : letters;
      setWordsLoading(true);
      try {
        const res = await adminPreview(csrfToken, { letters, center });
        setWords(res.words);
        setWordsLetters(lettersStr);
        setPreview({
          words: res.words,
          max_score: res.max_score,
          hint_data: res.hint_data,
        });
      } catch {
        setWords([]);
        setWordsLetters('');
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
      const resolvedToday = res.today_slot ?? null;
      setActiveSlots(slots);
      setTotalPuzzles(res.total_puzzles);
      setTodaySlot(resolvedToday);
      return { slots, todaySlot: resolvedToday };
    } catch {
      return { slots: [] as number[], todaySlot: null as number | null };
    }
  }, [csrfToken]);

  useEffect(() => {
    if (!prefillLetters) return;
    setNewLetters(prefillLetters);
    setNewCenter('');
    setNewSlot('');
    setForceRequired(false);
    onPrefillConsumed?.();
  }, [prefillLetters, onPrefillConsumed]);

  useEffect(() => {
    void refreshSlotsList().then((result) => {
      if (result && result.slots.length > 0 && currentSlot === null) {
        const initialSlot = result.todaySlot ?? result.slots[0]!;
        void loadPuzzle({ slot: initialSlot });
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
      const result = await refreshSlotsList();
      if (result && result.slots.length > 0) {
        await loadPuzzle({ slot: result.slots[0] });
      } else {
        setCurrentSlot(null);
        setCurrentDisplayNumber(null);
        setWords([]);
        setWordsLetters('');
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
      setWordsLetters(newLetters);
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Esikatselu epäonnistui');
      setStatusType('error');
    } finally {
      setSaving(false);
    }
  };

  const savePuzzlePayload = async (
    payload: { slot?: number; letters: string; center: string; force?: boolean },
    successMessage: (res: { slot: number; display_number: number }) => string,
  ): Promise<void> => {
    if (!csrfToken) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = (await adminSavePuzzle(csrfToken, payload)) as {
        slot: number;
        display_number: number;
      };
      setStatusMessage(successMessage(res));
      setStatusType('success');
      setForceRequired(false);
      await refreshSlotsList();
      await loadPuzzle({ slot: res.slot });
    } catch (err: unknown) {
      const reqForce = (err as { requires_force?: boolean }).requires_force;
      if (reqForce) {
        setForceRequired(true);
        if (payload.slot === undefined) {
          setNewLetters(payload.letters);
          setNewCenter(payload.center);
          setNewSlot('');
        }
      }
      setStatusMessage(err instanceof Error ? err.message : 'Tallennus epäonnistui');
      setStatusType('error');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveForm = async (overrideForce = false) => {
    if (!newLetters || !newCenter) return;
    const payload: { slot?: number; letters: string; center: string; force?: boolean } = {
      letters: newLetters,
      center: newCenter,
      force: overrideForce || forceRequired,
    };
    if (typeof newSlot === 'number' && newSlot >= 0) {
      payload.slot = newSlot;
    }
    await savePuzzlePayload(payload, () => 'Peli tallennettu onnistuneesti!').catch(
      () => undefined,
    );
  };

  const handleAddSuggestion = async (letters: string, center: string): Promise<void> => {
    await savePuzzlePayload({ letters, center }, (res) => {
      setNewLetters('');
      setNewCenter('');
      setNewSlot('');
      return `Ehdotettu peli lisätty kiertoon (peli #${res.display_number}, slotti ${res.slot})!`;
    });
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
        <AdminAlert variant={statusType ?? 'success'} role="alert">
          {statusMessage}
        </AdminAlert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <PuzzleSlotControls
            currentSlot={currentSlot}
            currentDisplayNumber={currentDisplayNumber}
            canGoFirst={activeSlots.length > 0 && currentSlot !== activeSlots[0]}
            canGoPrev={prevSlot !== null}
            canGoToday={todaySlot !== null && currentSlot !== todaySlot}
            canGoNext={nextSlot !== null}
            canGoLast={
              activeSlots.length > 0 && currentSlot !== activeSlots[activeSlots.length - 1]
            }
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
            onFirst={() => {
              if (activeSlots.length > 0) void loadPuzzle({ slot: activeSlots[0] });
            }}
            onPrev={handlePrev}
            onToday={() => {
              if (todaySlot !== null) void loadPuzzle({ slot: todaySlot });
            }}
            onNext={handleNext}
            onLast={() => {
              if (activeSlots.length > 0) {
                void loadPuzzle({ slot: activeSlots[activeSlots.length - 1] });
              }
            }}
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
            onAddSuggestion={handleAddSuggestion}
            onPreviewSuggestion={(sLetters, sCenter) => {
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
            letters={wordsLetters || activeLetters || newLetters}
            maxScore={preview?.max_score}
            loading={wordsLoading}
            onBlock={handleBlockWord}
          />
        </div>
      </div>
    </div>
  );
}
