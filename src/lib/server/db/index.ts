import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from 'node:process';
import * as schema from './schema';

const path = env.DATABASE_PATH ?? 'data/batzen.db';
mkdirSync(dirname(path), { recursive: true });

/** The raw connection, for things Drizzle does not cover (backups). */
export const sqlite = new Database(path);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: env.MIGRATIONS_PATH ?? 'drizzle' });

export { schema };
