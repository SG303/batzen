import { fail, redirect } from '@sveltejs/kit';
import {
	attemptKeys,
	authenticate,
	clearFailures,
	createSession,
	hasUsers,
	normalizeUsername,
	setSessionCookie,
	takeAttempt
} from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

/** Only same-site paths, so the login cannot be used to send someone elsewhere. */
function target(url: URL): string {
	const ziel = url.searchParams.get('ziel') ?? '/';
	return ziel.startsWith('/') && !ziel.startsWith('//') && !ziel.startsWith('/\\') ? ziel : '/';
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, target(url));
	if (!hasUsers()) redirect(303, '/einrichten');
	return { theme: locals.theme };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const username = normalizeUsername(String(form.get('username') ?? ''));
		const password = String(form.get('password') ?? '');

		const keys = attemptKeys(getClientAddress(), username);
		const wait = takeAttempt(keys);
		if (wait) {
			return fail(429, { username, error: `Zu viele Fehlversuche. Versuche es in ${wait} Sekunden wieder.` });
		}

		const user = await authenticate(username, password);
		if (!user) return fail(400, { username, error: 'Benutzername oder Passwort ist falsch.' });

		clearFailures(keys);
		setSessionCookie(cookies, request, createSession(user.id));
		redirect(303, target(url));
	}
};
