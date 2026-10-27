import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env } from 'node:process';
import { backupBeforeMigrations } from './pre-update';
import * as schema from './schema';

const path = env.DATABASE_PATH ?? 'data/batzen.db';
mkdirSync(dirname(path), { recursive: true });

/** The raw connection, for things Drizzle does not cover (backups). */
export const sqlite = new Database(path);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

const migrationsFolder = env.MIGRATIONS_PATH ?? 'drizzle';
// Throws if the copy fails, so an update never migrates without it
if (env.BACKUP_DIR) {
	const name = backupBeforeMigrations(sqlite, migrationsFolder, env.BACKUP_DIR);
	if (name) console.log(`Database copied to ${join(env.BACKUP_DIR, name)} before migrating`);
}
migrate(db, { migrationsFolder });

export { schema };
