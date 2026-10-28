import { beforeEach, describe, expect, it } from 'vitest';
import { ensureCategories, loadData, resetAll, saveAsset } from '#lib/server/repo.ts';
import { ITEM_NOTE_MAX } from '#lib/domain.ts';
import { actions } from './+page.server';

function post(action: keyof typeof actions, fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const request = new Request('http://localhost/posten', { method: 'POST', body });
	return (actions[action] as (e: { request: Request }) => unknown)({ request });
}

beforeEach(() => {
	resetAll();
	ensureCategories();
});

describe('creating items and incomes', () => {
	it('writes nothing when the amount or month is invalid', async () => {
		const categoryId = String(loadData().categories[0].id);
		expect(await post('createItem', { name: 'Miete', categoryId, amount: 'viel', from: '2026-01' })).toMatchObject({ status: 400 });
		expect(await post('createItem', { name: 'Miete', categoryId, amount: '100', from: 'gestern' })).toMatchObject({ status: 400 });
		expect(await post('createIncome', { name: 'Lohn', type: 'salary', amount: '', from: '2026-01' })).toMatchObject({ status: 400 });
		expect(loadData().items).toEqual([]);
		expect(loadData().incomes).toEqual([]);
	});

	it('creates an item and an income with their first amount', async () => {
		const categoryId = String(loadData().categories[0].id);
		await post('createItem', { name: 'Miete', categoryId, kind: 'fixed', amount: '2560', interval: 'monthly', share: '50', from: '2026-01' });
		await post('createIncome', { name: 'Lohn', type: 'salary', counted: 'on', amount: '6650', interval: 'monthly', thirteenth: 'on', from: '2026-04' });
		const data = loadData();
		expect(data.items[0].versions.map((v) => [v.from, v.amount, v.share])).toEqual([['2026-01', 256_000, 50]]);
		expect(data.incomes[0].versions.map((v) => [v.from, v.amount, v.thirteenth])).toEqual([['2026-04', 665_000, true]]);
	});
});

describe('linking saving items to assets', () => {
	const fields = (extra: Record<string, string>) => ({
		name: '3. Säule a',
		categoryId: String(loadData().categories[0].id),
		amount: '7258',
		interval: 'yearly',
		from: '2026-01',
		...extra
	});

	it('links a saving item to an asset and changes or removes the link later', async () => {
		const a = saveAsset({ name: 'Säule 3a', type: 'pillar3a', provider: null, note: null });
		const b = saveAsset({ name: 'Depot', type: 'securities', provider: null, note: null });
		await post('createItem', fields({ kind: 'saving', assetId: String(a) }));
		const id = String(loadData().items[0].id);
		expect(loadData().items[0].assetId).toBe(a);

		await post('updateItem', fields({ id, kind: 'saving', assetId: String(b) }));
		expect(loadData().items[0].assetId).toBe(b);
		await post('updateItem', fields({ id, kind: 'saving', assetId: '' }));
		expect(loadData().items[0].assetId).toBeNull();
	});

	it('drops the link when the item is not a saving', async () => {
		const a = saveAsset({ name: 'Säule 3a', type: 'pillar3a', provider: null, note: null });
		await post('createItem', fields({ kind: 'fixed', assetId: String(a) }));
		expect(loadData().items[0].assetId).toBeNull();
	});

	it('refuses an asset that does not exist and writes nothing', async () => {
		expect(await post('createItem', fields({ kind: 'saving', assetId: '999' }))).toMatchObject({ status: 400 });
		expect(loadData().items).toEqual([]);
	});
});

describe('due months and reserve', () => {
	const fields = (extra: Record<string, string>) => ({
		name: 'Steuern',
		categoryId: String(loadData().categories[0].id),
		kind: 'fixed',
		amount: '12000',
		interval: 'yearly',
		from: '2026-01',
		...extra
	});

	it('stores an optional due month only for intervals other than monthly', async () => {
		await post('createItem', fields({ dueMonth: '9' }));
		await post('createItem', fields({ name: 'Ohne', dueMonth: '' }));
		await post('createItem', fields({ name: 'Miete', interval: 'monthly', dueMonth: '9' }));
		const due = Object.fromEntries(loadData().items.map((i) => [i.name, i.versions[0].dueMonth]));
		expect(due).toEqual({ Steuern: 9, Ohne: null, Miete: null });
	});

	it('keeps or changes the due month with a new amount', async () => {
		await post('createItem', fields({ dueMonth: '9' }));
		const itemId = String(loadData().items[0].id);
		await post('saveVersion', { itemId, from: '2027-01', amount: '12500', interval: 'yearly', share: '100', dueMonth: '10' });
		await post('saveVersion', { itemId, from: '2028-01', ended: '1' });
		expect(loadData().items[0].versions.map((v) => [v.from, v.dueMonth])).toEqual([
			['2026-01', 9],
			['2027-01', 10],
			['2028-01', null]
		]);
	});

	it('counts new items towards the reserve unless switched off, and keeps the choice', async () => {
		await post('createItem', fields({}));
		await post('createItem', fields({ name: 'Bonus-3a', reserve: '0' }));
		const [a, b] = loadData().items;
		expect([a.name, a.reserve, b.name, b.reserve]).toEqual(['Bonus-3a', false, 'Steuern', true]);
		await post('updateItem', fields({ id: String(b.id), name: b.name, reserve: '0' }));
		await post('updateItem', fields({ id: String(a.id), name: a.name, reserve: '1' }));
		expect(loadData().items.map((i) => [i.name, i.reserve])).toEqual([['Bonus-3a', true], ['Steuern', false]]);
	});
});

describe('item notes', () => {
	const fields = (extra: Record<string, string>) => ({
		name: 'Handyabo',
		categoryId: String(loadData().categories[0].id),
		kind: 'fixed',
		amount: '30',
		interval: 'monthly',
		from: '2025-01',
		...extra
	});
	const notes = () => loadData().items[0].versions.map((v) => [v.from, v.note]);

	it('keeps the note of every version so a provider change does not overwrite the history', async () => {
		await post('createItem', fields({ note: '  Anbieter X, 5 GB  ' }));
		const itemId = String(loadData().items[0].id);
		await post('saveVersion', { itemId, from: '2026-03', amount: '25', interval: 'monthly', share: '100', note: 'Anbieter Y' });
		expect(notes()).toEqual([
			['2025-01', 'Anbieter X, 5 GB'],
			['2026-03', 'Anbieter Y']
		]);
	});

	it('stores no note when blank or missing, and replaces or clears it when a month is saved again', async () => {
		await post('createItem', fields({ note: '   ' }));
		const itemId = String(loadData().items[0].id);
		expect(notes()).toEqual([['2025-01', null]]);
		const save = (extra: Record<string, string>) =>
			post('saveVersion', { itemId, from: '2025-01', amount: '30', interval: 'monthly', share: '100', ...extra });
		await save({ note: 'Mit Roaming' });
		expect(notes()).toEqual([['2025-01', 'Mit Roaming']]);
		await save({});
		expect(notes()).toEqual([['2025-01', null]]);
	});

	it('drops the note when the item is cancelled', async () => {
		await post('createItem', fields({ note: 'Anbieter X' }));
		const itemId = String(loadData().items[0].id);
		await post('saveVersion', { itemId, from: '2026-01', ended: '1', note: 'Anbieter X' });
		expect(notes()).toEqual([
			['2025-01', 'Anbieter X'],
			['2026-01', null]
		]);
	});

	it('cuts a note at the limit', async () => {
		await post('createItem', fields({ note: 'a'.repeat(ITEM_NOTE_MAX + 50) }));
		expect(loadData().items[0].versions[0].note).toHaveLength(ITEM_NOTE_MAX);
	});

	it('does not touch the notes when the item itself is edited', async () => {
		await post('createItem', fields({ note: 'Anbieter X' }));
		const id = String(loadData().items[0].id);
		await post('updateItem', fields({ id, name: 'Mobile' }));
		expect(loadData().items[0].name).toBe('Mobile');
		expect(notes()).toEqual([['2025-01', 'Anbieter X']]);
	});
});
