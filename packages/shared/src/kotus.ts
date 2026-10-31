import HYPHENATED_WORDS from './hyphenated-words.json';

/**
 * Kotus dictionary URL builder & canonical lemma resolver.
 *
 * Constructs a direct link to a word's entry in the
 * Kielitoimiston sanakirja (kielitoimistonsanakirja.fi),
 * preserving legitimate Finnish hyphenated compound words
 * (e.g. `aamu-uninen`, `e-kirja`).
 */

const KOTUS_BASE = 'https://www.kielitoimistonsanakirja.fi/#/';

const LEMMA_MAP = new Map<string, string>();
for (const lemma of HYPHENATED_WORDS) {
  LEMMA_MAP.set(lemma.replaceAll('-', ''), lemma);
}

/**
 * Resolve a normalized word or lemma to its canonical Kotus lemma form.
 *
 * Example: `getCanonicalLemma('aamuuninen')` -> `'aamu-uninen'`
 */
export function getCanonicalLemma(word: string): string {
  const normalized = word.trim().toLowerCase().replaceAll('-', '');
  return LEMMA_MAP.get(normalized) ?? word.trim().toLowerCase();
}

/** Build the full Kotus dictionary URL for a word or lemma. */
export function buildKotusUrl(word: string): string {
  const canonical = getCanonicalLemma(word);
  return KOTUS_BASE + encodeURIComponent(canonical);
}
