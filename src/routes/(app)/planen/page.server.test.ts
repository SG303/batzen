import { beforeEach, describe, expect, it } from 'vitest';
import { compareScenario } from '#lib/domain.ts';
import { deleteAsset, getScenario, loadData, resetAll, saveScenario } from '#lib/server/repo.ts';
import { loadSample } from '#lib/server/sample.ts';
import { actions } from './+page.server';
import { actions as scenarioActions, load } from './[id]/+page.server';

function request(fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return new Request('http://localhost/planen', { method: 'POST', body });
}

function post(action: keyof typeof actions, fields: Record<string, string>) {
	return (actions[action] as (e: { request: Request }) => unknown)({ request: request(fields) });
}

function postScenario(action: keyof typeof scenarioActions, id: number, fields: Record<string, string> = {}) {
	const run = scenarioActions[action] as (e: { request: Request; params: { id: string } }) => unknown;
	return run({ request: request(fields), params: { id: String(id) } });
}

/** Actions that redirect throw the redirect; returns its location. */
async function redirected(run: () => unknown): Promise<string> {
	try {
		await run();
	} catch (e) {
		return (e as { location: string }).location;
	}
	throw new Error('no redirect');
}

beforeEach(() => {
	resetAll();
	loadSample();
});

describe('goals', () => {
	it('creates a goal without an asset and with an amount saved by hand', async () => {
		resetAll();
		expect(await post('saveGoal', { name: 'Velo', target: '2400', due: '2027-03', saved: '300' })).toEqual({ saved: true });
		expect(loadData().goals).toEqual([{ id: expect.any(Number), name: 'Velo', target: 240_000, due: '2027-03', assetId: null, saved: 30_000 }]);
	});

	it('links a goal to an asset and ignores the amount saved by hand then', async () => {
		const asset = loadData().assets.find((a) => a.name === 'Säule 3a')!;
		await post('saveGoal', { name: '3a voll', target: '100000', due: '2030-12', assetId: String(asset.id), saved: '500' });
		expect(loadData().goals.find((g) => g.name === '3a voll')).toMatchObject({ assetId: asset.id, saved: 0 });
	});

	it('edits and deletes a goal', async () => {
		const goal = loadData().goals[0];
		await post('saveGoal', { id: String(goal.id), name: 'Neu', target: '1000', due: '2028-01' });
		expect(loadData().goals.find((g) => g.id === goal.id)).toMatchObject({ name: 'Neu', target: 100_000, due: '2028-01', assetId: null });
		await post('deleteGoal', { id: String(goal.id) });
		expect(loadData().goals.some((g) => g.id === goal.id)).toBe(false);
	});

	it('refuses goals without target, month or with an unknown asset', async () => {
		resetAll();
		expect(await post('saveGoal', { name: 'Velo', target: '', due: '2027-03' })).toMatchObject({ status: 400 });
		expect(await post('saveGoal', { name: 'Velo', target: '0', due: '2027-03' })).toMatchObject({ status: 400 });
		expect(await post('saveGoal', { name: 'Velo', target: '100', due: 'bald' })).toMatchObject({ status: 400 });
		expect(await post('saveGoal', { name: 'Velo', target: '100', due: '2027-03', assetId: '999' })).toMatchObject({ status: 400 });
		expect(loadData().goals).toEqual([]);
	});

	it('keeps a goal when its asset is deleted, without the link', () => {
		const goal = loadData().goals.find((g) => g.assetId !== null)!;
		deleteAsset(goal.assetId!);
		expect(loadData().goals.find((g) => g.id === goal.id)?.assetId).toBeNull();
	});
});

describe('scenarios', () => {
	const ids = () => {
		const data = loadData();
		return {
			lohn: data.incomes.find((s) => s.name === 'Lohn')!.id,
			miete: data.items.find((i) => i.name === 'Miete mit Parkplatz')!.id,
			auto: data.items.find((i) => i.name === 'Auto')!.id,
			category: data.categories[0].id
		};
	};

	it('creates a scenario and opens it', async () => {
		const location = await redirected(() => post('createScenario', { name: 'Sabbatical' }));
		const id = Number(location.split('/').at(-1));
		expect(location).toBe(`/planen/${id}`);
		expect(getScenario(id)).toEqual({ id, name: 'Sabbatical', note: null, changes: [] });
		expect(await post('createScenario', { name: ' ' })).toMatchObject({ status: 400 });
	});

	it('adds, replaces and deletes changes', async () => {
		const { lohn, miete, auto, category } = ids();
		const id = saveScenario({ name: 'Test', note: null });
		await postScenario('saveChange', id, { what: `income:${lohn}`, mode: 'percent', value: '80' });
		await postScenario('saveChange', id, { what: `item:${miete}`, mode: 'amount', value: "3'100" });
		await postScenario('saveChange', id, { what: `item:${auto}`, mode: 'remove' });
		await postScenario('saveChange', id, { what: 'newItem', name: 'GA', categoryId: String(category), kind: 'fixed', amount: '3995', interval: 'yearly', share: '100' });
		await postScenario('saveChange', id, { what: 'newIncome', name: 'Nebenjob', amount: '800', interval: 'monthly' });
		expect(getScenario(id)!.changes).toEqual([
			{ type: 'change', target: 'income', id: lohn, mode: 'percent', value: 80 },
			{ type: 'change', target: 'item', id: miete, mode: 'amount', value: 310_000 },
			{ type: 'remove', target: 'item', id: auto },
			{ type: 'addItem', name: 'GA', categoryId: category, kind: 'fixed', amount: 399_500, interval: 'yearly', share: 100 },
			{ type: 'addIncome', name: 'Nebenjob', amount: 80_000, interval: 'monthly', thirteenth: false }
		]);

		// A second change to the same income replaces the first in place, also when not editing it
		await postScenario('saveChange', id, { what: `income:${lohn}`, mode: 'percent', value: '60' });
		// Editing by index keeps the position
		await postScenario('saveChange', id, { index: '1', what: `item:${miete}`, mode: 'percent', value: '110' });
		await postScenario('deleteChange', id, { index: '2' });
		expect(getScenario(id)!.changes.map((c) => (c.type === 'change' ? c.value : c.type))).toEqual([60, 110, 'addItem', 'addIncome']);
	});

	it('refuses invalid changes and changes nothing', async () => {
		const { lohn } = ids();
		const id = saveScenario({ name: 'Test', note: null });
		for (const fields of <Record<string, string>[]>[
			{ what: 'item:999', mode: 'remove' },
			{ what: `income:${lohn}`, mode: 'percent', value: 'viel' },
			{ what: `income:${lohn}`, mode: 'amount', value: '' },
			{ what: 'newItem', name: 'GA', categoryId: '999', amount: '100' },
			{ what: 'newIncome', name: '', amount: '100' },
			{ what: 'something' }
		]) {
			expect(await postScenario('saveChange', id, fields), JSON.stringify(fields)).toMatchObject({ status: 400 });
		}
		expect(getScenario(id)!.changes).toEqual([]);
	});

	it('renames, copies and deletes a scenario', async () => {
		const original = loadData().scenarios[1];
		await postScenario('saveScenario', original.id, { name: 'Zürich', note: 'Wohnung am See' });
		expect(getScenario(original.id)).toMatchObject({ name: 'Zürich', note: 'Wohnung am See' });

		const location = await redirected(() => postScenario('copyScenario', original.id));
		const copy = getScenario(Number(location.split('/').at(-1)))!;
		expect(copy).toMatchObject({ name: 'Zürich (Kopie)', note: 'Wohnung am See', changes: original.changes });

		expect(await redirected(() => postScenario('deleteScenario', copy.id))).toBe('/planen');
		expect(getScenario(copy.id)).toBeNull();
		expect(await postScenario('saveChange', copy.id, { what: 'item:1', mode: 'remove' })).toMatchObject({ status: 404 });
	});

	it('answers unknown scenarios with 404', () => {
		const run = load as unknown as (e: { params: { id: string } }) => unknown;
		expect(() => run({ params: { id: '999' } })).toThrow();
		expect(() => run({ params: { id: 'abc' } })).toThrow();
	});

	it('keeps working when an item of a scenario is deleted later', () => {
		const scenario = loadData().scenarios[1];
		const { auto } = ids();
		resetAll();
		loadSample();
		// The sample is rebuilt with new IDs; the old references point nowhere now
		const c = compareScenario(loadData(), scenario.changes.map((x) => ('id' in x && x.id === auto ? { ...x, id: 9999 } : x)), '2026-10');
		expect(c.effects.some((e) => e.name === null && !e.active)).toBe(true);
	});
});
