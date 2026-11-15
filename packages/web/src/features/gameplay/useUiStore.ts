import { create } from 'zustand';
import {
  DEFAULT_ACHIEVEMENT_ANNOUNCEMENT_MS,
  DEFAULT_GAMEPLAY_ANNOUNCEMENT_MS,
  type Announcement,
  type AnnouncementInput,
} from './announcements.js';

/** localStorage key for the player's "hide hint deck" preference. Defaults to true (collapsed). */
export const HINTS_HIDDEN_KEY = 'sanakenno_hints_hidden';

function writeHintsHidden(hidden: boolean): void {
  try {
    window.localStorage.setItem(HINTS_HIDDEN_KEY, hidden ? '1' : '0');
  } catch {
    // Storage unavailable (private mode / quota): keep the in-memory preference only.
  }
}

/** Message severity used for immediate word-submission feedback. */
export type MessageType = 'ok' | 'error';

/** Celebration overlay type. */
export type CelebrationType = 'allistyttava' | 'nohint-allistyttava' | 'taysikenno' | null;

export interface UiState {
  message: string;
  messageType: MessageType;
  activeAnnouncement: Announcement | null;
  announcementQueue: Announcement[];
  celebration: CelebrationType;
  wordShake: boolean;
  wordRejected: boolean;
  lastResubmittedWord: string | null;
  shareCopied: boolean;
  pressedHexIndex: number | null;
  showRanks: boolean;
  showRules: boolean;
  showAllFoundWords: boolean;
  showArchive: boolean;
  showStats: boolean;
  showSettings: boolean;
  showAuth: boolean;
  viewingPuzzleDate: string | null;
  pangramRipple: boolean;
  shuffleSpin: boolean;
  shuffleCount: number;
  /** Persisted player preference: collapse the hint deck to a single row. */
  hintsHidden: boolean;

  setHintsHidden: (hidden: boolean) => void;
  showToast: (msg: string, type?: MessageType, duration?: number, onExpire?: () => void) => void;
  enqueueAnnouncement: (announcement: AnnouncementInput) => void;
  dismissAnnouncement: () => void;
  triggerWordShake: (resubmittedWord?: string | null) => void;
  triggerPangramRipple: () => void;
  triggerShuffleSpin: () => void;
  clearWordRejection: () => void;
  setCelebration: (celebration: CelebrationType) => void;
  setShareCopied: (copied: boolean) => void;
  setPressedHexIndex: (index: number | null) => void;
  setShowRanks: (show: boolean) => void;
  setShowRules: (show: boolean) => void;
  setShowAllFoundWords: (show: boolean) => void;
  setShowArchive: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowAuth: (show: boolean) => void;
  setViewingPuzzleDate: (date: string | null) => void;
  resetUi: () => void;
}

let announcementCounter = 0;
let announcementTimer: ReturnType<typeof setTimeout> | null = null;
let messageTimer: ReturnType<typeof setTimeout> | null = null;
let shakeTimer: ReturnType<typeof setTimeout> | null = null;
let rippleTimer: ReturnType<typeof setTimeout> | null = null;
let shuffleTimer: ReturnType<typeof setTimeout> | null = null;

function clearAnnouncementTimer(): void {
  if (announcementTimer !== null) {
    clearTimeout(announcementTimer);
    announcementTimer = null;
  }
}

function getAnnouncementDuration(item: Announcement): number {
  if (item.durationMs && item.durationMs > 0) return item.durationMs;
  return item.kind === 'achievement'
    ? DEFAULT_ACHIEVEMENT_ANNOUNCEMENT_MS
    : DEFAULT_GAMEPLAY_ANNOUNCEMENT_MS;
}

export const useUiStore = create<UiState>()((set, get) => ({
  message: '',
  messageType: 'ok',
  activeAnnouncement: null,
  announcementQueue: [],
  celebration: null,
  wordShake: false,
  wordRejected: false,
  lastResubmittedWord: null,
  shareCopied: false,
  pressedHexIndex: null,
  showRanks: false,
  showRules: false,
  showAllFoundWords: false,
  showArchive: false,
  showStats: false,
  showSettings: false,
  showAuth: false,
  viewingPuzzleDate: null,
  pangramRipple: false,
  shuffleSpin: false,
  shuffleCount: 0,
  hintsHidden: true,

  setHintsHidden: (hintsHidden) => {
    writeHintsHidden(hintsHidden);
    set({ hintsHidden });
  },

  showToast: (msg, type = 'ok', duration = 2000, onExpire) => {
    if (messageTimer !== null) clearTimeout(messageTimer);
    set({
      message: msg,
      messageType: type,
    });
    messageTimer = setTimeout(() => {
      set({
        message: '',
        messageType: 'ok',
      });
      messageTimer = null;
      onExpire?.();
    }, duration);
  },

  enqueueAnnouncement: (input) => {
    const item: Announcement = {
      ...input,
      id: `ann-${++announcementCounter}`,
    };
    if (get().activeAnnouncement === null) {
      clearAnnouncementTimer();
      set({ activeAnnouncement: item });
      announcementTimer = setTimeout(() => {
        get().dismissAnnouncement();
      }, getAnnouncementDuration(item));
    } else {
      set((state) => ({
        announcementQueue: [...state.announcementQueue, item],
      }));
    }
  },

  dismissAnnouncement: () => {
    clearAnnouncementTimer();
    const queue = get().announcementQueue;
    if (queue.length === 0) {
      set({ activeAnnouncement: null });
      return;
    }
    const [next, ...rest] = queue;
    set({
      activeAnnouncement: next ?? null,
      announcementQueue: rest,
    });
    if (next) {
      announcementTimer = setTimeout(() => {
        get().dismissAnnouncement();
      }, getAnnouncementDuration(next));
    }
  },

  triggerWordShake: (resubmittedWord = null) => {
    if (shakeTimer !== null) clearTimeout(shakeTimer);
    const isResubmit = resubmittedWord !== null;
    set({
      wordRejected: true,
      wordShake: true,
      lastResubmittedWord: resubmittedWord,
    });
    shakeTimer = setTimeout(
      () => {
        set({
          wordShake: false,
          ...(isResubmit ? { lastResubmittedWord: null } : {}),
        });
        shakeTimer = null;
      },
      isResubmit ? 1200 : 400,
    );
  },

  triggerPangramRipple: () => {
    if (rippleTimer !== null) clearTimeout(rippleTimer);
    set({ pangramRipple: true });
    rippleTimer = setTimeout(() => {
      set({ pangramRipple: false });
      rippleTimer = null;
    }, 600);
  },

  triggerShuffleSpin: () => {
    if (shuffleTimer !== null) clearTimeout(shuffleTimer);
    set((state) => ({
      shuffleSpin: true,
      shuffleCount: state.shuffleCount + 1,
    }));
    shuffleTimer = setTimeout(() => {
      set({ shuffleSpin: false });
      shuffleTimer = null;
    }, 250);
  },

  clearWordRejection: () => {
    set({ wordRejected: false, wordShake: false });
  },

  setCelebration: (celebration) => set({ celebration }),
  setShareCopied: (shareCopied) => set({ shareCopied }),
  setPressedHexIndex: (pressedHexIndex) => set({ pressedHexIndex }),
  setShowRanks: (showRanks) => set({ showRanks }),
  setShowRules: (showRules) => set({ showRules }),
  setShowAllFoundWords: (showAllFoundWords) => set({ showAllFoundWords }),
  setShowArchive: (showArchive) => set({ showArchive }),
  setShowStats: (showStats) => set({ showStats }),
  setShowSettings: (showSettings) => set({ showSettings }),
  setShowAuth: (showAuth) => set({ showAuth }),
  setViewingPuzzleDate: (viewingPuzzleDate) => set({ viewingPuzzleDate }),

  resetUi: () => {
    clearAnnouncementTimer();
    if (messageTimer !== null) {
      clearTimeout(messageTimer);
      messageTimer = null;
    }
    if (shakeTimer !== null) {
      clearTimeout(shakeTimer);
      shakeTimer = null;
    }
    if (rippleTimer !== null) {
      clearTimeout(rippleTimer);
      rippleTimer = null;
    }
    if (shuffleTimer !== null) {
      clearTimeout(shuffleTimer);
      shuffleTimer = null;
    }
    set({
      message: '',
      messageType: 'ok',
      activeAnnouncement: null,
      announcementQueue: [],
      celebration: null,
      wordShake: false,
      wordRejected: false,
      lastResubmittedWord: null,
      shareCopied: false,
      pressedHexIndex: null,
      showRanks: false,
      showRules: false,
      showAllFoundWords: false,
      showArchive: false,
      showStats: false,
      showSettings: false,
      showAuth: false,
      viewingPuzzleDate: null,
      pangramRipple: false,
      shuffleSpin: false,
      shuffleCount: 0,
      hintsHidden: true,
    });
  },
}));
