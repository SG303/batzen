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
		const id = saveItem({ name: 'Steuern', categoryId, kind: 'fixed' });
		upsertItemVersion(id, { from: '2026-01', amount: 1_200_000, interval: 'yearly', share: 100, dueMonth: 9, note: null, ended: false });
		applyCheckIn('2027-01', [{ target: 'item', id, action: 'update', amount: 1_250_000, interval: 'yearly', share: 100, dueMonth: 10 }], null);
		applyCheckIn('2028-01', [{ target: 'item', id, action: 'end' }], null);
		expect(loadData().items[0].versions.map((v) => [v.from, v.dueMonth])).toEqual([
			['2026-01', 9],
			['2027-01', 10],
			['2028-01', null]
		]);
	});
});

describe('applyCheckIn and item notes', () => {
	function setup() {
		resetAll();
		ensureCategories();
		const categoryId = loadData().categories[0].id;
		const id = saveItem({ name: 'Handyabo', categoryId, kind: 'fixed' });
		upsertItemVersion(id, { from: '2025-01', amount: 4_000, interval: 'monthly', share: 100, dueMonth: null, note: 'Anbieter X', ended: false });
		return id;
	}
	const update = (id: number, amount: number) =>
		({ target: 'item', id, action: 'update', amount, interval: 'monthly', share: 100, dueMonth: null }) as const;
	const notes = () => loadData().items[0].versions.map((v) => [v.from, v.amount, v.note]);

	it('lets a new version inherit the note in effect', () => {
		const id = setup();
		applyCheckIn('2026-01', [update(id, 3_500)], null);
		expect(notes()).toEqual([
			['2025-01', 4_000, 'Anbieter X'],
			['2026-01', 3_500, 'Anbieter X']
		]);
	});

	it('keeps the note of a version that already exists for the check-in month', () => {
		const id = setup();
		upsertItemVersion(id, { from: '2026-01', amount: 3_000, interval: 'monthly', share: 100, dueMonth: null, note: 'Anbieter Y', ended: false });
		applyCheckIn('2026-01', [update(id, 3_200)], null);
		expect(notes()).toEqual([
			['2025-01', 4_000, 'Anbieter X'],
			['2026-01', 3_200, 'Anbieter Y']
		]);
	});

	it('inherits from the version before the check-in month, not from a later one', () => {
		const id = setup();
		upsertItemVersion(id, { from: '2027-01', amount: 3_000, interval: 'monthly', share: 100, dueMonth: null, note: 'Anbieter Y', ended: false });
		applyCheckIn('2026-01', [update(id, 3_500)], null);
		expect(notes().map((n) => n[2])).toEqual(['Anbieter X', 'Anbieter X', 'Anbieter Y']);
	});

	it('clears the note when the item is cancelled, also when the month already has a version', () => {
		const id = setup();
		upsertItemVersion(id, { from: '2026-01', amount: 3_000, interval: 'monthly', share: 100, dueMonth: null, note: 'Anbieter Y', ended: false });
		applyCheckIn('2026-01', [{ target: 'item', id, action: 'end' }], null);
		expect(notes()).toEqual([
			['2025-01', 4_000, 'Anbieter X'],
			['2026-01', 0, null]
		]);
	});
});
