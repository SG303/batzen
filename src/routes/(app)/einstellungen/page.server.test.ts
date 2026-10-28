import { beforeAll, describe, expect, it } from 'vitest';
import { createUser, listUsers } from '#lib/server/auth.ts';
import { actions } from './+page.server';

/** Calls a form action the way SvelteKit does, signed in as `user`. */
function post(
	action: keyof typeof actions,
	user: { id: number; username: string },
	fields: Record<string, string>,
	client = '10.2.0.1'
) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const request = new Request('http://localhost/einstellungen', { method: 'POST', body });
	const locals = { user: { ...user, sessionId: 'test' } };
	return (actions[action] as (e: unknown) => unknown)({ request, locals, getClientAddress: () => client });
}

const names = () => listUsers().map((u) => u.username);

describe('Benutzer form actions', () => {
	const admin = { id: 0, username: 'admin' };
	beforeAll(async () => {
		admin.id = (await createUser('admin', 'correct-horse-1'))!;
	});

	it('adds a user only with the own password', async () => {
		const fields = { username: 'neu', password: 'start-password-1' };
		expect(await post('addUser', admin, { ...fields, current: 'wrong-password' })).toMatchObject({
			status: 400,
			data: { users: 'Dein Passwort stimmt nicht.' }
		});
		expect(await post('addUser', admin, fields)).toMatchObject({ status: 400 });
		expect(names()).toEqual(['admin']);

		expect(await post('addUser', admin, { ...fields, current: 'correct-horse-1' })).toEqual({
			usersDone: 'Benutzer «neu» hinzugefügt.'
		});
		expect(names()).toEqual(['admin', 'neu']);
	});

	it('deletes a user only with the own password and keeps the confirmation open', async () => {
		const id = (await createUser('weg', 'start-password-1'))!;
		expect(await post('deleteUser', admin, { id: String(id), current: 'wrong-password' })).toMatchObject({
			status: 400,
			data: { users: 'Dein Passwort stimmt nicht.', deleting: id }
		});
		expect(names()).toContain('weg');

		expect(await post('deleteUser', admin, { id: String(id), current: 'correct-horse-1' })).toBeUndefined();
		expect(names()).not.toContain('weg');
	});

	it('locks the confirmation after five wrong passwords', async () => {
		const user = { id: (await createUser('locked', 'correct-horse-1'))!, username: 'locked' };
		const fields = { username: 'versuch', password: 'start-password-1' };
		for (let i = 0; i < 5; i++) await post('addUser', user, { ...fields, current: `wrong-${i}` }, '10.2.0.2');
		expect(await post('addUser', user, { ...fields, current: 'correct-horse-1' }, '10.2.0.2')).toMatchObject({
			status: 400,
			data: { users: 'Zu viele Fehlversuche. Versuche es in 60 Sekunden wieder.' }
		});
		expect(names()).not.toContain('versuch');
	});
});
