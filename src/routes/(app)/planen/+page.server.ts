import { fail, redirect, type ActionFailure } from '@sveltejs/kit';
import * as repo from '#lib/server/repo.ts';
import * as f from '#lib/server/forms.ts';
import type { Actions } from './$types';

/** Runs an action and turns validation errors into a form failure. */
async function handle<T>(
	request: Request,
	run: (form: FormData) => T
): Promise<T | ActionFailure<{ error: string }>> {
	const form = await request.formData();
	try {
		return run(form);
	} catch (e) {
		if (e instanceof f.FormError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	saveGoal: ({ request }) =>
		handle(request, (form) => {
			const assetId = f.optionalId(form, 'assetId') ?? null;
			if (assetId && !repo.assetExists(assetId)) throw new f.FormError('Diese Anlage gibt es nicht mehr.');
			const target = f.optionalAmount(form, 'target');
			if (!target) throw new f.FormError('Gib einen Zielbetrag ein, zum Beispiel 8000.');
			repo.saveGoal({
				id: f.optionalId(form, 'id'),
				name: f.text(form, 'name', 'Der Name'),
				target,
				due: f.month(form, 'due'),
				assetId,
				saved: assetId ? 0 : (f.optionalAmount(form, 'saved') ?? 0)
			});
			return { saved: true };
		}),

	deleteGoal: ({ request }) =>
		handle(request, (form) => {
			repo.deleteGoal(f.id(form));
			return { deleted: true };
		}),

	createScenario: async ({ request }) => {
		const result = await handle(request, (form) =>
			repo.saveScenario({ name: f.text(form, 'name', 'Der Name'), note: null })
		);
		if (typeof result !== 'number') return result;
		redirect(303, `/planen/${result}`);
	}
};
