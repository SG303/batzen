import { beforeEach, describe, expect, it } from 'vitest';
import { loadData, resetAll } from '#lib/server/repo.ts';
import { actions } from './+page.server';

/** Calls a form action the way SvelteKit does. */
function post(action: keyof typeof actions, fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const request = new Request('http://localhost/vermoegen', { method: 'POST', body });
	return (actions[action] as (e: { request: Request }) => unknown)({ request });
}

const create = (fields: Record<string, string> = {}) =>
	post('createAsset', {
		name: 'Säule 3a',
		type: 'pillar3a',
		provider: ' VIAC ',
		note: 'Globale Aktien',
		amount: "21'150.50",
		from: '2026-06',
		...fields
	});

beforeEach(() => resetAll());

describe('Vermögen form actions', () => {
	it('creates an asset with its first balance', async () => {
		const result: any = await create();
		const [asset] = loadData().assets;
		expect(result.created).toBe(asset.id);
		expect(asset).toMatchObject({ name: 'Säule 3a', type: 'pillar3a', provider: 'VIAC', note: 'Globale Aktien' });
		expect(asset.versions.map((v) => [v.from, v.balance, v.ended])).toEqual([['2026-06', 2_115_050, false]]);
	});

	it('stores blank provider and note as empty', async () => {
		await create({ provider: '  ', note: '' });
		expect(loadData().assets[0]).toMatchObject({ provider: null, note: null });
	});

	it('rejects missing names, amounts and months with a message', async () => {
		expect(await create({ name: ' ' })).toMatchObject({ status: 400, data: { error: 'Der Name fehlt.' } });
		expect(await create({ amount: 'viel' })).toMatchObject({ status: 400 });
		expect(await create({ from: '2026-13' })).toMatchObject({ status: 400, data: { error: 'Wähle einen gültigen Monat.' } });
		expect(loadData().assets).toEqual([]);
	});

	it('falls back to "Weiteres" for an unknown type', async () => {
		await create({ type: 'gold' });
		expect(loadData().assets[0].type).toBe('other');
	});

	it('updates the details', async () => {
		await create();
		const id = String(loadData().assets[0].id);
		await post('updateAsset', { id, name: 'Freizügigkeit', type: 'pension', provider: '', note: '' });
		expect(loadData().assets[0]).toMatchObject({ name: 'Freizügigkeit', type: 'pension', provider: null });
	});

	it('adds balances, replaces a month, closes and deletes', async () => {
		await create();
		const assetId = String(loadData().assets[0].id);
		await post('saveVersion', { assetId, from: '2026-10', amount: '23900' });
		await post('saveVersion', { assetId, from: '2026-10', amount: '24000' });
		await post('saveVersion', { assetId, from: '2026-12', ended: '1' });
		expect(loadData().assets[0].versions.map((v) => [v.from, v.balance, v.ended])).toEqual([
			['2026-06', 2_115_050, false],
			['2026-10', 2_400_000, false],
			['2026-12', 0, true]
		]);

		const ended = loadData().assets[0].versions[2];
		await post('deleteVersion', { id: String(ended.id) });
		expect(loadData().assets[0].versions).toHaveLength(2);

		await post('deleteAsset', { id: assetId });
		expect(loadData().assets).toEqual([]);
	});

	it('moves an existing entry when its month is edited', async () => {
		await create();
		const asset = loadData().assets[0];
		await post('saveVersion', {
			assetId: String(asset.id),
			versionId: String(asset.versions[0].id),
			from: '2026-05',
			amount: '21000'
		});
		expect(loadData().assets[0].versions.map((v) => [v.from, v.balance])).toEqual([['2026-05', 2_100_000]]);
	});
});
