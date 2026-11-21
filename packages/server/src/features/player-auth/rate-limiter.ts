import { createHash } from 'node:crypto';
import type { Context } from 'hono';

export interface SlidingWindowOptions {
  windowMs: number;
  maxRequests: number;
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 5000;

export class SlidingWindowRateLimiter {
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly maxEntries: number;
  private readonly entries = new Map<string, number[]>();
  private lastPruneMs = Date.now();

  constructor(options: SlidingWindowOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  isAllowed(key: string, now = Date.now()): boolean {
    this.maybePrune(now);

    const cutoff = now - this.windowMs;
    const existing = this.entries.get(key);
    const active = existing ? existing.filter((ts) => ts > cutoff) : [];

    if (active.length >= this.maxRequests) {
      if (active.length > 0) {
        this.entries.set(key, active);
      } else {
        this.entries.delete(key);
      }
      return false;
    }

    active.push(now);
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(key, active);
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
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.entries.entries()) {
      const active = timestamps.filter((ts) => ts > cutoff);
      if (active.length === 0) {
        this.entries.delete(key);
      } else if (active.length !== timestamps.length) {
        this.entries.set(key, active);
      }
    }
    this.lastPruneMs = now;
  }

  private maybePrune(now: number): void {
    if (now - this.lastPruneMs >= this.windowMs) {
      this.prune(now);
    }
  }
}

export function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length > 0) {
      const rawHops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10);
      const hops = Number.isFinite(rawHops) && rawHops >= 1 ? rawHops : 1;
      const idx = Math.max(0, parts.length - hops);
      return parts[idx]!;
    }
  }
  return c.req.header('x-real-ip')?.trim() || 'unknown';
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
