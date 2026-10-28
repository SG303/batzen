import { beforeEach, describe, expect, it } from 'vitest';
import { summarizeYear } from '#lib/domain.ts';
import { createUser, listUsers } from './auth';
import { loadData, resetAll } from './repo';
import { parseExport, restoreData, RestoreError } from './restore';
import { loadSample } from './sample';

/** What the export route sends, after a round trip through JSON. */
function exported(): Record<string, unknown> {
	return JSON.parse(JSON.stringify({ exportedAt: '2026-10-27T08:00:00.000Z', note: 'Beträge in Rappen', ...loadData() }));
}

function brokenExport(change: (raw: any) => void) {
	const raw: any = exported();
	change(raw);
	return () => parseExport(raw);
}

beforeEach(() => loadSample());

describe('restore', () => {
	it('brings back exactly the exported data', () => {
		const before = loadData();
		const file = exported();
		resetAll();
		expect(loadData().items).toEqual([]);

		restoreData(parseExport(file));

		const after = loadData();
		expect(after).toEqual(before);
		expect(after.checkIns.every((c) => c.snapshot !== null)).toBe(true);
		for (const year of [2023, 2024, 2025, 2026]) {
			expect(summarizeYear(after, year)).toEqual(summarizeYear(before, year));
		}
	});

	it('replaces data entered after the export', () => {
		const file = exported();
		resetAll();
		loadSample();
		restoreData(parseExport(file));
		expect(loadData()).toEqual(parseExport(file));
	});

	it('keeps users and their passwords', async () => {
		await createUser('anna', 'ein-langes-passwort', true);
		restoreData(parseExport(exported()));
		expect(listUsers().map((u) => u.username)).toEqual(['anna']);
	});

	it('changes nothing when writing fails halfway', () => {
		const before = loadData();
		const file = parseExport(exported());
		// An item pointing to a missing category violates the foreign key on insert
		file.items[5].categoryId = 999;
		expect(() => restoreData(file)).toThrow();
		expect(loadData()).toEqual(before);
	});

	it('accepts older exports without the counted flag and snapshots', () => {
		const raw: any = exported();
		for (const s of raw.incomes) delete s.counted;
		for (const c of raw.checkIns) delete c.snapshot;
		const data = parseExport(raw);
		expect(data.incomes.map((s) => [s.type, s.counted])).toEqual([
			['salary', true],
			['bonus', false],
			['expenses', false]
		]);
		expect(data.checkIns.every((c) => c.snapshot === null)).toBe(true);
	});
	it('accepts older exports without due months and reserve flags', () => {
		const raw: any = exported();
		for (const i of raw.items) {
			delete i.reserve;
			for (const v of i.versions) delete v.dueMonth;
		}
		const data = parseExport(raw);
		expect(data.items.every((i) => i.reserve && i.versions.every((v) => v.dueMonth === null))).toBe(true);
	});

	it('accepts older exports without item notes', () => {
		// The round trip above covers notes only if the sample has some
		expect(loadData().items.some((i) => i.versions.some((v) => v.note))).toBe(true);
		const raw: any = exported();
		for (const i of raw.items) for (const v of i.versions) delete v.note;
		const data = parseExport(raw);
		expect(data.items.every((i) => i.versions.every((v) => v.note === null))).toBe(true);
	});

	it('ignores the unused note that earlier exports had on items', () => {
		const raw: any = exported();
		for (const i of raw.items) i.note = 'alt';
		const data = parseExport(raw);
		expect(data.items.every((i) => !('note' in i))).toBe(true);
		restoreData(data);
		expect(loadData()).toEqual(data);
	});

	it('accepts older exports without goals and scenarios', () => {
		const raw: any = exported();
		delete raw.goals;
		delete raw.scenarios;
		const data = parseExport(raw);
		expect([data.goals, data.scenarios]).toEqual([[], []]);
		restoreData(data);
		expect([loadData().goals, loadData().scenarios]).toEqual([[], []]);
	});

	it('brings back goals and scenarios with their changes', () => {
		const before = loadData();
		expect(before.goals).toHaveLength(2);
		expect(before.scenarios.map((s) => s.changes.length)).toEqual([1, 5]);
		const file = exported();
		resetAll();
		restoreData(parseExport(file));
		expect(loadData().goals).toEqual(before.goals);
		expect(loadData().scenarios).toEqual(before.scenarios);
	});
});

describe('parseExport', () => {
	it('rejects files that are not an export', () => {
		for (const raw of [null, 42, 'text', [], {}, { categories: [], items: [] }]) {
			expect(() => parseExport(raw)).toThrow('Diese Datei ist kein Batzen-Export.');
		}
	});

	it('names the broken entry', () => {
		expect(brokenExport((r) => (r.items[3].versions[0].from = '2025-13'))).toThrow(
			'Der Export ist unvollständig oder beschädigt (items[3].versions[0].from).'
		);
	});

	it('rejects invalid values', () => {
		const cases: [string, (raw: any) => void][] = [
			['categories[0].color', (r) => (r.categories[0].color = 9)],
			['categories', (r) => (r.categories[1].id = r.categories[0].id)],
			['items[0].categoryId', (r) => (r.items[0].categoryId = 999)],
			['items[0].kind', (r) => (r.items[0].kind = 'luxury')],
			['items[0].name', (r) => (r.items[0].name = '  ')],
			['items[0].versions[0].amount', (r) => (r.items[0].versions[0].amount = 12.5)],
			['items[0].versions[0].amount', (r) => (r.items[0].versions[0].amount = '100')],
			['items[0].versions[0].dueMonth', (r) => (r.items[0].versions[0].dueMonth = 13)],
			['items[0].versions[0].note', (r) => (r.items[0].versions[0].note = 5)],
			['items[0].reserve', (r) => (r.items[0].reserve = 'ja')],
			['items[0].versions[0].share', (r) => (r.items[0].versions[0].share = 101)],
			['items[0].versions[0].interval', (r) => (r.items[0].versions[0].interval = 'weekly')],
			['items[0].versions[0].ended', (r) => (r.items[0].versions[0].ended = 0)],
			['items[0].versions', (r) => r.items[0].versions.push({ ...r.items[0].versions[0] })],
			['items', (r) => r.items.push({ ...r.items[0], versions: [] })],
			['items[].versions', (r) => (r.items[1].versions[0].id = r.items[0].versions[0].id)],
			['incomes[0].versions[0].id', (r) => delete r.incomes[0].versions[0].id],
			['incomes[0].type', (r) => (r.incomes[0].type = 'lottery')],
			['incomes[0].versions[0].interval', (r) => (r.incomes[0].versions[0].interval = 'quarterly')],
			['incomes[0].versions[0].thirteenth', (r) => delete r.incomes[0].versions[0].thirteenth],
			['checkIns[0].asOf', (r) => (r.checkIns[0].asOf = '2025')],
			['checkIns[0].snapshot', (r) => (r.checkIns[0].snapshot = 'kaputt')],
			['checkIns[0].snapshot.items', (r) => (r.checkIns[0].snapshot.items = null)],
			['goals[0].due', (r) => (r.goals[0].due = 'bald')],
			['goals[0].target', (r) => (r.goals[0].target = -1)],
			['goals[0].assetId', (r) => (r.goals[0].assetId = 999)],
			['goals', (r) => (r.goals[1].id = r.goals[0].id)],
			['scenarios[0].changes', (r) => (r.scenarios[0].changes = null)],
			['scenarios[0].changes[0].type', (r) => (r.scenarios[0].changes[0].type = 'magic')],
			['scenarios[0].changes[0].mode', (r) => (r.scenarios[0].changes[0].mode = 'double')],
			['scenarios[0].changes[0].value', (r) => (r.scenarios[0].changes[0].value = '80')],
			['scenarios[1].changes[1].target', (r) => (r.scenarios[1].changes[1].target = 'asset')],
			['scenarios[1].changes[4].categoryId', (r) => (r.scenarios[1].changes[4].categoryId = 999)],
			['scenarios[1].changes[4].share', (r) => (r.scenarios[1].changes[4].share = 120)]
		];
		for (const [at, change] of cases) {
			expect(brokenExport(change), at).toThrow(`(${at})`);
		}
	});

	it('only throws RestoreError for bad input', () => {
		expect(brokenExport((r) => (r.items = 'x'))).toThrow(RestoreError);
		expect(brokenExport((r) => (r.items[0] = null))).toThrow(RestoreError);
		expect(brokenExport((r) => (r.items[0].versions = null))).toThrow(RestoreError);
	});
});
