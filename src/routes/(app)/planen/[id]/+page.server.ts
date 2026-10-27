import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit';
import type { ScenarioChange } from '#lib/domain.ts';
import * as repo from '#lib/server/repo.ts';
import * as f from '#lib/server/forms.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || !repo.getScenario(id)) error(404, 'Dieses Szenario gibt es nicht.');
	return { id };
};

/** Runs an action on an existing scenario and turns validation errors into a form failure. */
async function handle<T>(
	request: Request,
	params: { id: string },
	run: (form: FormData, scenarioId: number) => T
): Promise<T | ActionFailure<{ error: string }>> {
	const form = await request.formData();
	const scenario = repo.getScenario(Number(params.id));
	if (!scenario) return fail(404, { error: 'Dieses Szenario gibt es nicht mehr.' });
	try {
		return run(form, scenario.id);
	} catch (e) {
		if (e instanceof f.FormError) return fail(400, { error: e.message });
		throw e;
	}
}

/** Same target: a scenario holds at most one change per item or income. */
const sameTarget = (a: ScenarioChange, b: ScenarioChange) =>
	(a.type === 'change' || a.type === 'remove') &&
	(b.type === 'change' || b.type === 'remove') &&
	a.target === b.target &&
	a.id === b.id;

/** Checks that the item, income or category a change refers to exists. */
function checkRefs(change: ScenarioChange) {
	const data = repo.loadData();
	if (change.type === 'addItem' && !data.categories.some((c) => c.id === change.categoryId)) {
		throw new f.FormError('Diese Kategorie gibt es nicht mehr.');
	}
	if (change.type === 'change' || change.type === 'remove') {
		const list = change.target === 'item' ? data.items : data.incomes;
		if (!list.some((x) => x.id === change.id)) throw new f.FormError('Diesen Eintrag gibt es nicht mehr.');
	}
}

export const actions: Actions = {
	saveScenario: ({ request, params }) =>
		handle(request, params, (form, id) => {
			repo.saveScenario({ id, name: f.text(form, 'name', 'Der Name'), note: f.optionalText(form, 'note', 500) });
			return { saved: true };
		}),

	/** Adds a change or replaces the one at `index`. A change to an entry that already has one replaces it in place. */
	saveChange: ({ request, params }) =>
		handle(request, params, (form, id) => {
			const change = f.scenarioChange(form);
			checkRefs(change);
			const changes = [...repo.getScenario(id)!.changes];
			const index = form.get('index') ? Number(form.get('index')) : -1;
			let at = Number.isInteger(index) && index >= 0 && index < changes.length ? index : changes.findIndex((c) => sameTarget(c, change));
			if (at >= 0) changes[at] = change;
			else at = changes.push(change) - 1;
			const kept = changes.filter((c, i) => i === at || !sameTarget(c, change));
			repo.setScenarioChanges(id, kept);
			return { saved: true };
		}),

	deleteChange: ({ request, params }) =>
		handle(request, params, (form, id) => {
			const index = Number(form.get('index'));
			repo.setScenarioChanges(id, repo.getScenario(id)!.changes.filter((_, i) => i !== index));
			return { saved: true };
		}),

	copyScenario: async ({ request, params }) => {
		const result = await handle(request, params, (_, id) =>
			repo.copyScenario(id, `${repo.getScenario(id)!.name} (Kopie)`.slice(0, 200))
		);
		if (typeof result !== 'number') return result;
		redirect(303, `/planen/${result}`);
	},

	deleteScenario: async ({ request, params }) => {
		const result = await handle(request, params, (_, id) => repo.deleteScenario(id));
		if (result) return result;
		redirect(303, '/planen');
	}
};
