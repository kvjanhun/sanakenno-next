import type { Generated } from 'kysely';

export interface PuzzlesTable {
  slot: Generated<number>;
  letters: string;
  center: string;
  is_active: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface ConfigTable {
  key: string;
  value: string;
}

export interface Database {
  puzzles: PuzzlesTable;
  config: ConfigTable;
}
