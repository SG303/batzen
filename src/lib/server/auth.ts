import type { Cookies } from '@sveltejs/kit';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, asc, eq, lt, ne, sql } from 'drizzle-orm';
import { db, schema } from './db';

const { users, sessions } = schema;

export type User = { id: number; username: string };

export const SESSION_COOKIE = 'session';
/** A session ends after 30 days without use. */
const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
/** Browsers cap cookie lifetime at 400 days; the server-side expiry is what counts. */
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export const PASSWORD_MIN = 10;

// Passwords

const scryptAsync = promisify(scrypt) as (
	password: string,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number }
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

/** Format: scrypt$N$r$p$<salt base64>$<hash base64>. scripts/reset-password.js writes the same. */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const hash = await scryptAsync(password, salt, KEYLEN, SCRYPT);
	return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algo, n, r, p, salt, hash] = stored.split('$');
	if (algo !== 'scrypt' || !salt || !hash) return false;
	const expected = Buffer.from(hash, 'base64');
	const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, {
		N: Number(n),
		r: Number(r),
		p: Number(p)
	});
	return timingSafeEqual(actual, expected);
}

/** Compared against when the user does not exist, so both cases take the same time. */
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

// Users

export function normalizeUsername(value: string): string {
	return value.trim().toLowerCase();
}

/** Returns an error message, or null when the username is acceptable. */
export function checkUsername(username: string): string | null {
	if (!/^[a-z0-9._-]{2,32}$/.test(username)) {
		return 'Der Benutzername braucht 2 bis 32 Zeichen: Buchstaben a–z, Ziffern, Punkt, Binde- oder Unterstrich.';
	}
	return null;
}

export function checkPassword(password: string, repeat: string): string | null {
	if (password.length < PASSWORD_MIN) return `Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.`;
	if (password.length > 200) return 'Das Passwort darf höchstens 200 Zeichen lang sein.';
	if (password !== repeat) return 'Die beiden Passwörter stimmen nicht überein.';
	return null;
}

export function hasUsers(): boolean {
	return !!db.select({ id: users.id }).from(users).limit(1).get();
}

export function listUsers() {
	return db
		.select({ id: users.id, username: users.username, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
		.from(users)
		.orderBy(asc(users.username))
		.all();
}

/**
 * Returns the new user's id, or null when the name is taken. With `first`, only succeeds while
 * no user exists (first-run setup).
 */
export async function createUser(username: string, password: string, first = false): Promise<number | null> {
	const passwordHash = await hashPassword(password);
	// Checked after hashing, right before the synchronous insert, so two setups cannot both win.
	if (first && hasUsers()) return null;
	const row = db
		.insert(users)
		.values({ username, passwordHash, createdAt: new Date().toISOString() })
		.onConflictDoNothing()
		.returning({ id: users.id })
		.get();
	return row?.id ?? null;
}

/** Deletes a user unless it is the last one. Their sessions go with them. */
export function deleteUser(id: number): boolean {
	return db.transaction((tx) => {
		const count = tx.select({ n: sql<number>`count(*)` }).from(users).get()?.n ?? 0;
		if (count <= 1) return false;
		return tx.delete(users).where(eq(users.id, id)).run().changes > 0;
	});
}

export async function setPassword(userId: number, password: string) {
	const passwordHash = await hashPassword(password);
	db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
}

/** Checks username and password. Returns the user on success. */
export async function authenticate(username: string, password: string): Promise<User | null> {
	const row = db.select().from(users).where(eq(users.username, username)).get();
	const ok = await verifyPassword(password, row?.passwordHash ?? (await dummyHash));
	if (!row || !ok) return null;
	db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, row.id)).run();
	return { id: row.id, username: row.username };
}

export async function checkUserPassword(userId: number, password: string): Promise<boolean> {
	const row = db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId)).get();
	return !!row && (await verifyPassword(password, row.hash));
}

// Sessions

const sessionId = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a session and returns the token for the cookie. */
export function createSession(userId: number): string {
	const token = randomBytes(32).toString('base64url');
	db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
	db.insert(sessions)
		.values({ id: sessionId(token), userId, expiresAt: Date.now() + SESSION_DAYS * DAY })
		.run();
	return token;
}

/** Returns the session's user and extends the session, or null when it is unknown or expired. */
export function validateSession(token: string): (User & { sessionId: string }) | null {
	const id = sessionId(token);
	const row = db
		.select({ id: users.id, username: users.username, expiresAt: sessions.expiresAt })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;

	const now = Date.now();
	if (row.expiresAt < now) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}
	// Extend at most once a day to avoid a write on every request.
	if (row.expiresAt - now < (SESSION_DAYS - 1) * DAY) {
		db.update(sessions).set({ expiresAt: now + SESSION_DAYS * DAY }).where(eq(sessions.id, id)).run();
	}
	return { id: row.id, username: row.username, sessionId: id };
}

export function deleteSession(id: string) {
	db.delete(sessions).where(eq(sessions.id, id)).run();
}

/** Logs a user out everywhere, optionally keeping the current session. */
export function deleteOtherSessions(userId: number, keepId?: string) {
	db.delete(sessions)
		.where(keepId ? and(eq(sessions.userId, userId), ne(sessions.id, keepId)) : eq(sessions.userId, userId))
		.run();
}

/**
 * adapter-node always reports https, but the app also runs over plain http in the home network,
 * where browsers drop Secure cookies. Session cookies are only set and cleared on form posts,
 * whose Origin header (required by hooks.server.ts) tells the real scheme.
 */
function cookieOptions(request: Request) {
	const secure = request.headers.get('origin')?.startsWith('https:') ?? false;
	return { path: '/', httpOnly: true, sameSite: 'lax', secure } as const;
}

export function setSessionCookie(cookies: Cookies, request: Request, token: string) {
	cookies.set(SESSION_COOKIE, token, { ...cookieOptions(request), maxAge: COOKIE_MAX_AGE });
}

export function clearSessionCookie(cookies: Cookies, request: Request) {
	cookies.delete(SESSION_COOKIE, cookieOptions(request));
}

// Throttling failed logins (in memory, per client address)

const MAX_FAILURES = 5;
const LOCK_MS = 60 * 1000;
const failures = new Map<string, { count: number; lockedUntil: number }>();

/** Seconds until the next attempt is allowed, or 0. */
export function lockedFor(key: string): number {
	const entry = failures.get(key);
	if (!entry) return 0;
	const left = entry.lockedUntil - Date.now();
	if (left > 0) return Math.ceil(left / 1000);
	if (entry.lockedUntil) failures.delete(key);
	return 0;
}

export function recordFailure(key: string) {
	const entry = failures.get(key) ?? { count: 0, lockedUntil: 0 };
	entry.count++;
	if (entry.count >= MAX_FAILURES) {
		entry.count = 0;
		entry.lockedUntil = Date.now() + LOCK_MS;
	}
	failures.set(key, entry);
}

export function clearFailures(key: string) {
	failures.delete(key);
}
