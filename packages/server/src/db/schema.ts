import type { Generated } from 'kysely';

export interface PuzzlesTable {
  slot: Generated<number>;
  letters: string;
  center_letter: string;
  words: string;
  max_score: number;
  pangrams: string;
  hint_data: string | null;
  created_at: Generated<string>;
  deleted_at: string | null;
}

export interface ConfigTable {
  key: string;
  value: string;
}

export interface Database {
  puzzles: PuzzlesTable;
  config: ConfigTable;
}
