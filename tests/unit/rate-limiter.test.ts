import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkEmailRateLimit,
  resetEmailRateLimit,
  setEmailRateLimitEntry,
} from '../../packages/server/src/features/player-auth/player-auth.middleware.js';
import {
  getClientIp,
  getRateLimitKey,
  SlidingWindowRateLimiter,
} from '../../packages/server/src/features/player-auth/rate-limiter.js';

function sha256(val: string): string {
  return createHash('sha256').update(val).digest('hex');
}

describe('SlidingWindowRateLimiter', () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
    resetEmailRateLimit();
  });

  it('allows requests up to the configured limit within a true sliding window (blocking boundary bursts)', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxRequests: 3 });
    const key = 'user:123';
    const baseTime = 1_000_000;

    expect(limiter.isAllowed(key, baseTime)).toBe(true);
    expect(limiter.isAllowed(key, baseTime + 40_000)).toBe(true);
    expect(limiter.isAllowed(key, baseTime + 50_000)).toBe(true);

    // 4th request within 60s should be blocked
    expect(limiter.isAllowed(key, baseTime + 59_999)).toBe(false);

    // At +60_001, only the 1st request (at baseTime) has aged out; 2 requests (+40s, +50s) are still inside the 60s sliding window
    expect(limiter.isAllowed(key, baseTime + 60_001)).toBe(true);
    // A 2nd request at +60_002 must be blocked (preventing 2x fixed-window boundary bursts)
    expect(limiter.isAllowed(key, baseTime + 60_002)).toBe(false);

    // Once +40_000 ages out at +100_001, another request is allowed
    expect(limiter.isAllowed(key, baseTime + 100_001)).toBe(true);
  });

  it('isolates different keys independently and bounds map capacity without O(N) scans', () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      maxEntries: 3,
    });
    const time = 1_000_000;

    expect(limiter.isAllowed('keyA', time)).toBe(true);
    expect(limiter.isAllowed('keyA', time)).toBe(true);
    expect(limiter.isAllowed('keyA', time)).toBe(false);

    expect(limiter.isAllowed('keyB', time)).toBe(true);
    expect(limiter.isAllowed('keyC', time)).toBe(true);
    expect(limiter.size).toBe(3);

    // Adding a 4th distinct key evicts the oldest key ('keyA') to stay bounded at maxEntries
    expect(limiter.isAllowed('keyD', time)).toBe(true);
    expect(limiter.size).toBe(3);
  });

  it('cleans up idle keys beyond windowMs to prevent memory leaks', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxRequests: 5 });
    const time = 1_000_000;

    limiter.isAllowed('staleKey', time);
    expect(limiter.size).toBe(1);

    // Before windowMs expires, key is preserved
    limiter.cleanup(time + 30_000);
    expect(limiter.size).toBe(1);

    // After windowMs, cleanup evicts stale key
    limiter.cleanup(time + 65_000);
    expect(limiter.size).toBe(0);
  });

  it('resets all keys on reset()', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    limiter.isAllowed('k1');
    limiter.isAllowed('k2');
    expect(limiter.size).toBe(2);

    limiter.reset();
    expect(limiter.size).toBe(0);
    expect(limiter.isAllowed('k1')).toBe(true);
  });
});

describe('Rate Limiter Key Extraction, Cloud Run IP Parsing & Email Limiter', () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
    resetEmailRateLimit();
  });

  it('ignores spoofed cf-connecting-ip and extracts the rightmost trusted hop from X-Forwarded-For', () => {
    const mockContext = {
      req: {
        header: (name: string) => {
          if (name === 'cf-connecting-ip') return '203.0.113.1';
          if (name === 'x-forwarded-for') return '198.51.100.2, 203.0.113.88';
          return undefined;
        },
      },
    } as unknown as Parameters<typeof getClientIp>[0];

    // Default TRUSTED_PROXY_HOPS=1 (direct Cloud Run Domain Mapping / GFE) -> rightmost entry
    expect(getClientIp(mockContext)).toBe('203.0.113.88');

    // When TRUSTED_PROXY_HOPS=2 (behind GCLB + Serverless NEG) -> 2nd from right
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(getClientIp(mockContext)).toBe('198.51.100.2');
  });

  it('falls back to x-real-ip and unknown when X-Forwarded-For is absent', () => {
    const mockRealIp = {
      req: {
        header: (name: string) => (name === 'x-real-ip' ? '198.51.100.42' : undefined),
      },
    } as unknown as Parameters<typeof getClientIp>[0];
    expect(getClientIp(mockRealIp)).toBe('198.51.100.42');

    const mockUnknown = {
      req: {
        header: () => undefined,
      },
    } as unknown as Parameters<typeof getClientIp>[0];
    expect(getClientIp(mockUnknown)).toBe('unknown');
  });

  it('prioritizes Bearer session token over IP in getRateLimitKey', () => {
    const token = 'abcdef123456';
    const expectedHash = sha256(token);

    const mockContextWithAuth = {
      req: {
        header: (name: string) => {
          if (name.toLowerCase() === 'authorization') return `Bearer ${token}`;
          if (name === 'x-forwarded-for') return '203.0.113.1';
          return undefined;
        },
      },
    } as unknown as Parameters<typeof getRateLimitKey>[0];

    expect(getRateLimitKey(mockContextWithAuth, 'transfer')).toBe(`transfer:token:${expectedHash}`);

    const mockContextNoAuth = {
      req: {
        header: (name: string) => {
          if (name === 'x-forwarded-for') return '198.51.100.9, 203.0.113.1';
          return undefined;
        },
      },
    } as unknown as Parameters<typeof getRateLimitKey>[0];

    expect(getRateLimitKey(mockContextNoAuth, 'transfer')).toBe('transfer:ip:203.0.113.1');
  });

  it('keys daily email limits by Europe/Helsinki date and resets daily count across Helsinki midnight', () => {
    const email = 'test@example.com';
    // 2026-06-15T20:30:00Z is 2026-06-15 23:30 in Helsinki (UTC+3 in summer)
    const beforeHelsinkiMidnight = Date.parse('2026-06-15T20:30:00Z');
    setEmailRateLimitEntry(email, {
      lastSentMs: beforeHelsinkiMidnight - 20 * 60 * 1000,
      dailyCount: 10,
      dailyDate: '2026-06-15',
    });

    // Still 2026-06-15 in Helsinki -> daily cap of 10 is reached
    expect(checkEmailRateLimit(email, beforeHelsinkiMidnight)).toEqual({
      allowed: false,
      error: 'Päivittäinen rajoitus täynnä, yritä huomenna',
    });

    // 2026-06-15T21:30:00Z is 2026-06-16 00:30 in Helsinki (still 2026-06-15 in UTC!) -> new Helsinki day resets count
    const afterHelsinkiMidnight = Date.parse('2026-06-15T21:30:00Z');
    expect(checkEmailRateLimit(email, afterHelsinkiMidnight)).toEqual({
      allowed: true,
    });
  });
});
