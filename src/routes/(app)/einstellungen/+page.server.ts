import { fail, redirect } from '@sveltejs/kit';
import {
	deleteCategory,
	ensureCategories,
	moveCategory,
	resetAll,
	saveCategory
} from '#lib/server/repo.ts';
import { loadSample } from '#lib/server/sample.ts';
import { parseExport, restoreData, RestoreError } from '#lib/server/restore.ts';
import { backupStatus, runBackup } from '#lib/server/backup.ts';
import {
	checkPassword,
	checkUsername,
	checkUserPassword,
	clearSessionCookie,
	createUser,
	deleteOtherSessions,
	deleteSession,
	deleteUser,
	listUsers,
	normalizeUsername,
	setPassword
} from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ users: listUsers(), backup: backupStatus() });

export const actions: Actions = {
	logout: ({ locals, cookies, request }) => {
		if (locals.user) deleteSession(locals.user.sessionId);
		clearSessionCookie(cookies, request);
		redirect(303, '/anmelden');
	},
	changePassword: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		if (!(await checkUserPassword(user.id, String(form.get('current') ?? '')))) {
			return fail(400, { account: 'Das aktuelle Passwort stimmt nicht.' });
		}
		const error = checkPassword(password, String(form.get('repeat') ?? ''));
		if (error) return fail(400, { account: error });
		await setPassword(user.id, password);
		deleteOtherSessions(user.id, user.sessionId);
		return { accountDone: 'Passwort geändert. Andere Geräte sind jetzt abgemeldet.' };
	},
	addUser: async ({ request }) => {
		const form = await request.formData();
		const username = normalizeUsername(String(form.get('username') ?? ''));
		const password = String(form.get('password') ?? '');
		const error = checkUsername(username) ?? checkPassword(password, password);
		if (error) return fail(400, { users: error, username });
		if (!(await createUser(username, password))) {
			return fail(400, { users: `Den Benutzer «${username}» gibt es schon.`, username });
		}
		return { usersDone: `Benutzer «${username}» hinzugefügt.` };
	},
	deleteUser: async ({ request, locals }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (id === locals.user!.id) return fail(400, { users: 'Du kannst dein eigenes Konto nicht löschen.' });
		if (!deleteUser(id)) return fail(400, { users: 'Das letzte Konto kann nicht gelöscht werden.' });
	},
	sample: () => {
		loadSample();
		redirect(303, '/');
	},
	backup: () => {
		if (!backupStatus().enabled) return fail(400);
		try {
			return { backupDone: `Gesichert als ${runBackup()}.` };
		} catch (e) {
			return fail(500, { backupError: e instanceof Error ? e.message : String(e) });
		}
	},
	restore: async ({ request }) => {
		const file = (await request.formData()).get('file');
		if (!(file instanceof File) || !file.size) return fail(400, { restore: 'Wähle eine Exportdatei aus.' });
		let raw: unknown;
		try {
			raw = JSON.parse(await file.text());
		} catch {
			return fail(400, { restore: 'Diese Datei ist kein Batzen-Export.' });
		}
		try {
			const data = parseExport(raw);
			restoreData(data);
			const exportedAt = (raw as { exportedAt?: unknown }).exportedAt;
			const date = typeof exportedAt === 'string' && !isNaN(Date.parse(exportedAt))
				? ` vom ${new Date(exportedAt).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}`
				: '';
			return {
				restoreDone: `Stand${date} wiederhergestellt: ${count(data.items.length, 'Posten', 'Posten')}, ${count(data.incomes.length, 'Einkommen', 'Einkommen')} und ${count(data.checkIns.length, 'Check-in', 'Check-ins')}.`
			};
		} catch (e) {
			if (e instanceof RestoreError) return fail(400, { restore: e.message });
			throw e;
		}
	},
	reset: async ({ request }) => {
		const form = await request.formData();
		if (form.get('confirm') !== 'LÖSCHEN') {
			return fail(400, { reset: 'Tippe LÖSCHEN ein, um alle Daten zu entfernen.' });
		}
		resetAll();
		ensureCategories();
		redirect(303, '/');
	},
	saveCategory: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const color = Number(form.get('color'));
		const id = Number(form.get('id')) || undefined;
		if (!name) return fail(400, { category: 'Gib der Kategorie einen Namen.' });
		saveCategory({ id, name, color: color >= 1 && color <= 8 ? color : 1 });
	},
	deleteCategory: async ({ request }) => {
		const form = await request.formData();
		if (!deleteCategory(Number(form.get('id')))) {
			return fail(400, {
				category: 'Diese Kategorie enthält noch Posten. Verschiebe sie zuerst in eine andere Kategorie.'
			});
		}
	},
	moveCategory: async ({ request }) => {
		const form = await request.formData();
		moveCategory(Number(form.get('id')), form.get('direction') === 'up' ? -1 : 1);
	}
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
