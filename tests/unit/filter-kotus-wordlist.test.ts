import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterKotusWordlist } from '../../scripts/filter-kotus-wordlist.js';

describe('Kotus wordlist ingestion & filtering (unit)', () => {
  it('processes raw sample entries according to Finnish normalization rules', () => {
    const sample = [
      'Hakusana\tHomonymia\tSanaluokka\tTaivutustiedot',
      'aamu-uninen\t\tadjektiivi\t38',
      'e-kirja\t\tsubstantiivi\t',
      'ala-\t\tetuliite\t',
      '-lainen\t\tjohdin\t',
      '3D-tulostin\t\tsubstantiivi\t',
      'action elokuva\t\tsubstantiivi\t',
      'aah\t\tinterjektio\t', // < 4 chars
      'lähi‑itä\t\tsubstantiivi\t', // non-breaking hyphen \u2011
      'koti-isä\t\tsubstantiivi\t',
      'invalid@word\t\tsubstantiivi\t',
    ].join('\n');

    const result = filterKotusWordlist(sample);

    expect(result.words).toContain('aamu-uninen');
    expect(result.words).toContain('e-kirja');
    expect(result.words).toContain('lähi-itä');
    expect(result.words).toContain('koti-isä');

    expect(result.words).not.toContain('ala-');
    expect(result.words).not.toContain('-lainen');
    expect(result.words).not.toContain('3D-tulostin');
    expect(result.words).not.toContain('action elokuva');
    expect(result.words).not.toContain('aah');
    expect(result.words).not.toContain('invalid@word');

    expect(result.stats.prefixesDropped).toBe(1);
    expect(result.stats.suffixesDropped).toBe(1);
    expect(result.stats.digitsDropped).toBe(1);
    expect(result.stats.spacesDropped).toBe(1);
    expect(result.stats.shortWordsDropped).toBe(1);
    expect(result.stats.invalidCharsDropped).toBe(1);
  });

  it('filters nykysuomensanalista2024.txt to exactly 102,659 entries and 1,246 unique hyphenated compounds', () => {
    const rawPath = path.resolve(
      import.meta.dirname,
      '../../packages/server/assets/nykysuomensanalista2024.txt',
    );
    const rawContent = fs.readFileSync(rawPath, 'utf8');
    const result = filterKotusWordlist(rawContent);

    expect(result.words).toHaveLength(102659);
    expect(result.hyphenatedWords).toHaveLength(1246);

    // Retains legitimate Finnish hyphenated compounds
    expect(result.words).toContain('aamu-uninen');
    expect(result.words).toContain('e-kirja');
    expect(result.words).toContain('koti-isä');
    expect(result.words).toContain('aika-ajo');

    // Drops prefixes, suffixes, digits, spaces
    expect(result.words).not.toContain('ala-');
    expect(result.words).not.toContain('-lainen');
    expect(result.words).not.toContain('3d-tulostin');
    expect(result.words).not.toContain('4h-kerho');
  });
});
