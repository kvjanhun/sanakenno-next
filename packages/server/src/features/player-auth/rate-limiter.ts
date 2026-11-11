import { createHash } from 'node:crypto';
import type { Context } from 'hono';

export interface SlidingWindowOptions {
  windowMs: number;
  maxRequests: number;
}

interface WindowEntry {
  count: number;
  windowStartMs: number;
}

export class SlidingWindowRateLimiter {
  readonly windowMs: number;
  readonly maxRequests: number;
  private readonly entries = new Map<string, WindowEntry>();
  private lastPruneMs = Date.now();

  constructor(options: SlidingWindowOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
  }

  isAllowed(key: string, now = Date.now()): boolean {
    this.maybePrune(now);
    const entry = this.entries.get(key);

    if (!entry || now - entry.windowStartMs >= this.windowMs) {
      this.entries.set(key, { count: 1, windowStartMs: now });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  reset(): void {
    this.entries.clear();
    this.lastPruneMs = Date.now();
  }

  get size(): number {
    return this.entries.size;
  }

  cleanup(now = Date.now()): void {
    this.prune(now);
  }

  prune(now = Date.now()): void {
    for (const [key, entry] of this.entries.entries()) {
      if (now - entry.windowStartMs >= this.windowMs) {
        this.entries.delete(key);
      }
    }
    this.lastPruneMs = now;
  }

  private maybePrune(now: number): void {
    // Opportunistic prune if at least windowMs has elapsed since last prune or entries map is large
    if (now - this.lastPruneMs >= this.windowMs || this.entries.size > 1000) {
      this.prune(now);
    }
  }
}

export function getClientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

export function getRateLimitKey(c: Context, prefix?: string): string {
  const auth = c.req.header('Authorization') || c.req.header('authorization');
  let key: string;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) {
      const hash = createHash('sha256').update(token).digest('hex');
      key = `token:${hash}`;
    } else {
      key = `ip:${getClientIp(c)}`;
    }
  } else {
    key = `ip:${getClientIp(c)}`;
  }
  return prefix ? `${prefix}:${key}` : key;
}
