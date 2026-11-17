import {
  ACHIEVEMENT_DEFINITIONS,
  type AchievementDefinition,
  type AchievementId,
  type AchievementTier,
  type AchievementTierKey,
  type AchievementTierName,
} from '@sanakenno/shared';
import { getTierToken } from '../modals/achievementIcons.js';

export type AnnouncementKind = 'gameplay' | 'achievement';

export type AnnouncementCategory =
  'letter_cleared' | 'achievement_unlocked' | 'achievement_progress' | 'no_hint_milestone';

export interface GameplayAnnouncement {
  id: string;
  kind: 'gameplay';
  category: 'letter_cleared' | 'no_hint_milestone';
  title: string;
  subtitle?: string;
  badgeText?: string;
  metaPill?: string;
  durationMs?: number;
}

export interface AchievementAnnouncement {
  id: string;
  kind: 'achievement';
  category: 'achievement_unlocked' | 'achievement_progress';
  achievementId: AchievementId;
  title: string;
  subtitle: string;
  tierKey: AchievementTierKey;
  tierName: AchievementTierName;
  isUnlock?: boolean;
  durationMs?: number;
}

export type Announcement = GameplayAnnouncement | AchievementAnnouncement;

export type AnnouncementInput =
  Omit<GameplayAnnouncement, 'id'> | Omit<AchievementAnnouncement, 'id'>;

export const DEFAULT_GAMEPLAY_ANNOUNCEMENT_MS = 3200;
export const DEFAULT_ACHIEVEMENT_ANNOUNCEMENT_MS = 4500;

export { getTierToken };

declare global {
  interface Window {
    sanakennoAnnounce?: (type?: string, ...args: unknown[]) => AnnouncementInput;
  }
}

/** Format large counts using Finnish thousands grouping, matching AchievementsList. */
export function formatAnnouncementCount(value: number): string {
  return value >= 1000 ? value.toLocaleString('fi-FI') : String(value);
}

function findAchievementDef(idArg: unknown): AchievementDefinition {
  if (typeof idArg === 'string') {
    const match = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === idArg);
    if (match) return match;
  }
  return ACHIEVEMENT_DEFINITIONS[1]!; // Sanasampo default
}

function findTier(def: AchievementDefinition, tierArg: unknown): AchievementTier {
  if (typeof tierArg === 'string') {
    const normalized = tierArg.toLowerCase();
    const match = def.tiers.find(
      (t) => t.key === normalized || t.name.toLowerCase() === normalized,
    );
    if (match) return match;
  } else if (typeof tierArg === 'number') {
    const match = def.tiers.find((t) => t.level === tierArg);
    if (match) return match;
  }
  return def.tiers[0]!;
}

/** Build and enqueue a preview announcement from the DevTools console helper. */
export function triggerConsoleAnnouncement(
  enqueue: (item: AnnouncementInput) => void,
  type: string = 'letter',
  ...args: unknown[]
): AnnouncementInput {
  const kindKey = type.toLowerCase();
  let item: AnnouncementInput;

  if (kindKey === 'achievement' || kindKey === 'unlock') {
    const def = findAchievementDef(args[0] ?? 'total_words');
    const tier = findTier(def, args[1] ?? 'gold');
    const unitSuffix = def.unit ? ` ${def.unit}` : '';
    item = {
      kind: 'achievement',
      category: 'achievement_unlocked',
      achievementId: def.id,
      title: def.title,
      subtitle: `Uusi saavutus · ${formatAnnouncementCount(tier.target)}${unitSuffix}`,
      tierKey: tier.key,
      tierName: tier.name,
      isUnlock: true,
    };
  } else if (kindKey === 'progress') {
    const def = findAchievementDef(args[0] ?? 'streak');
    const current = typeof args[1] === 'number' ? args[1] : 6;
    const target = typeof args[2] === 'number' ? args[2] : 7;
    const tier = findTier(def, args[3] ?? 'bronze');
    const unitSuffix = def.unit ? ` ${def.unit}` : '';
    item = {
      kind: 'achievement',
      category: 'achievement_progress',
      achievementId: def.id,
      title: def.title,
      subtitle: `Edistyminen · ${formatAnnouncementCount(current)} / ${formatAnnouncementCount(target)}${unitSuffix}`,
      tierKey: tier.key,
      tierName: tier.name,
      isUnlock: false,
    };
  } else if (kindKey === 'milestone') {
    const pct = Number(args[0]) === 25 ? 25 : 50;
    const title = pct === 25 ? 'Omin avuin' : 'Avuitta taitava';
    item = {
      kind: 'gameplay',
      category: 'no_hint_milestone',
      badgeText: `${pct} %`,
      title,
      subtitle: `${pct} % pisteistä ilman apuja!`,
      metaPill: `${pct} %`,
    };
  } else {
    const letter =
      typeof args[0] === 'string' && args[0].trim() ? args[0].trim().toUpperCase() : 'K';
    const count = typeof args[1] === 'number' && args[1] > 0 ? args[1] : 7;
    item = {
      kind: 'gameplay',
      category: 'letter_cleared',
      badgeText: letter,
      title: `Kaikki ${letter}-alkuiset sanat löydetty!`,
      metaPill: `${count}/${count}`,
    };
  }

  enqueue(item);
  return item;
}
