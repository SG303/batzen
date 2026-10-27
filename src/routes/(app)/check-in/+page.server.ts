import { fail, redirect } from '@sveltejs/kit';
import { applyCheckIn, deleteCheckIn, updateCheckInNote, type CheckInChange } from '#lib/server/repo.ts';
import { parseChanges, parseContributions } from '#lib/server/check-in.ts';
import type { Actions } from './$types';

function note(form: FormData): string | null {
	const value = String(form.get('note') ?? '').trim().slice(0, 2000);
	return value || null;
}

export const actions: Actions = {
	apply: async ({ request }) => {
		const form = await request.formData();
		const asOf = String(form.get('asOf') ?? '');
		if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(asOf)) return fail(400, { error: 'Ungültiger Stichtag.' });
		let changes: CheckInChange[] | null = null;
		let contributions: Map<number, number> | null = null;
		try {
			changes = parseChanges(JSON.parse(String(form.get('changes') ?? '[]')));
			contributions = parseContributions(JSON.parse(String(form.get('contributions') ?? '[]')));
		} catch {
			changes = null;
		}
		if (!changes || !contributions) return fail(400, { error: 'Die Änderungen konnten nicht gelesen werden.' });
		const id = applyCheckIn(asOf, changes, note(form), contributions);
		redirect(303, `/?jahr=${asOf.slice(0, 4)}&stand=${id}`);
	},

	updateNote: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Check-in nicht gefunden.' });
		updateCheckInNote(id, note(form));
		return { saved: true };
	},

	delete: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Check-in nicht gefunden.' });
		deleteCheckIn(id);
		const back = String(form.get('back') ?? '/');
		redirect(303, back.startsWith('/') && !back.startsWith('//') ? back : '/');
	}
};
