import {
  createClient,
  type Client,
  type InValue,
  type ResultSet,
  type Transaction,
} from '@libsql/client';
import {
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
} from 'kysely';

export { createClient as createLibsqlClient, type Client as LibsqlClient };

export interface LibsqlDialectConfig {
  url?: string;
  authToken?: string;
  client?: Client;
}

function toPlainRows<R>(result: ResultSet): R[] {
  const { columns, rows } = result;
  const plainRows: R[] = new Array(rows.length);

  for (let i = 0; i < rows.length; i += 1) {
    const rawRow = rows[i]!;
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < columns.length; j += 1) {
      obj[columns[j]!] = rawRow[j];
    }
    plainRows[i] = obj as R;
  }

  return plainRows;
}

/**
 * Single Kysely DatabaseConnection backed by `@libsql/client`.
 * Holds transaction state per acquired connection so concurrent queries stay isolated.
 */
export class LibsqlConnection implements DatabaseConnection {
  readonly #client: Client;
  #tx: Transaction | null = null;

  constructor(client: Client) {
    this.#client = client;
  }

  async beginTransaction(): Promise<void> {
    this.#tx = await this.#client.transaction('write');
    await this.#tx.execute('PRAGMA foreign_keys = ON');
  }

  async commitTransaction(): Promise<void> {
    if (!this.#tx) {
      throw new Error('Cannot commit: no active libSQL transaction');
    }
    const tx = this.#tx;
    this.#tx = null;
    await tx.commit();
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.#tx) {
      return;
    }
    const tx = this.#tx;
    this.#tx = null;
    await tx.rollback();
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const args: InValue[] = compiledQuery.parameters.map((param) =>
      param === undefined ? null : (param as InValue),
    );
    const executor = this.#tx ?? this.#client;
    const result = await executor.execute({
      sql: compiledQuery.sql,
      args,
    });

    return {
      insertId: result.lastInsertRowid != null ? BigInt(result.lastInsertRowid) : undefined,
      numAffectedRows: BigInt(result.rowsAffected),
      rows: toPlainRows<R>(result),
    };
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('LibsqlConnection does not support streaming queries');
  }
}

/**
 * Kysely Driver over `@libsql/client` with `BEGIN IMMEDIATE` (`write`) transaction semantics
 * and `PRAGMA foreign_keys = ON` enforcement.
 */
export class LibsqlDriver implements Driver {
  readonly #client: Client;

  constructor(config: LibsqlDialectConfig) {
    if (config.client) {
      this.#client = config.client;
    } else if (config.url) {
      this.#client = createClient({
        url: config.url,
        authToken: config.authToken,
      });
    } else {
      throw new Error('LibsqlDialect requires either a `url` or an injected `client`');
    }
  }

  async init(): Promise<void> {
    await this.#client.execute('PRAGMA foreign_keys = ON');
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new LibsqlConnection(this.#client);
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as LibsqlConnection).beginTransaction();
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as LibsqlConnection).commitTransaction();
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as LibsqlConnection).rollbackTransaction();
  }

  async releaseConnection(): Promise<void> {
    // Connections are lightweight wrappers over the shared libSQL Client.
  }

  async destroy(): Promise<void> {
    this.#client.close();
  }
}

/**
 * Repo-owned Kysely SQLite dialect backed directly by `@libsql/client`.
 */
export class LibsqlDialect implements Dialect {
  readonly #config: LibsqlDialectConfig;

  constructor(config: LibsqlDialectConfig) {
    this.#config = config;
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new LibsqlDriver(this.#config);
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }
}
