/**
 * Player Achievements catalog, tier definitions, and deterministic evaluation.
 */

import { bestNoHintScoreForRecord, rankIndex, type PlayerStats } from './stats.js';

export type AchievementId =
  'streak' | 'total_words' | 'pangrams' | 'long_word' | 'full_board' | 'unassisted_master';

export const ACHIEVEMENT_TIER_KEYS = ['bronze', 'silver', 'gold', 'diamond', 'master'] as const;

export type AchievementTierKey = (typeof ACHIEVEMENT_TIER_KEYS)[number];

export const ACHIEVEMENT_TIER_NAMES = ['Pronssi', 'Hopea', 'Kulta', 'Timantti', 'Mestari'] as const;

export type AchievementTierName = (typeof ACHIEVEMENT_TIER_NAMES)[number];

export interface AchievementTier {
  level: number; // 1 to 5
  key: AchievementTierKey;
  name: AchievementTierName;
  target: number;
}

export interface AchievementDefinition {
  id: AchievementId;
  category: string;
  title: string;
  description: string;
  unit: string;
  tiers: readonly AchievementTier[];
}

function makeTiers(targets: [number, number, number, number, number]): readonly AchievementTier[] {
  return [
    { level: 1, key: 'bronze', name: 'Pronssi', target: targets[0] },
    { level: 2, key: 'silver', name: 'Hopea', target: targets[1] },
    { level: 3, key: 'gold', name: 'Kulta', target: targets[2] },
    { level: 4, key: 'diamond', name: 'Timantti', target: targets[3] },
    { level: 5, key: 'master', name: 'Mestari', target: targets[4] },
  ];
}

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    id: 'streak',
    category: 'Päiväputki',
    title: 'Päivittäinen tapa',
    description: 'Pelaa päivän kenno peräkkäisinä päivinä',
    unit: 'päivää',
    tiers: makeTiers([7, 30, 60, 120, 365]),
  },
  {
    id: 'total_words',
    category: 'Sanat',
    title: 'Sanasampo',
    description: 'Löydä sanoja',
    unit: 'sanaa',
    tiers: makeTiers([100, 500, 1000, 2500, 5000]),
  },
  {
    id: 'pangrams',
    category: 'Pangrammit',
    title: 'Taitava #7',
    description: 'Löydä pangrammeja',
    unit: 'pangrammia',
    tiers: makeTiers([7, 17, 77, 177, 777]),
  },
  {
    id: 'long_word',
    category: 'Pitkät sanat',
    title: 'Sanahirviö',
    description: 'Löydä pitkiä sanoja (10 kirjainta tai yli)',
    unit: 'sanaa',
    tiers: makeTiers([5, 20, 50, 100, 500]),
  },
  {
    id: 'full_board',
    category: 'Täydet kennot',
    title: 'Täyteen, kiitos!',
    description: 'Löydä kaikki sanat (Täysi kenno)',
    unit: 'kertaa',
    tiers: makeTiers([2, 5, 10, 20, 50]),
  },
  {
    id: 'unassisted_master',
    category: 'Ilman apuja',
    title: 'Omin siivin',
    description: 'Saavuta Ällistyttävä-taso vihjeittä',
    unit: 'kertaa',
    tiers: makeTiers([1, 3, 8, 15, 25]),
  },
] as const;

export interface PlayerAchievementProgress {
  id: AchievementId;
  category: string;
  title: string;
  description: string;
  unit: string;
  currentValue: number;
  unlockedTier: number; // 0 (none) to 5 (master)
  currentTier: AchievementTier | null;
  nextTier: AchievementTier | null;
  nextTierTarget: number | null;
  progressPct: number;
  isCompleted: boolean;
  tiers: readonly AchievementTier[];
}

/**
 * Pure evaluation function computing player achievement progress across all categories.
 */
export function evaluateAchievements(
  stats: PlayerStats,
  streak: { current: number; best: number },
): PlayerAchievementProgress[] {
  const records = stats.records ?? [];

  const streakValue = Math.max(streak.current, streak.best);
  const totalWords = records.reduce((sum, r) => sum + (r.words_found ?? 0), 0);
  const totalPangrams = records.reduce((sum, r) => sum + (r.pangrams_found ?? 0), 0);
  const totalLongWords = records.reduce((sum, r) => {
    const count = typeof r.long_words_count === 'number' ? r.long_words_count : 0;
    const fallback = (r.longest_word?.length ?? 0) >= 10 ? 1 : 0;
    return sum + Math.max(count, fallback);
  }, 0);

  const fullBoards = records.reduce((sum, r) => {
    const isFull =
      r.best_rank === 'Täysi kenno' || (r.max_score > 0 && r.best_score >= r.max_score);
    return isFull ? sum + 1 : sum;
  }, 0);

  const unassistedMasterCount = records.reduce((sum, r) => {
    const noHint = bestNoHintScoreForRecord(r);
    const reachedThreshold = r.max_score > 0 && noHint >= Math.ceil(0.7 * r.max_score);
    const reachedRank = r.hints_used === 0 && rankIndex(r.best_rank) >= rankIndex('Ällistyttävä');
    return reachedThreshold || reachedRank ? sum + 1 : sum;
  }, 0);

  const valueMap: Record<AchievementId, number> = {
    streak: streakValue,
    total_words: totalWords,
    pangrams: totalPangrams,
    long_word: totalLongWords,
    full_board: fullBoards,
    unassisted_master: unassistedMasterCount,
  };

  return ACHIEVEMENT_DEFINITIONS.map((def) => {
    const currentValue = valueMap[def.id] ?? 0;
    let unlockedTier = 0;

    for (let i = 0; i < def.tiers.length; i++) {
      const tier = def.tiers[i];
      if (tier && currentValue >= tier.target) {
        unlockedTier = i + 1;
      } else {
        break;
      }
    }

    const isCompleted = unlockedTier === def.tiers.length;
    const currentTier = unlockedTier > 0 ? (def.tiers[unlockedTier - 1] ?? null) : null;
    const nextTier = !isCompleted ? (def.tiers[unlockedTier] ?? null) : null;
    const nextTierTarget = nextTier ? nextTier.target : null;

    let progressPct = 0;
    if (isCompleted) {
      progressPct = 100;
    } else if (nextTierTarget !== null && nextTierTarget > 0) {
      progressPct = Math.min(100, Math.floor((currentValue / nextTierTarget) * 100));
    }

    return {
      id: def.id,
      category: def.category,
      title: def.title,
      description: def.description,
      unit: def.unit,
      currentValue,
      unlockedTier,
      currentTier,
      nextTier,
      nextTierTarget,
      progressPct,
      isCompleted,
      tiers: def.tiers,
    };
  });
}
