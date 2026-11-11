import { createHash } from 'node:crypto';
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

const TRANSFER_CREATE_RATE_LIMIT = 3;
const TRANSFER_CREATE_WINDOW_MS = 15 * 60 * 1000;
export const transferCreateLimiter = new SlidingWindowRateLimiter({
  windowMs: TRANSFER_CREATE_WINDOW_MS,
  maxRequests: TRANSFER_CREATE_RATE_LIMIT,
});

interface EmailRateEntry {
  lastSentMs: number;
  dailyCount: number;
  dailyDate: string;
}

const emailRateLimitMap = new Map<string, EmailRateEntry>();
const EMAIL_COOLDOWN_MS = 10 * 60 * 1000;
const EMAIL_DAILY_LIMIT = 10;

export function resetTransferCreateRateLimit(): void {
  transferCreateLimiter.reset();
}

export function resetEmailRateLimit(): void {
  emailRateLimitMap.clear();
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

export function checkEmailRateLimit(email: string): {
  allowed: boolean;
  error?: string;
} {
  const key = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
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
    emailRateLimitMap.set(key, {
      lastSentMs: now,
      dailyCount: 1,
      dailyDate: today,
    });
  }
  return { allowed: true };
}
