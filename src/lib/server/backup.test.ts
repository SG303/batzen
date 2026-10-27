import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { backupName, backupStatus, isDue, listBackups, pruneBackups, runBackup } from './backup';
import { loadSample } from './sample';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'batzen-backup-'));
});

const day = (d: number, hour = 12) => new Date(2026, 9, d, hour, 0);

describe('runBackup', () => {
	it('writes a complete, readable copy of the database', () => {
		loadSample();
		const name = runBackup(dir, day(27, 3));
		expect(name).toBe('batzen-2026-10-27.db');

		const copy = new Database(join(dir, name), { readonly: true });
		expect(copy.prepare('select count(*) as n from items').get()).toEqual({ n: 27 });
		expect(copy.prepare('select count(*) as n from check_ins').get()).toEqual({ n: 5 });
		expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
		copy.close();
		// No temporary file is left behind
		expect(readdirSync(dir)).toEqual([name]);
	});

	it('replaces an earlier backup of the same day', () => {
		runBackup(dir, day(27, 3));
		runBackup(dir, day(27, 15));
		expect(listBackups(dir)).toEqual(['batzen-2026-10-27.db']);
	});

	it('creates the folder if needed', () => {
		const nested = join(dir, 'nas', 'batzen');
		runBackup(nested, day(27));
		expect(listBackups(nested)).toEqual(['batzen-2026-10-27.db']);
	});

	it('keeps only the newest 30 backups', () => {
		for (let d = 1; d <= 31; d++) runBackup(dir, new Date(2026, 9, d, 4));
		runBackup(dir, new Date(2026, 10, 1, 4));
		const names = listBackups(dir);
		expect(names).toHaveLength(30);
		expect(names[0]).toBe('batzen-2026-11-01.db');
		expect(names.at(-1)).toBe('batzen-2026-10-03.db');
	});

	it('reports failures until the next success', () => {
		const file = join(dir, 'not-a-folder');
		writeFileSync(file, '');
		expect(() => runBackup(file, day(27))).toThrow();
		expect(backupStatus().error).toMatch(/EEXIST|ENOTDIR/);
		runBackup(dir, day(27));
		expect(backupStatus().error).toBeNull();
	});
});

describe('pruneBackups', () => {
	it('leaves other files alone', () => {
		for (const name of ['batzen-2026-10-01.db', 'batzen-2026-10-02.db', 'batzen-2026-10-03.db', 'notes.txt', 'batzen.db', 'batzen-2026-10-01.db.bak']) {
			writeFileSync(join(dir, name), '');
		}
		expect(pruneBackups(dir, 2)).toEqual(['batzen-2026-10-01.db']);
		expect(readdirSync(dir).sort()).toEqual([
			'batzen-2026-10-01.db.bak',
			'batzen-2026-10-02.db',
			'batzen-2026-10-03.db',
			'batzen.db',
			'notes.txt'
		]);
	});

	it('never deletes the newest backup', () => {
		writeFileSync(join(dir, 'batzen-2026-10-01.db'), '');
		expect(pruneBackups(dir, 0)).toEqual([]);
	});
});

describe('isDue', () => {
	it('waits for the backup hour', () => {
		expect(isDue(day(27, 2), [], 3)).toBe(false);
		expect(isDue(day(27, 3), [], 3)).toBe(true);
		expect(isDue(day(27, 23), [], 3)).toBe(true);
	});

	it('runs once per day', () => {
		expect(isDue(day(27, 4), [backupName(day(27))], 3)).toBe(false);
		expect(isDue(day(28, 4), [backupName(day(27))], 3)).toBe(true);
	});

	it('names files by the local date', () => {
		expect(backupName(new Date(2026, 0, 5, 0, 30))).toBe('batzen-2026-01-05.db');
		expect(backupName(new Date(2026, 11, 31, 23, 59))).toBe('batzen-2026-12-31.db');
	});
});

describe('listBackups', () => {
	it('is empty for a missing folder', () => {
		expect(listBackups(join(dir, 'missing'))).toEqual([]);
	});
});
