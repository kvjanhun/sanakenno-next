import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Finnish alphabet characters accepted in Sanakenno (a–ö, including å). */
export const FINNISH_LETTERS = new Set('abcdefghijklmnopqrstuvwxyzåäö'.split(''));

export interface WordlistFilterStats {
  totalInputLines: number;
  filteredCount: number;
  hyphenatedCompoundCount: number;
  prefixesDropped: number;
  suffixesDropped: number;
  spacesDropped: number;
  digitsDropped: number;
  shortWordsDropped: number;
  invalidCharsDropped: number;
}

export interface FilterResult {
  words: string[];
  hyphenatedWords: string[];
  stats: WordlistFilterStats;
}

/**
 * Filter raw Kotus dictionary entries according to Sanakenno rules.
 */
export function filterKotusWordlist(rawContent: string): FilterResult {
  const lines = rawContent.split(/\r?\n/).filter(Boolean);
  const dataLines = lines[0]?.startsWith('Hakusana\t') ? lines.slice(1) : lines;

  const uniqueWords = new Set<string>();
  const stats: WordlistFilterStats = {
    totalInputLines: dataLines.length,
    filteredCount: 0,
    hyphenatedCompoundCount: 0,
    prefixesDropped: 0,
    suffixesDropped: 0,
    spacesDropped: 0,
    digitsDropped: 0,
    shortWordsDropped: 0,
    invalidCharsDropped: 0,
  };

  for (const line of dataLines) {
    const rawWord = line.split('\t')[0];
    if (!rawWord) continue;

    const word = rawWord.replaceAll('\u2011', '-').trim().toLowerCase();

    if (word.startsWith('-')) {
      stats.suffixesDropped += 1;
      continue;
    }
    if (word.endsWith('-')) {
      stats.prefixesDropped += 1;
      continue;
    }
    if (word.includes(' ')) {
      stats.spacesDropped += 1;
      continue;
    }
    if (/[0-9]/.test(word)) {
      stats.digitsDropped += 1;
      continue;
    }

    const unhyphenated = word.replaceAll('-', '');
    if (unhyphenated.length < 4) {
      stats.shortWordsDropped += 1;
      continue;
    }

    let hasInvalidChar = false;
    for (const ch of word) {
      if (ch !== '-' && !FINNISH_LETTERS.has(ch)) {
        hasInvalidChar = true;
        break;
      }
    }
    if (hasInvalidChar) {
      stats.invalidCharsDropped += 1;
      continue;
    }

    uniqueWords.add(word);
  }

  const sortedWords = Array.from(uniqueWords).sort((a, b) => a.localeCompare(b, 'fi'));
  const hyphenatedWords = sortedWords.filter((w) => w.includes('-'));

  stats.filteredCount = sortedWords.length;
  stats.hyphenatedCompoundCount = hyphenatedWords.length;

  return {
    words: sortedWords,
    hyphenatedWords,
    stats,
  };
}

function run(): void {
  const rootDir = path.resolve(import.meta.dirname, '..');
  const inputPath = path.join(rootDir, 'packages/server/assets/nykysuomensanalista2024.txt');
  const outputKotusWords = path.join(rootDir, 'packages/server/assets/kotus_words.txt');
  const outputHyphenatedJson = path.join(rootDir, 'packages/shared/src/hyphenated-words.json');

  console.log(`Reading ${inputPath}...`);
  const raw = readFileSync(inputPath, 'utf8');
  const result = filterKotusWordlist(raw);

  console.log('Filtering stats:', result.stats);

  console.log(`Writing ${result.words.length} entries to ${outputKotusWords}...`);
  writeFileSync(outputKotusWords, `${result.words.join('\n')}\n`, 'utf8');

  console.log(
    `Writing ${result.hyphenatedWords.length} hyphenated lemmas to ${outputHyphenatedJson}...`,
  );
  writeFileSync(
    outputHyphenatedJson,
    `${JSON.stringify(result.hyphenatedWords, null, 2)}\n`,
    'utf8',
  );

  console.log('Wordlist filtering complete!');
}

const isMain = process.argv[1]?.endsWith('filter-kotus-wordlist.ts');
if (isMain) {
  run();
}
