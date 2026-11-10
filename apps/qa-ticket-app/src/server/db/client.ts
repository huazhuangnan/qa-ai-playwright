import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as schema from './schema.ts';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseContext {
  db: AppDatabase;
  sqlite: Database.Database;
  close: () => void;
}

export interface CreateDatabaseOptions {
  url?: string;
  runMigrations?: boolean;
}

const appRoot = fileURLToPath(new URL('../../../', import.meta.url));
const migrationsFolder = resolve(appRoot, 'drizzle');

/**
 * Opens a SQLite database and enables the constraints the API relies on.
 */
export function createDatabase(
  options: CreateDatabaseOptions = {},
): DatabaseContext {
  const configuredUrl =
    options.url ?? process.env.DATABASE_URL ?? 'data/qa-ticket.db';
  const databaseFile =
    configuredUrl === ':memory:'
      ? configuredUrl
      : isAbsolute(configuredUrl)
        ? configuredUrl
        : resolve(process.cwd(), configuredUrl);

  if (databaseFile !== ':memory:') {
    mkdirSync(dirname(databaseFile), { recursive: true });
  }

  const sqlite = new Database(databaseFile);
  sqlite.pragma('foreign_keys = ON');
  if (databaseFile !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }

  const db = drizzle(sqlite, { schema });
  if (options.runMigrations !== false) {
    migrate(db, { migrationsFolder });
  }

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
