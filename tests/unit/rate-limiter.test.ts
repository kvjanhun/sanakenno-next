import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  getClientIp,
  getRateLimitKey,
  SlidingWindowRateLimiter,
} from '../../packages/server/src/features/player-auth/rate-limiter.js';

function sha256(val: string): string {
  return createHash('sha256').update(val).digest('hex');
}

describe('SlidingWindowRateLimiter', () => {
  it('allows requests up to the configured limit within a sliding window', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxRequests: 3 });
    const key = 'user:123';
    const baseTime = 1_000_000;

    expect(limiter.isAllowed(key, baseTime)).toBe(true);
    expect(limiter.isAllowed(key, baseTime + 10_000)).toBe(true);
    expect(limiter.isAllowed(key, baseTime + 20_000)).toBe(true);

    // 4th request within 60s should be blocked
    expect(limiter.isAllowed(key, baseTime + 30_000)).toBe(false);
    expect(limiter.isAllowed(key, baseTime + 59_999)).toBe(false);

    // After 60s expires from window start, a new request starts a fresh window
    expect(limiter.isAllowed(key, baseTime + 60_001)).toBe(true);
  });

  it('isolates different keys independently', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    const time = 1_000_000;

    expect(limiter.isAllowed('keyA', time)).toBe(true);
    expect(limiter.isAllowed('keyA', time)).toBe(true);
    expect(limiter.isAllowed('keyA', time)).toBe(false);

    // keyB is unaffected by keyA
    expect(limiter.isAllowed('keyB', time)).toBe(true);
    expect(limiter.isAllowed('keyB', time)).toBe(true);
    expect(limiter.isAllowed('keyB', time)).toBe(false);
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

describe('Rate Limiter Key Extraction & IP Parsing', () => {
  it('extracts client IP from Cloudflare header first', () => {
    const mockContext = {
      req: {
        header: (name: string) => {
          if (name === 'cf-connecting-ip') return '203.0.113.1';
          if (name === 'x-forwarded-for') return '198.51.100.2, 10.0.0.1';
          return undefined;
        },
      },
    } as unknown as Parameters<typeof getClientIp>[0];

    expect(getClientIp(mockContext)).toBe('203.0.113.1');
  });

  it('extracts client IP from X-Forwarded-For left-most address', () => {
    const mockContext = {
      req: {
        header: (name: string) => {
          if (name === 'x-forwarded-for') return '198.51.100.42, 10.0.0.1';
          return undefined;
        },
      },
    } as unknown as Parameters<typeof getClientIp>[0];

    expect(getClientIp(mockContext)).toBe('198.51.100.42');
  });

  it('prioritizes Bearer session token over IP in getRateLimitKey', () => {
    const token = 'abcdef123456';
    const expectedHash = sha256(token);

    const mockContextWithAuth = {
      req: {
        header: (name: string) => {
          if (name.toLowerCase() === 'authorization') return `Bearer ${token}`;
          if (name === 'cf-connecting-ip') return '203.0.113.1';
          return undefined;
        },
      },
    } as unknown as Parameters<typeof getRateLimitKey>[0];

    expect(getRateLimitKey(mockContextWithAuth, 'transfer')).toBe(`transfer:token:${expectedHash}`);

    const mockContextNoAuth = {
      req: {
        header: (name: string) => {
          if (name === 'cf-connecting-ip') return '203.0.113.1';
          return undefined;
        },
      },
    } as unknown as Parameters<typeof getRateLimitKey>[0];

    expect(getRateLimitKey(mockContextNoAuth, 'transfer')).toBe('transfer:ip:203.0.113.1');
  });
});
