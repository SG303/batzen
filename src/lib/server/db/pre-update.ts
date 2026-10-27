import type Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const FILE = /^batzen-before-update-[\dT-]+\.db$/;

/** How many copies from before updates are kept */
export const PRE_UPDATE_KEEP = 5;

/** True if the migrations folder has migrations the database has not applied yet. */
export function hasPendingMigrations(sqlite: Database.Database, migrationsFolder: string): boolean {
	const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'));
	const latest = Math.max(...journal.entries.map((e: { when: number }) => e.when));
	const table = sqlite
		.prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
		.get();
	// A new database has nothing worth keeping
	if (!table) return false;
	const row = sqlite.prepare('select max(created_at) as at from __drizzle_migrations').get() as {
		at: number | null;
	};
	return Number(row.at ?? 0) < latest;
}

/**
 * Copies the database to `<dir>/batzen-before-update-YYYY-MM-DDTHHMM.db` when an update brings
 * migrations, so a release that damages the data can be undone. Keeps the newest PRE_UPDATE_KEEP
 * copies; the nightly backups in the same folder are left alone. Returns the file name or null.
 */
export function backupBeforeMigrations(
	sqlite: Database.Database,
	migrationsFolder: string,
	dir: string,
	now = new Date()
): string | null {
	if (!hasPendingMigrations(sqlite, migrationsFolder)) return null;
	mkdirSync(dir, { recursive: true });
	const pad = (n: number) => String(n).padStart(2, '0');
	const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}`;
	const name = `batzen-before-update-${stamp}.db`;
	rmSync(join(dir, name), { force: true });
	sqlite.prepare('VACUUM INTO ?').run(join(dir, name));
	const old = readdirSync(dir).filter((n) => FILE.test(n)).sort().reverse().slice(PRE_UPDATE_KEEP);
	for (const n of old) rmSync(join(dir, n));
	return name;
}
