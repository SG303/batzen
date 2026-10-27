import { fail, redirect } from '@sveltejs/kit';
import {
	checkPassword,
	checkUsername,
	createSession,
	createUser,
	hasUsers,
	normalizeUsername,
	setSessionCookie
} from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

/** First run only: creates the first account. Afterwards accounts are managed in the settings. */
export const load: PageServerLoad = ({ locals }) => {
	if (hasUsers()) redirect(303, '/anmelden');
	return { theme: locals.theme };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		if (hasUsers()) redirect(303, '/anmelden');
		const form = await request.formData();
		const username = normalizeUsername(String(form.get('username') ?? ''));
		const password = String(form.get('password') ?? '');

		const error =
			checkUsername(username) ?? checkPassword(password, String(form.get('repeat') ?? ''));
		if (error) return fail(400, { username, error });

		const id = await createUser(username, password, true);
		if (!id) redirect(303, '/anmelden');

		setSessionCookie(cookies, request, createSession(id));
		redirect(303, '/');
	}
};
