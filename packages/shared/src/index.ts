export { HealthResponseSchema, type HealthResponse } from './schemas/health.js';
export {
  HintDataSchema,
  StatsRecordSchema,
  PlayerStatsSchema,
  PuzzleStateSchema,
  PlayerPreferencesSchema,
  SyncPayloadSchema,
} from './schemas/domain.js';

export {
  RANKS,
  NO_HINT_ACHIEVEMENTS,
  scoreWord,
  isPangram,
  recalcScore,
  rankForScore,
  rankThresholds,
  noHintAchievementStates,
  progressToNextRank,
  colorizeWord,
  toColumns,
  type Rank,
  type NoHintAchievement,
  type NoHintAchievementState,
  type ColorizedChar,
  type RankThreshold,
} from './scoring.js';

export {
  deriveHintData,
  compareFinnishAlphabetically,
  type HintData,
  type LetterEntry,
  type LengthEntry,
  type PairEntry,
  type PangramStats,
  type DerivedHintData,
} from './hint-data.js';

export {
  STATS_STORAGE_KEY,
  rankIndex,
  updateStatsRecord,
  bestNoHintScoreForRecord,
  computeStreak,
  computeLifetimeStats,
  computeLifetimeNoHintStats,
  getHelsinkiDateString,
  computeRankDistribution,
  computeAverageCompletion,
  emptyStats,
  type StatsRecord,
  type PlayerStats,
  type LifetimeStats,
  type LifetimeNoHintStats,
} from './stats.js';

export { buildShareText, type ShareTextInput } from './share-text.js';
export { buildKotusUrl } from './kotus.js';

export {
  AUTH_TOKEN_STORAGE_KEY,
  DEFAULT_THEME_ID,
  THEME_IDS,
  type AuthToken,
  type SyncPuzzleState,
  type SyncProgressPayload,
  type SyncPayload,
  type PlayerPreferences,
  type ThemeId,
  type ThemePreference,
} from './auth-types.js';

export {
  getHoneycombCenterOverlayStops,
  getHoneycombCenterOverlayVariant,
  type HoneycombCenterOverlayVariant,
  type HoneycombCenterOverlayStop,
} from './honeycomb-theme.js';

export {
  mergeStatsRecord,
  mergePuzzleState,
  isStatsRecordBetterThanServer,
  isPuzzleStateBetterThanServer,
} from './sync-merge.js';
