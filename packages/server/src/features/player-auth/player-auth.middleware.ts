import { createHash } from 'node:crypto';
import { getHelsinkiDateString } from '@sanakenno/shared';
import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { validatePlayerToken, type PlayerSessionData } from './player-auth.queries.js';
import { getClientIp, getRateLimitKey, SlidingWindowRateLimiter } from './rate-limiter.js';

export { getClientIp, getRateLimitKey };

export type PlayerVariables = {
  player: PlayerSessionData;
  playerToken: string;
};

function extractBearerToken(c: Context): string | null {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Create Hono middleware that requires a valid non-expired player Bearer session token.
 */
export function requirePlayerAuth(
  db: Kysely<Database>,
): MiddlewareHandler<{ Variables: PlayerVariables }> {
  return async (c: Context, next: Next) => {
    const token = extractBearerToken(c);
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const player = await validatePlayerToken(db, token);
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('player', player);
    c.set('playerToken', token);
    await next();
  };
}

const INIT_PLAYER_RATE_LIMIT = 20;
const INIT_PLAYER_WINDOW_MS = 15 * 60 * 1000;
const initPlayerLimiter = new SlidingWindowRateLimiter({
  windowMs: INIT_PLAYER_WINDOW_MS,
  maxRequests: INIT_PLAYER_RATE_LIMIT,
});

const TRANSFER_CREATE_RATE_LIMIT = 3;
const TRANSFER_CREATE_WINDOW_MS = 15 * 60 * 1000;
const transferCreateLimiter = new SlidingWindowRateLimiter({
  windowMs: TRANSFER_CREATE_WINDOW_MS,
  maxRequests: TRANSFER_CREATE_RATE_LIMIT,
});

const TRANSFER_USE_RATE_LIMIT = 10;
const TRANSFER_USE_WINDOW_MS = 15 * 60 * 1000;
const transferUseLimiter = new SlidingWindowRateLimiter({
  windowMs: TRANSFER_USE_WINDOW_MS,
  maxRequests: TRANSFER_USE_RATE_LIMIT,
});

const TRANSFER_TICKET_RATE_LIMIT = 10;
const TRANSFER_TICKET_WINDOW_MS = 15 * 60 * 1000;
const transferTicketLimiter = new SlidingWindowRateLimiter({
  windowMs: TRANSFER_TICKET_WINDOW_MS,
  maxRequests: TRANSFER_TICKET_RATE_LIMIT,
});

interface EmailRateEntry {
  lastSentMs: number;
  dailyCount: number;
  dailyDate: string;
}

const emailRateLimitMap = new Map<string, EmailRateEntry>();
const EMAIL_COOLDOWN_MS = 10 * 60 * 1000;
const EMAIL_DAILY_LIMIT = 10;
const MAX_EMAIL_RATE_ENTRIES = 2000;
let lastEmailPruneMs = Date.now();

function pruneEmailRateLimitMap(now: number, todayHelsinki: string): void {
  for (const [key, entry] of emailRateLimitMap.entries()) {
    if (entry.dailyDate !== todayHelsinki && now - entry.lastSentMs >= EMAIL_COOLDOWN_MS) {
      emailRateLimitMap.delete(key);
    }
  }
  lastEmailPruneMs = now;
}

export function resetInitPlayerRateLimit(): void {
  initPlayerLimiter.reset();
}

export function resetTransferUseRateLimit(): void {
  transferUseLimiter.reset();
}

export function resetTransferTicketRateLimit(): void {
  transferTicketLimiter.reset();
}

export function resetPlayerAuthRateLimits(): void {
  initPlayerLimiter.reset();
  transferCreateLimiter.reset();
  transferUseLimiter.reset();
  transferTicketLimiter.reset();
  emailRateLimitMap.clear();
}

export function resetTransferCreateRateLimit(): void {
  transferCreateLimiter.reset();
  initPlayerLimiter.reset();
  transferUseLimiter.reset();
  transferTicketLimiter.reset();
}

export function initPlayerRateLimit(c: Context, next: Next) {
  const ip = getClientIp(c);
  if (!initPlayerLimiter.isAllowed(ip)) {
    return c.json({ error: 'Liian monta yritystä, odota hetki' }, 429);
  }
  return next();
}

export function resetEmailRateLimit(): void {
  emailRateLimitMap.clear();
  lastEmailPruneMs = Date.now();
}

export function setEmailRateLimitEntry(email: string, entry: EmailRateEntry): void {
  emailRateLimitMap.set(createHash('sha256').update(email.toLowerCase()).digest('hex'), entry);
}

export function transferCreateRateLimit(c: Context, next: Next) {
  const ip = getClientIp(c);
  if (!transferCreateLimiter.isAllowed(ip)) {
    return c.json({ error: 'Liian monta yritystä, odota hetki' }, 429);
  }
  return next();
}

export function transferUseRateLimit(c: Context, next: Next) {
  const ip = getClientIp(c);
  if (!transferUseLimiter.isAllowed(ip)) {
    return c.json({ error: 'Liian monta yritystä, odota hetki' }, 429);
  }
  return next();
}

export function transferTicketRateLimit(c: Context, next: Next) {
  const key = getRateLimitKey(c, 'ticket');
  if (!transferTicketLimiter.isAllowed(key)) {
    return c.json({ error: 'Liian monta yritystä, odota hetki' }, 429);
  }
  return next();
}

export function checkEmailRateLimit(
  email: string,
  now = Date.now(),
): {
  allowed: boolean;
  error?: string;
} {
  const today = getHelsinkiDateString(new Date(now));
  if (now - lastEmailPruneMs >= 60 * 60 * 1000) {
    pruneEmailRateLimitMap(now, today);
  }

  const key = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const entry = emailRateLimitMap.get(key);

  if (entry) {
    if (now - entry.lastSentMs < EMAIL_COOLDOWN_MS) {
      const waitMinutes = Math.ceil((EMAIL_COOLDOWN_MS - (now - entry.lastSentMs)) / 60_000);
      return {
        allowed: false,
        error: `Odota ${waitMinutes} min ennen uuden linkin lähettämistä`,
      };
    }
    const count = entry.dailyDate === today ? entry.dailyCount : 0;
    if (count >= EMAIL_DAILY_LIMIT) {
      return {
        allowed: false,
        error: 'Päivittäinen rajoitus täynnä, yritä huomenna',
      };
    }
    emailRateLimitMap.set(key, {
      lastSentMs: now,
      dailyCount: count + 1,
      dailyDate: today,
    });
  } else {
    if (emailRateLimitMap.size >= MAX_EMAIL_RATE_ENTRIES) {
      pruneEmailRateLimitMap(now, today);
      if (emailRateLimitMap.size >= MAX_EMAIL_RATE_ENTRIES) {
        const oldestKey = emailRateLimitMap.keys().next().value;
        if (oldestKey !== undefined) {
          emailRateLimitMap.delete(oldestKey);
        }
      }
    }
    emailRateLimitMap.set(key, {
      lastSentMs: now,
      dailyCount: 1,
      dailyDate: today,
    });
  }
  return { allowed: true };
}
