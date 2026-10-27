/**
 * Kotus dictionary URL builder.
 *
 * Constructs a direct link to a word's entry in the
 * Kielitoimiston sanakirja (kielitoimistonsanakirja.fi).
 */

const KOTUS_BASE = 'https://www.kielitoimistonsanakirja.fi/#/';

/** Build the full Kotus dictionary URL for a word. */
export function buildKotusUrl(word: string): string {
  return KOTUS_BASE + encodeURIComponent(word);
}
