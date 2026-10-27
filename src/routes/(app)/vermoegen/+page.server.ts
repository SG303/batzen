import { fail, type ActionFailure } from '@sveltejs/kit';
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

const details = (form: FormData) => ({
	name: f.text(form, 'name', 'Der Name'),
	type: f.assetType(form),
	provider: f.optionalText(form, 'provider'),
	note: f.optionalText(form, 'note', 500)
});

export const actions: Actions = {
	createAsset: ({ request }) =>
		handle(request, (form) => {
			// Validate everything before writing, so a bad balance does not leave an empty asset
			const asset = details(form);
			const version = { from: f.month(form), balance: f.amount(form), ended: false };
			const assetId = repo.saveAsset(asset);
			repo.upsertAssetVersion(assetId, version);
			return { created: assetId };
		}),

	updateAsset: ({ request }) =>
		handle(request, (form) => {
			repo.saveAsset({ id: f.id(form), ...details(form) });
			return { saved: true };
		}),

	deleteAsset: ({ request }) =>
		handle(request, (form) => {
			repo.deleteAsset(f.id(form));
			return { deleted: true };
		}),

	saveVersion: ({ request }) =>
		handle(request, (form) => {
			const ended = form.get('ended') === '1';
			repo.upsertAssetVersion(
				f.id(form, 'assetId'),
				{ from: f.month(form), balance: ended ? 0 : f.amount(form), ended },
				f.optionalId(form, 'versionId')
			);
			return { saved: true };
		}),

	deleteVersion: ({ request }) =>
		handle(request, (form) => {
			repo.deleteAssetVersion(f.id(form));
			return { saved: true };
		})
};
