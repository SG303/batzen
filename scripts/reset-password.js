// Sets a new random password for a user and logs them out everywhere.
// Usage: node scripts/reset-password.js <username>
// In Docker: docker compose exec batzen node scripts/reset-password.js <username>
import Database from 'better-sqlite3';
import { randomBytes, scryptSync } from 'node:crypto';
import { env, argv, exit } from 'node:process';

const db = new Database(env.DATABASE_PATH ?? 'data/batzen.db');
db.pragma('foreign_keys = ON');

const usernames = () =>
	db.prepare('SELECT username FROM users ORDER BY username').all().map((u) => u.username);

const username = argv[2]?.trim().toLowerCase();
if (!username) {
	console.error('Usage: node scripts/reset-password.js <username>');
	console.error(`Users: ${usernames().join(', ') || '(none)'}`);
	exit(1);
}

const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (!user) {
	console.error(`No user "${username}". Users: ${usernames().join(', ') || '(none)'}`);
	exit(1);
}

// Same format as hashPassword() in src/lib/server/auth.ts
const password = randomBytes(9).toString('base64url');
const salt = randomBytes(16);
const [N, r, p] = [16384, 8, 1];
const hash = scryptSync(password, salt, 64, { N, r, p });
const stored = ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');

db.transaction(() => {
	db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(stored, user.id);
	db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
})();

console.log(`New password for "${username}": ${password}`);
console.log('Log in with it and change it under Einstellungen > Konto.');
