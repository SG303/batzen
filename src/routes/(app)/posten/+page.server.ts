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

/** Name, category, kind and, for saving items, the asset the money goes into. */
function itemDetails(form: FormData) {
	const kind = f.kind(form);
	const assetId = kind === 'saving' ? (f.optionalId(form, 'assetId') ?? null) : null;
	if (assetId && !repo.assetExists(assetId)) throw new f.FormError('Diese Anlage gibt es nicht mehr.');
	return {
		name: f.text(form, 'name', 'Der Name'),
		categoryId: f.id(form, 'categoryId'),
		kind,
		assetId,
		reserve: f.reserve(form)
	};
}

export const actions: Actions = {
	createItem: ({ request }) =>
		handle(request, (form) => {
			// Validate everything before writing, so a bad amount does not leave an empty item
			const item = itemDetails(form);
			const interval = f.interval(form);
			const version = {
				from: f.month(form),
				amount: f.amount(form),
				interval,
				share: f.share(form),
				dueMonth: f.dueMonth(form, interval),
				note: f.itemNote(form),
				ended: false
			};
			const itemId = repo.saveItem(item);
			repo.upsertItemVersion(itemId, version);
			return { created: itemId };
		}),

	updateItem: ({ request }) =>
		handle(request, (form) => {
			repo.saveItem({ id: f.id(form), ...itemDetails(form) });
			return { saved: true };
		}),

	deleteItem: ({ request }) =>
		handle(request, (form) => {
			repo.deleteItem(f.id(form));
			return { deleted: true };
		}),

	saveVersion: ({ request }) =>
		handle(request, (form) => {
			const ended = form.get('ended') === '1';
			const interval = ended ? 'monthly' : f.interval(form);
			repo.upsertItemVersion(
				f.id(form, 'itemId'),
				{
					from: f.month(form),
					amount: ended ? 0 : f.amount(form),
					interval,
					share: ended ? 100 : f.share(form),
					dueMonth: ended ? null : f.dueMonth(form, interval),
					note: ended ? null : f.itemNote(form),
					ended
				},
				f.optionalId(form, 'versionId')
			);
			return { saved: true };
		}),

	deleteVersion: ({ request }) =>
		handle(request, (form) => {
			repo.deleteItemVersion(f.id(form));
			return { saved: true };
		}),

	createIncome: ({ request }) =>
		handle(request, (form) => {
			const source = {
				name: f.text(form, 'name', 'Der Name'),
				type: f.incomeType(form),
				counted: form.get('counted') === 'on'
			};
			const version = {
				from: f.month(form),
				amount: f.amount(form),
				interval: f.interval(form) === 'yearly' ? ('yearly' as const) : ('monthly' as const),
				thirteenth: form.get('thirteenth') === 'on',
				ended: false
			};
			const sourceId = repo.saveIncomeSource(source);
			repo.upsertIncomeVersion(sourceId, version);
			return { created: sourceId };
		}),

	updateIncome: ({ request }) =>
		handle(request, (form) => {
			repo.saveIncomeSource({
				id: f.id(form),
				name: f.text(form, 'name', 'Der Name'),
				type: f.incomeType(form),
				counted: form.get('counted') === 'on'
			});
			return { saved: true };
		}),

	deleteIncome: ({ request }) =>
		handle(request, (form) => {
			repo.deleteIncomeSource(f.id(form));
			return { deleted: true };
		}),

	saveIncomeVersion: ({ request }) =>
		handle(request, (form) => {
			const ended = form.get('ended') === '1';
			repo.upsertIncomeVersion(
				f.id(form, 'sourceId'),
				{
					from: f.month(form),
					amount: ended ? 0 : f.amount(form),
					interval: !ended && f.interval(form) === 'yearly' ? 'yearly' : 'monthly',
					thirteenth: !ended && form.get('thirteenth') === 'on',
					ended
				},
				f.optionalId(form, 'versionId')
			);
			return { saved: true };
		}),

	deleteIncomeVersion: ({ request }) =>
		handle(request, (form) => {
			repo.deleteIncomeVersion(f.id(form));
			return { saved: true };
		})
};
