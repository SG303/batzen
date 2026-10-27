import { describe, expect, it } from 'vitest';
import { parseChanges } from './check-in';
import { applyCheckIn, ensureCategories, loadData, resetAll, saveItem, upsertItemVersion } from './repo';

describe('parseChanges', () => {
	it('reads asset balances and closings', () => {
		expect(
			parseChanges([
				{ target: 'asset', id: 3, action: 'update', amount: 2_115_050, interval: 'null', share: 100, thirteenth: false },
				{ target: 'asset', id: 4, action: 'end' }
			])
		).toEqual([
			{ target: 'asset', id: 3, action: 'update', balance: 2_115_050 },
			{ target: 'asset', id: 4, action: 'end' }
		]);
	});

	it('still reads items and incomes', () => {
		expect(
			parseChanges([
				{ target: 'item', id: 1, action: 'update', amount: 100, interval: 'yearly', share: 50 },
				{ target: 'income', id: 2, action: 'update', amount: 700_000, interval: 'monthly', thirteenth: true }
			])
		).toEqual([
			{ target: 'item', id: 1, action: 'update', amount: 100, interval: 'yearly', share: 50, dueMonth: null },
			{ target: 'income', id: 2, action: 'update', amount: 700_000, interval: 'monthly', thirteenth: true }
		]);
	});

	it('keeps a valid due month and drops it for monthly items', () => {
		expect(
			parseChanges([
				{ target: 'item', id: 1, action: 'update', amount: 100, interval: 'yearly', share: 100, dueMonth: 9 },
				{ target: 'item', id: 2, action: 'update', amount: 100, interval: 'monthly', share: 100, dueMonth: 9 },
				{ target: 'item', id: 3, action: 'update', amount: 100, interval: 'yearly', share: 100, dueMonth: 13 }
			])?.map((c) => 'dueMonth' in c && c.dueMonth)
		).toEqual([9, null, null]);
	});

	it('rejects malformed changes', () => {
		for (const raw of [
			null,
			{},
			[{ target: 'house', id: 1, action: 'end' }],
			[{ target: 'asset', id: 0, action: 'end' }],
			[{ target: 'asset', id: 1, action: 'grow' }],
			[{ target: 'asset', id: 1, action: 'update', amount: -5 }],
			[{ target: 'asset', id: 1, action: 'update', amount: 'viel' }]
		]) {
			expect(parseChanges(raw), JSON.stringify(raw)).toBeNull();
		}
	});
});

describe('applyCheckIn', () => {
	it('stores the due month with a changed amount and clears it when the item ends', () => {
		resetAll();
		ensureCategories();
		const categoryId = loadData().categories[0].id;
		const id = saveItem({ name: 'Steuern', categoryId, kind: 'fixed', note: null });
		upsertItemVersion(id, { from: '2026-01', amount: 1_200_000, interval: 'yearly', share: 100, dueMonth: 9, ended: false });
		applyCheckIn('2027-01', [{ target: 'item', id, action: 'update', amount: 1_250_000, interval: 'yearly', share: 100, dueMonth: 10 }], null);
		applyCheckIn('2028-01', [{ target: 'item', id, action: 'end' }], null);
		expect(loadData().items[0].versions.map((v) => [v.from, v.dueMonth])).toEqual([
			['2026-01', 9],
			['2027-01', 10],
			['2028-01', null]
		]);
	});
});
