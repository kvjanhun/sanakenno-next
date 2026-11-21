import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendTransferLink } from '../../packages/server/src/features/player-auth/send-transfer-link.js';

describe('sendTransferLink (Resend email transport)', () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalApiUrl = process.env.RESEND_API_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_URL;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }

    if (originalApiUrl === undefined) {
      delete process.env.RESEND_API_URL;
    } else {
      process.env.RESEND_API_URL = originalApiUrl;
    }
  });

  it('skips network calls when RESEND_API_KEY is unset or set to "test"', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await sendTransferLink('pelaaja@example.com', 'tok+1/2', 'https://sanakenno.fi');
    process.env.RESEND_API_KEY = 'test';
    await sendTransferLink('pelaaja@example.com', 'tok+1/2', 'https://sanakenno.fi');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts formatted transfer email with URL-encoded token and Bearer API key', async () => {
    process.env.RESEND_API_KEY = 're_live_123';
    process.env.RESEND_API_URL = 'https://eu.resend.example';

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }));

    await sendTransferLink('pelaaja@example.com', 'abc+1/2=3', 'https://sanakenno.fi///');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://eu.resend.example/emails');
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer re_live_123');

    const body = JSON.parse(String(init?.body)) as {
      to: string;
      html: string;
      text: string;
    };
    expect(body.to).toBe('pelaaja@example.com');
    expect(body.html).toContain('https://sanakenno.fi/?connect=abc%2B1%2F2%3D3');
    expect(body.html).toContain('https://sanakenno.fi/icons/sanakenno-192x192.png');
    expect(body.text).toContain('https://sanakenno.fi/?connect=abc%2B1%2F2%3D3');
  });

  it('throws descriptive error when Resend returns non-2xx status', async () => {
    process.env.RESEND_API_KEY = 're_live_123';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('rate limited', { status: 429 }),
    );

    await expect(
      sendTransferLink('pelaaja@example.com', 'tok', 'https://sanakenno.fi'),
    ).rejects.toThrow('Transfer link email failed (429): rate limited');
  });
});
