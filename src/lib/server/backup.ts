import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';
import { sqlite } from './db';

/**
 * Nightly database backups. When BACKUP_DIR is set, the app writes a consistent copy of the
 * database to `<BACKUP_DIR>/batzen-YYYY-MM-DD.db` once a day after BACKUP_HOUR (local time,
 * see TZ) and keeps the newest BACKUP_KEEP files. Other files in the folder are left alone.
 */

const FILE = /^batzen-(\d{4}-\d{2}-\d{2})\.db$/;
const CHECK_EVERY = 10 * 60 * 1000;

export const config = {
	dir: env.BACKUP_DIR || null,
	hour: intEnv('BACKUP_HOUR', 3),
	keep: intEnv('BACKUP_KEEP', 30)
};

export interface BackupStatus {
	enabled: boolean;
	keep: number;
	hour: number;
	/** Newest backup file and when it was written */
	latest: { name: string; at: string; size: number } | null;
	count: number;
	/** Set when the last attempt failed; cleared by the next success */
	error: string | null;
}

let lastError: string | null = null;
let started = false;

function intEnv(name: string, fallback: number): number {
	const value = Number(env[name]);
	return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Local calendar date as YYYY-MM-DD. */
function localDate(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function backupName(date: Date): string {
	return `batzen-${localDate(date)}.db`;
}

/** Backup files in the folder, newest first. */
export function listBackups(dir: string): string[] {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	return names.filter((n) => FILE.test(n)).sort().reverse();
}

/** True if today's backup is missing and the backup hour has passed. */
export function isDue(now: Date, existing: string[], hour = config.hour): boolean {
	return now.getHours() >= hour && !existing.includes(backupName(now));
}

/** Deletes all but the newest `keep` backups and returns the deleted names. */
export function pruneBackups(dir: string, keep = config.keep): string[] {
	const old = listBackups(dir).slice(Math.max(keep, 1));
	for (const name of old) rmSync(join(dir, name));
	return old;
}

/**
 * Writes today's backup (replacing one from earlier today) and prunes old ones. The copy is
 * made with VACUUM INTO, which gives a consistent snapshot even while the app is writing, and
 * is checked before it replaces anything.
 */
export function runBackup(dir = config.dir, now = new Date()): string {
	if (!dir) throw new Error('BACKUP_DIR is not set');
	try {
		mkdirSync(dir, { recursive: true });
		const name = backupName(now);
		const tmp = join(dir, `.${name}.tmp`);
		rmSync(tmp, { force: true });
		sqlite.prepare('VACUUM INTO ?').run(tmp);
		const copy = new Database(tmp, { readonly: true });
		try {
			const check = copy.pragma('quick_check', { simple: true });
			if (check !== 'ok') throw new Error(`Backup check failed: ${check}`);
		} finally {
			copy.close();
		}
		renameSync(tmp, join(dir, name));
		pruneBackups(dir);
		lastError = null;
		return name;
	} catch (e) {
		lastError = e instanceof Error ? e.message : String(e);
		throw e;
	}
}

export function backupStatus(): BackupStatus {
	const { dir, keep, hour } = config;
	const names = dir ? listBackups(dir) : [];
	let latest: BackupStatus['latest'] = null;
	if (dir && names[0]) {
		const stat = statSync(join(dir, names[0]));
		latest = { name: names[0], at: stat.mtime.toISOString(), size: stat.size };
	}
	return { enabled: !!dir, keep, hour, latest, count: names.length, error: lastError };
}

/** Starts the backup timer once per process; does nothing without BACKUP_DIR. */
export function startBackups() {
	const dir = config.dir;
	if (!dir || started) return;
	started = true;
	const tick = () => {
		if (!isDue(new Date(), listBackups(dir))) return;
		try {
			console.log(`Backup written: ${join(dir, runBackup(dir))}`);
		} catch (e) {
			console.error('Backup failed:', e);
		}
	};
	tick();
	setInterval(tick, CHECK_EVERY).unref();
	console.log(`Nightly backups to ${dir} after ${config.hour}:00, keeping ${config.keep}`);
}
