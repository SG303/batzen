import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { backupBeforeMigrations, hasPendingMigrations, PRE_UPDATE_KEEP } from './pre-update';

let dir: string;
let sqlite: Database.Database;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'batzen-pre-update-'));
	sqlite = new Database(':memory:');
});

/** A copy of the migrations folder without the newest migration, like the previous release. */
function previousRelease(): string {
	const folder = join(dir, 'previous');
	cpSync('drizzle', folder, { recursive: true });
	const path = join(folder, 'meta/_journal.json');
	const journal = JSON.parse(readFileSync(path, 'utf8'));
	journal.entries.pop();
	writeFileSync(path, JSON.stringify(journal));
	return folder;
}

const at = (d: number, minute = 0) => new Date(2026, 9, d, 4, minute);

describe('backupBeforeMigrations', () => {
	it('skips a new database', () => {
		expect(hasPendingMigrations(sqlite, 'drizzle')).toBe(false);
		expect(backupBeforeMigrations(sqlite, 'drizzle', join(dir, 'backups'), at(27))).toBeNull();
	});

	it('skips a database that is up to date', () => {
		migrate(drizzle(sqlite), { migrationsFolder: 'drizzle' });
		expect(backupBeforeMigrations(sqlite, 'drizzle', join(dir, 'backups'), at(27))).toBeNull();
	});

	it('copies a database that an update will migrate', () => {
		migrate(drizzle(sqlite), { migrationsFolder: previousRelease() });
		sqlite.prepare("insert into categories (name, color, sort) values ('Wohnen', 1, 1)").run();

		const backups = join(dir, 'backups');
		const name = backupBeforeMigrations(sqlite, 'drizzle', backups, at(27));
		expect(name).toBe('batzen-before-update-2026-10-27T0400.db');

		const copy = new Database(join(backups, name!), { readonly: true });
		expect(copy.prepare('select name from categories').all()).toEqual([{ name: 'Wohnen' }]);
		copy.close();
	});

	it('keeps only the newest copies and leaves nightly backups alone', () => {
		migrate(drizzle(sqlite), { migrationsFolder: previousRelease() });
		const backups = join(dir, 'backups');
		backupBeforeMigrations(sqlite, 'drizzle', backups, at(1));
		writeFileSync(join(backups, 'batzen-2026-10-01.db'), '');
		for (let d = 2; d <= PRE_UPDATE_KEEP + 2; d++) backupBeforeMigrations(sqlite, 'drizzle', backups, at(d));

		const files = readdirSync(backups).sort();
		expect(files).toContain('batzen-2026-10-01.db');
		expect(files.filter((n) => n.includes('before-update'))).toHaveLength(PRE_UPDATE_KEEP);
		expect(files).not.toContain('batzen-before-update-2026-10-01T0400.db');
	});
});
