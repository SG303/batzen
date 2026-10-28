import { beforeEach, describe, expect, it } from 'vitest';
import { checkInPerformance } from '#lib/domain.ts';
import {
	applyCheckIn,
	deleteAsset,
	ensureCategories,
	loadData,
	resetAll,
	saveAsset,
	saveItem,
	upsertAssetVersion,
	upsertItemVersion
} from './repo';
import { parseContributions } from './check-in';
import { parseExport, restoreData } from './restore';
import { loadSample } from './sample';

beforeEach(() => {
	resetAll();
	ensureCategories();
});

/** 3a fed by a yearly saving item of CHF 7'200, balance CHF 30'000 from January 2026. */
function setup() {
	const categoryId = loadData().categories[0].id;
	const assetId = saveAsset({ name: 'Säule 3a', type: 'pillar3a', provider: 'VIAC', note: null });
	upsertAssetVersion(assetId, { from: '2026-01', balance: 3_000_000, ended: false });
	const itemId = saveItem({ name: '3. Säule a', categoryId, kind: 'saving', assetId });
	upsertItemVersion(itemId, { from: '2026-01', amount: 720_000, interval: 'yearly', share: 100, dueMonth: null, note: null, ended: false });
	return { assetId, itemId, categoryId };
}

describe('linking saving items to assets', () => {
	it('stores the link and exports it', () => {
		const { assetId } = setup();
		expect(loadData().items[0].assetId).toBe(assetId);
	});

	it('keeps the link only for saving items', () => {
		const { assetId, itemId, categoryId } = setup();
		saveItem({ id: itemId, name: '3. Säule a', categoryId, kind: 'fixed', assetId });
		expect(loadData().items[0].assetId).toBeNull();
	});

	it('removes the link but keeps the item when the asset is deleted', () => {
		const { assetId } = setup();
		deleteAsset(assetId);
		const [item] = loadData().items;
		expect(item.assetId).toBeNull();
		expect(item.versions).toHaveLength(1);
	});
});

describe('check-in with contributions', () => {
	it('stores the confirmed contributions in the snapshot and shows the market performance', () => {
		const { assetId } = setup();
		const first = applyCheckIn('2026-03', [], null);
		// Paid nothing in yet, although the budget plans CHF 600 a month
		const second = applyCheckIn(
			'2026-09',
			[{ target: 'asset', id: assetId, action: 'update', balance: 3_150_000 }],
			null,
			new Map([[assetId, 0]])
		);

		const data = loadData();
		const [a, b] = [first, second].map((id) => data.checkIns.find((c) => c.id === id)!);
		expect(a.snapshot!.assets![0].contributions).toBeUndefined();
		expect(b.snapshot!.assets![0].contributions).toEqual({ since: '2026-03', amount: 0 });
		expect(checkInPerformance(b, a, data)).toEqual([
			{ id: assetId, name: 'Säule 3a', before: 3_000_000, after: 3_150_000, paidIn: 0, market: 150_000 }
		]);
	});

	it('ignores contributions for assets the check-in does not ask about', () => {
		const { assetId } = setup();
		const konto = saveAsset({ name: 'Privatkonto', type: 'account', provider: null, note: null });
		upsertAssetVersion(konto, { from: '2026-01', balance: 500_000, ended: false });

		// No previous check-in yet: nothing to compare with
		const first = applyCheckIn('2026-03', [], null, new Map([[assetId, 100]]));
		// The Privatkonto is not fed by a saving item; asset 999 does not exist
		const second = applyCheckIn('2026-09', [], null, new Map([[assetId, 360_000], [konto, 100], [999, 100]]));

		const data = loadData();
		const stored = (id: number) =>
			data.checkIns.find((c) => c.id === id)!.snapshot!.assets!.map((x) => [x.name, x.contributions]);
		expect(stored(first)).toEqual([
			['Privatkonto', undefined],
			['Säule 3a', undefined]
		]);
		expect(stored(second)).toEqual([
			['Privatkonto', undefined],
			['Säule 3a', { since: '2026-03', amount: 360_000 }]
		]);
	});

	it('asks nothing for an asset closed in the same check-in', () => {
		const { assetId } = setup();
		applyCheckIn('2026-03', [], null);
		const id = applyCheckIn('2026-09', [{ target: 'asset', id: assetId, action: 'end' }], null, new Map([[assetId, 100]]));
		expect(loadData().checkIns.find((c) => c.id === id)!.snapshot!.assets).toEqual([]);
	});
});

describe('parseContributions', () => {
	it('reads asset IDs and amounts in Rappen', () => {
		expect(parseContributions([{ id: 3, amount: 352_800 }, { id: '4', amount: 0 }])).toEqual(
			new Map([[3, 352_800], [4, 0]])
		);
		expect(parseContributions([])).toEqual(new Map());
	});

	it('rejects malformed contributions', () => {
		for (const raw of [null, {}, [null], [{ id: 0, amount: 1 }], [{ id: 1, amount: -1 }], [{ id: 1, amount: 1.5 }], [{ id: 1, amount: 'viel' }]]) {
			expect(parseContributions(raw), JSON.stringify(raw)).toBeNull();
		}
	});
});

describe('sample data and restore', () => {
	beforeEach(() => loadSample());

	const exported = (): any => JSON.parse(JSON.stringify({ exportedAt: '2026-10-27T08:00:00.000Z', ...loadData() }));

	it('links the sample savings and confirms lumpy 3a payments', () => {
		const data = loadData();
		const names = Object.fromEntries(data.assets.map((a) => [a.id, a.name]));
		expect(data.items.filter((i) => i.assetId).map((i) => [i.name, names[i.assetId!]])).toEqual([
			['3. Säule a', 'Säule 3a'],
			['Global ETF', 'Wertschriftendepot']
		]);
		const [prev, last] = data.checkIns.slice(-2);
		const perf = Object.fromEntries(checkInPerformance(last, prev, data).map((p) => [p.name, p]));
		// 3a paid in December: CHF 45'300 → 53'900 with CHF 7'258 paid in
		expect(perf['Säule 3a']).toMatchObject({ before: 4_530_000, after: 5_390_000, paidIn: 725_800, market: 134_200 });
		// ETF: planned 7 months × CHF 600
		expect(perf['Wertschriftendepot']).toMatchObject({ paidIn: 420_000, market: 590_000 - 420_000 });
	});

	it('restores links and contributions exactly', () => {
		const before = loadData();
		const file = exported();
		resetAll();
		restoreData(parseExport(file));
		expect(loadData()).toEqual(before);
	});

	it('rejects broken links and contributions and names the entry', () => {
		const linked = (r: any) => r.items.findIndex((i: any) => i.assetId);
		const withContribution = (r: any) => r.checkIns.findIndex((c: any) => c.snapshot.assets.some((a: any) => a.contributions));
		const cases: [string, (raw: any) => string | void][] = [
			['assetId', (r) => {
				const i = linked(r);
				r.items[i].assetId = 9999;
				return `items[${i}].assetId`;
			}],
			['assetId type', (r) => {
				const i = linked(r);
				r.items[i].assetId = 'Säule 3a';
				return `items[${i}].assetId`;
			}],
			['contributions amount', (r) => {
				const c = withContribution(r);
				const a = r.checkIns[c].snapshot.assets.findIndex((x: any) => x.contributions);
				r.checkIns[c].snapshot.assets[a].contributions.amount = 'viel';
				return `checkIns[${c}].snapshot.assets[${a}].contributions.amount`;
			}],
			['contributions since', (r) => {
				const c = withContribution(r);
				const a = r.checkIns[c].snapshot.assets.findIndex((x: any) => x.contributions);
				r.checkIns[c].snapshot.assets[a].contributions.since = '2026';
				return `checkIns[${c}].snapshot.assets[${a}].contributions.since`;
			}]
		];
		for (const [label, change] of cases) {
			const raw = exported();
			const at = change(raw);
			expect(() => parseExport(raw), label).toThrow(`(${at})`);
		}
	});
});
