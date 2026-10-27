import { beforeEach, describe, expect, it } from 'vitest';
import { summarizeAssets } from '#lib/domain.ts';
import {
	applyCheckIn,
	deleteAsset,
	deleteAssetVersion,
	isEmpty,
	loadData,
	resetAll,
	saveAsset,
	upsertAssetVersion
} from './repo';
import { parseExport, restoreData } from './restore';
import { loadSample } from './sample';

beforeEach(() => resetAll());

const sparkonto = () =>
	saveAsset({ name: 'Sparkonto', type: 'account', provider: 'Kantonalbank', note: null });

describe('asset storage', () => {
	it('stores an asset with its balance timeline', () => {
		const id = saveAsset({ name: 'Depot', type: 'securities', provider: 'Swissquote', note: 'Global ETF, Gold ETF' });
		upsertAssetVersion(id, { from: '2026-01', balance: 1_000_000, ended: false });
		upsertAssetVersion(id, { from: '2026-06', balance: 1_250_000, ended: false });

		const [asset] = loadData().assets;
		expect(asset).toMatchObject({ name: 'Depot', type: 'securities', provider: 'Swissquote', note: 'Global ETF, Gold ETF' });
		expect(asset.versions.map((v) => [v.from, v.balance, v.ended])).toEqual([
			['2026-01', 1_000_000, false],
			['2026-06', 1_250_000, false]
		]);
	});

	it('replaces the balance when a month is saved again', () => {
		const id = sparkonto();
		upsertAssetVersion(id, { from: '2026-01', balance: 1_000_000, ended: false });
		upsertAssetVersion(id, { from: '2026-01', balance: 1_050_000, ended: false });
		expect(loadData().assets[0].versions.map((v) => v.balance)).toEqual([1_050_000]);
	});

	it('moves an entry to another month and replaces an entry that is already there', () => {
		const id = sparkonto();
		upsertAssetVersion(id, { from: '2026-01', balance: 1_000_000, ended: false });
		upsertAssetVersion(id, { from: '2026-03', balance: 1_100_000, ended: false });
		const [first] = loadData().assets[0].versions;

		upsertAssetVersion(id, { from: '2026-02', balance: 1_020_000, ended: false }, first.id);
		expect(loadData().assets[0].versions.map((v) => [v.from, v.balance])).toEqual([
			['2026-02', 1_020_000],
			['2026-03', 1_100_000]
		]);

		upsertAssetVersion(id, { from: '2026-03', balance: 1_030_000, ended: false }, loadData().assets[0].versions[0].id);
		expect(loadData().assets[0].versions.map((v) => [v.from, v.balance])).toEqual([['2026-03', 1_030_000]]);
	});

	it('keeps the timelines of different assets apart', () => {
		const a = sparkonto();
		const b = saveAsset({ name: 'Privatkonto', type: 'account', provider: null, note: null });
		upsertAssetVersion(a, { from: '2026-01', balance: 100, ended: false });
		upsertAssetVersion(b, { from: '2026-01', balance: 200, ended: false });
		expect(loadData().assets.map((x) => x.versions[0].balance).sort()).toEqual([100, 200]);
	});

	it('updates name, type, provider and note without touching the balances', () => {
		const id = sparkonto();
		upsertAssetVersion(id, { from: '2026-01', balance: 1_000_000, ended: false });
		saveAsset({ id, name: 'Notgroschen', type: 'other', provider: null, note: 'Bargeld' });
		expect(loadData().assets[0]).toMatchObject({ name: 'Notgroschen', type: 'other', provider: null, note: 'Bargeld' });
		expect(loadData().assets[0].versions).toHaveLength(1);
	});

	it('closes an asset with an ended entry', () => {
		const id = sparkonto();
		upsertAssetVersion(id, { from: '2026-01', balance: 1_000_000, ended: false });
		upsertAssetVersion(id, { from: '2026-05', balance: 0, ended: true });
		const asset = loadData().assets[0];
		expect(summarizeAssets([asset], '2026-04').total).toBe(1_000_000);
		expect(summarizeAssets([asset], '2026-05').total).toBe(0);
	});

	it('deletes single entries and, with the asset, its whole history', () => {
		const id = sparkonto();
		upsertAssetVersion(id, { from: '2026-01', balance: 1, ended: false });
		upsertAssetVersion(id, { from: '2026-02', balance: 2, ended: false });
		deleteAssetVersion(loadData().assets[0].versions[0].id);
		expect(loadData().assets[0].versions.map((v) => v.balance)).toEqual([2]);

		deleteAsset(id);
		expect(loadData().assets).toEqual([]);
		expect(isEmpty()).toBe(true);
	});

	it('counts assets when checking whether the database is empty', () => {
		expect(isEmpty()).toBe(true);
		sparkonto();
		expect(isEmpty()).toBe(false);
	});

	it('is cleared together with the rest of the budget', () => {
		loadSample();
		expect(loadData().assets.length).toBeGreaterThan(0);
		resetAll();
		expect(loadData().assets).toEqual([]);
	});
});

describe('check-in with assets', () => {
	it('writes the confirmed and changed balances and freezes them in the snapshot', () => {
		const konto = sparkonto();
		const depot = saveAsset({ name: 'Depot', type: 'securities', provider: 'Swissquote', note: null });
		const alt = saveAsset({ name: 'Altes Konto', type: 'account', provider: null, note: null });
		for (const id of [konto, depot, alt]) upsertAssetVersion(id, { from: '2026-01', balance: 1_000_000, ended: false });

		const id = applyCheckIn(
			'2026-10',
			[
				{ target: 'asset', id: depot, action: 'update', balance: 1_400_000 },
				{ target: 'asset', id: alt, action: 'end' }
			],
			null
		);

		const data = loadData();
		const byName = Object.fromEntries(data.assets.map((a) => [a.name, a.versions.map((v) => [v.from, v.balance, v.ended])]));
		expect(byName['Depot']).toEqual([['2026-01', 1_000_000, false], ['2026-10', 1_400_000, false]]);
		expect(byName['Altes Konto'][1]).toEqual(['2026-10', 0, true]);
		// Confirmed without a change: nothing is written
		expect(byName['Sparkonto']).toEqual([['2026-01', 1_000_000, false]]);

		const snapshot = data.checkIns.find((c) => c.id === id)!.snapshot!;
		expect(snapshot.assets?.map((a) => [a.name, a.balance])).toEqual([
			['Depot', 1_400_000],
			['Sparkonto', 1_000_000]
		]);
	});

	it('keeps the frozen balances when the assets change afterwards', () => {
		const konto = sparkonto();
		upsertAssetVersion(konto, { from: '2026-01', balance: 1_000_000, ended: false });
		const id = applyCheckIn('2026-10', [], null);
		upsertAssetVersion(konto, { from: '2026-10', balance: 5_000_000, ended: false });
		upsertAssetVersion(konto, { from: '2026-11', balance: 6_000_000, ended: false });
		const stored = loadData().checkIns.find((c) => c.id === id)!;
		expect(stored.snapshot!.assets![0].balance).toBe(1_000_000);
	});

	it('changing an earlier month backfills the history', () => {
		const konto = sparkonto();
		upsertAssetVersion(konto, { from: '2026-01', balance: 1_000_000, ended: false });
		applyCheckIn('2024-03', [{ target: 'asset', id: konto, action: 'update', balance: 700_000 }], null);
		expect(loadData().assets[0].versions.map((v) => [v.from, v.balance])).toEqual([
			['2024-03', 700_000],
			['2026-01', 1_000_000]
		]);
	});
});

describe('restoring assets', () => {
	beforeEach(() => loadSample());

	const exported = (): any => JSON.parse(JSON.stringify({ exportedAt: '2026-10-27T08:00:00.000Z', ...loadData() }));

	it('brings back assets and their snapshots exactly', () => {
		const before = loadData();
		expect(before.assets.length).toBeGreaterThan(3);
		expect(before.checkIns.every((c) => c.snapshot?.assets?.length)).toBe(true);
		const file = exported();
		resetAll();
		restoreData(parseExport(file));
		expect(loadData()).toEqual(before);
	});

	it('accepts exports from before assets existed', () => {
		const raw = exported();
		delete raw.assets;
		// Goals came later than assets, so such exports have none either
		delete raw.goals;
		for (const i of raw.items) delete i.assetId;
		for (const c of raw.checkIns) delete c.snapshot.assets;
		const data = parseExport(raw);
		expect(data.assets).toEqual([]);
		restoreData(data);
		expect(loadData().assets).toEqual([]);
		expect(loadData().checkIns).toHaveLength(5);
		expect(loadData().checkIns.every((c) => c.snapshot !== null && c.snapshot.assets === undefined)).toBe(true);
	});

	it('rejects broken assets and names the entry', () => {
		const cases: [string, (raw: any) => void][] = [
			['assets[0].type', (r) => (r.assets[0].type = 'gold')],
			['assets[0].name', (r) => (r.assets[0].name = '')],
			['assets[0].provider', (r) => (r.assets[0].provider = 5)],
			['assets[0].versions[0].balance', (r) => (r.assets[0].versions[0].balance = 10.5)],
			['assets[0].versions[0].from', (r) => (r.assets[0].versions[0].from = '2026-00')],
			['assets[0].versions[0].ended', (r) => delete r.assets[0].versions[0].ended],
			['assets[0].versions', (r) => r.assets[0].versions.push({ ...r.assets[0].versions[0], id: 9999 })],
			['assets', (r) => (r.assets[1].id = r.assets[0].id)],
			['assets[].versions', (r) => (r.assets[1].versions[0].id = r.assets[0].versions[0].id)],
			['assets', (r) => (r.assets = 'x')],
			['checkIns[0].snapshot.assets', (r) => (r.checkIns[0].snapshot.assets = 'x')]
		];
		for (const [at, change] of cases) {
			const raw = exported();
			change(raw);
			expect(() => parseExport(raw), at).toThrow(`(${at})`);
		}
	});
});
