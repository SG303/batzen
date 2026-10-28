import { describe, expect, it } from 'vitest';
import { attemptKeys, authenticate, clearFailures, confirmPassword, createUser, takeAttempt } from './auth';

describe('takeAttempt', () => {
	it('allows five attempts, then locks for a minute', () => {
		const keys = attemptKeys('10.0.0.1', 'five');
		const now = 1_000_000;
		for (let i = 0; i < 5; i++) expect(takeAttempt(keys, now)).toBe(0);
		expect(takeAttempt(keys, now)).toBe(60);
		expect(takeAttempt(keys, now + 30_000)).toBe(30);
		expect(takeAttempt(keys, now + 60_000)).toBe(0);
	});

	it('counts before the password is checked, so parallel requests cannot pass the limit', async () => {
		await createUser('parallel', 'correct-horse-1');
		const attempt = async (password: string) => {
			const keys = attemptKeys('10.0.0.2', 'parallel');
			if (takeAttempt(keys)) return 'locked';
			const user = await authenticate('parallel', password);
			if (user) clearFailures(keys);
			return user ? 'ok' : 'wrong';
		};
		const results = await Promise.all(Array.from({ length: 20 }, (_, i) => attempt(`wrong-${i}-password`)));
		expect(results.filter((r) => r === 'wrong')).toHaveLength(5);
		expect(results.filter((r) => r === 'locked')).toHaveLength(15);
		expect(await attempt('correct-horse-1')).toBe('locked');
	});

	it('locks a username for every address', () => {
		const now = 2_000_000;
		for (let i = 0; i < 5; i++) expect(takeAttempt(attemptKeys(`10.1.0.${i}`, 'target'), now)).toBe(0);
		expect(takeAttempt(attemptKeys('10.1.0.99', 'target'), now)).toBe(60);
		expect(takeAttempt(attemptKeys('10.1.0.99', 'someone-else'), now)).toBe(0);
	});

	it('forgets failures after a correct password and after 15 minutes', () => {
		const keys = attemptKeys('10.0.0.3', 'forget');
		const now = 3_000_000;
		for (let i = 0; i < 4; i++) takeAttempt(keys, now);
		clearFailures(keys);
		for (let i = 0; i < 4; i++) expect(takeAttempt(keys, now)).toBe(0);
		expect(takeAttempt(keys, now + 16 * 60_000)).toBe(0);
		for (let i = 0; i < 4; i++) expect(takeAttempt(keys, now + 16 * 60_000)).toBe(0);
		expect(takeAttempt(keys, now + 16 * 60_000)).toBe(60);
	});
});

describe('confirmPassword', () => {
	it('checks the password and is throttled like the login', async () => {
		const id = (await createUser('confirm', 'correct-horse-1'))!;
		const user = { id, username: 'confirm' };
		expect(await confirmPassword(user, '10.0.0.4', 'correct-horse-1')).toBe('ok');
		for (let i = 0; i < 5; i++) expect(await confirmPassword(user, '10.0.0.4', 'wrong-password')).toBe('wrong');
		expect(await confirmPassword(user, '10.0.0.4', 'correct-horse-1')).toEqual({ wait: 60 });
	});
});
