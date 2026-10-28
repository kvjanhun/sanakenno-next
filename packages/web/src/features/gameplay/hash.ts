/**
 * Compute the lowercase SHA-256 hex digest of a word using Web Crypto API.
 */
export async function hashWord(word: string): Promise<string> {
  const data = new TextEncoder().encode(word);
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
