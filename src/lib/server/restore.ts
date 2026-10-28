import { db, schema } from './db';
import { resetAll } from './repo';
import {
	ASSET_TYPES,
	countedByDefault,
	INCOME_TYPES,
	INTERVALS,
	KINDS,
	type Asset,
	type BudgetData,
	type CheckIn,
	type Goal,
	type IncomeSource,
	type Item,
	type Scenario,
	type ScenarioChange,
	type Snapshot
} from '#lib/domain.ts';

/** A JSON export that cannot be restored. The message is shown in the UI. */
export class RestoreError extends Error {}

type Obj = Record<string, unknown>;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Validates a parsed JSON export (see routes/(app)/export) and returns it as budget data.
 * Older exports without `counted`, snapshots, assets, `assetId` or `reserve` on items, `dueMonth` on
 * item versions, `note` on item versions (earlier exports had an unused `note` on items, which is ignored), goals or scenarios are accepted.
 */
export function parseExport(raw: unknown): BudgetData {
	if (!isObj(raw) || !['categories', 'items', 'incomes', 'checkIns'].every((k) => Array.isArray(raw[k]))) {
		throw new RestoreError('Diese Datei ist kein Batzen-Export.');
	}

	const categories = list(raw.categories, 'categories', (c, at) => ({
		id: positive(c.id, `${at}.id`),
		name: str(c.name, `${at}.name`),
		color: int(c.color, `${at}.color`, 1, 8),
		sort: int(c.sort, `${at}.sort`)
	}));
	unique(categories.map((c) => c.id), 'categories');
	const categoryIds = new Set(categories.map((c) => c.id));

	// Exports from before assets existed have no `assets` key
	const assets: Asset[] = list(raw.assets ?? [], 'assets', (a, at) => {
		const versions = list(a.versions, `${at}.versions`, (v, vat) => ({
			id: positive(v.id, `${vat}.id`),
			from: month(v.from, `${vat}.from`),
			balance: int(v.balance, `${vat}.balance`),
			ended: bool(v.ended, `${vat}.ended`)
		}));
		unique(versions.map((v) => v.from), `${at}.versions`);
		return {
			id: positive(a.id, `${at}.id`),
			name: str(a.name, `${at}.name`),
			type: oneOf(a.type, ASSET_TYPES.map((t) => t.value), `${at}.type`),
			provider: optionalStr(a.provider, `${at}.provider`),
			note: optionalStr(a.note, `${at}.note`),
			versions
		};
	});
	unique(assets.map((a) => a.id), 'assets');
	unique(assets.flatMap((a) => a.versions.map((v) => v.id)), 'assets[].versions');
	const assetIds = new Set(assets.map((a) => a.id));

	const items: Item[] = list(raw.items, 'items', (i, at) => {
		const categoryId = positive(i.categoryId, `${at}.categoryId`);
		if (!categoryIds.has(categoryId)) invalid(`${at}.categoryId`);
		// Exports from before saving items could feed an asset have no `assetId`
		const assetId = i.assetId == null ? null : positive(i.assetId, `${at}.assetId`);
		if (assetId !== null && !assetIds.has(assetId)) invalid(`${at}.assetId`);
		const versions = list(i.versions, `${at}.versions`, (v, vat) => ({
			id: positive(v.id, `${vat}.id`),
			from: month(v.from, `${vat}.from`),
			amount: int(v.amount, `${vat}.amount`),
			interval: oneOf(v.interval, INTERVALS.map((x) => x.value), `${vat}.interval`),
			share: int(v.share, `${vat}.share`, 0, 100),
			// Exports from before due dates have no `dueMonth`
			dueMonth: v.dueMonth == null ? null : int(v.dueMonth, `${vat}.dueMonth`, 1, 12),
			// Exports from before item notes have no `note` on versions
			note: optionalStr(v.note, `${vat}.note`),
			ended: bool(v.ended, `${vat}.ended`)
		}));
		unique(versions.map((v) => v.from), `${at}.versions`);
		return {
			id: positive(i.id, `${at}.id`),
			name: str(i.name, `${at}.name`),
			categoryId,
			kind: oneOf(i.kind, KINDS.map((k) => k.value), `${at}.kind`),
			assetId,
			// Exports from before reserves count every item that is not monthly
			reserve: i.reserve === undefined ? true : bool(i.reserve, `${at}.reserve`),
			versions
		};
	});
	unique(items.map((i) => i.id), 'items');
	unique(items.flatMap((i) => i.versions.map((v) => v.id)), 'items[].versions');

	const incomes: IncomeSource[] = list(raw.incomes, 'incomes', (s, at) => {
		const type = oneOf(s.type, INCOME_TYPES.map((t) => t.value), `${at}.type`);
		const versions = list(s.versions, `${at}.versions`, (v, vat) => ({
			id: positive(v.id, `${vat}.id`),
			from: month(v.from, `${vat}.from`),
			amount: int(v.amount, `${vat}.amount`),
			interval: oneOf(v.interval, ['monthly', 'yearly'] as const, `${vat}.interval`),
			thirteenth: bool(v.thirteenth, `${vat}.thirteenth`),
			ended: bool(v.ended, `${vat}.ended`)
		}));
		unique(versions.map((v) => v.from), `${at}.versions`);
		return {
			id: positive(s.id, `${at}.id`),
			name: str(s.name, `${at}.name`),
			type,
			counted: s.counted === undefined ? countedByDefault(type) : bool(s.counted, `${at}.counted`),
			versions
		};
	});
	unique(incomes.map((s) => s.id), 'incomes');
	unique(incomes.flatMap((s) => s.versions.map((v) => v.id)), 'incomes[].versions');

	const checkIns: CheckIn[] = list(raw.checkIns, 'checkIns', (c, at) => ({
		id: positive(c.id, `${at}.id`),
		asOf: month(c.asOf, `${at}.asOf`),
		completedAt: str(c.completedAt, `${at}.completedAt`),
		note: optionalStr(c.note, `${at}.note`),
		snapshot: c.snapshot == null ? null : snapshot(c.snapshot, `${at}.snapshot`)
	}));
	unique(checkIns.map((c) => c.id), 'checkIns');

	// Exports from before planning have no goals and scenarios
	const goals: Goal[] = list(raw.goals ?? [], 'goals', (g, at) => {
		const assetId = g.assetId == null ? null : positive(g.assetId, `${at}.assetId`);
		if (assetId !== null && !assetIds.has(assetId)) invalid(`${at}.assetId`);
		return {
			id: positive(g.id, `${at}.id`),
			name: str(g.name, `${at}.name`),
			target: int(g.target, `${at}.target`, 0),
			due: month(g.due, `${at}.due`),
			assetId,
			saved: int(g.saved, `${at}.saved`, 0)
		};
	});
	unique(goals.map((g) => g.id), 'goals');

	const scenarios: Scenario[] = list(raw.scenarios ?? [], 'scenarios', (sc, at) => ({
		id: positive(sc.id, `${at}.id`),
		name: str(sc.name, `${at}.name`),
		note: optionalStr(sc.note, `${at}.note`),
		changes: list(sc.changes, `${at}.changes`, (c, cat) => change(c, cat, categoryIds))
	}));
	unique(scenarios.map((sc) => sc.id), 'scenarios');

	return { categories, items, incomes, assets, checkIns, goals, scenarios };
}

/**
 * Scenario changes are used for calculations, so they are checked fully. Changes to items or incomes
 * that no longer exist are kept, as in the app, but new items need an existing category.
 */
function change(c: Obj, at: string, categoryIds: Set<number>): ScenarioChange {
	const target = () => oneOf(c.target, ['item', 'income'] as const, `${at}.target`);
	switch (c.type) {
		case 'change':
			return {
				type: 'change',
				target: target(),
				id: positive(c.id, `${at}.id`),
				mode: oneOf(c.mode, ['percent', 'amount'] as const, `${at}.mode`),
				value: int(c.value, `${at}.value`, 0)
			};
		case 'remove':
			return { type: 'remove', target: target(), id: positive(c.id, `${at}.id`) };
		case 'addItem': {
			const categoryId = positive(c.categoryId, `${at}.categoryId`);
			if (!categoryIds.has(categoryId)) invalid(`${at}.categoryId`);
			return {
				type: 'addItem',
				name: str(c.name, `${at}.name`),
				categoryId,
				kind: oneOf(c.kind, KINDS.map((k) => k.value), `${at}.kind`),
				amount: int(c.amount, `${at}.amount`, 0),
				interval: oneOf(c.interval, INTERVALS.map((x) => x.value), `${at}.interval`),
				share: int(c.share, `${at}.share`, 0, 100)
			};
		}
		case 'addIncome':
			return {
				type: 'addIncome',
				name: str(c.name, `${at}.name`),
				amount: int(c.amount, `${at}.amount`, 0),
				interval: oneOf(c.interval, ['monthly', 'yearly'] as const, `${at}.interval`),
				thirteenth: bool(c.thirteenth, `${at}.thirteenth`)
			};
		default:
			invalid(`${at}.type`);
	}
}

/** Snapshots are stored as they are; only their outline is checked so the overview can read them. */
function snapshot(value: unknown, at: string): Snapshot {
	if (!isObj(value) || typeof value.asOf !== 'string' || !MONTH.test(value.asOf)) invalid(at);
	for (const key of ['categories', 'items', 'incomes']) {
		if (!Array.isArray(value[key]) || !value[key].every(isObj)) invalid(`${at}.${key}`);
	}
	if (value.assets !== undefined && (!Array.isArray(value.assets) || !value.assets.every(isObj))) {
		invalid(`${at}.assets`);
	}
	// Contributions are used for calculations, so they are checked fully
	(value.assets as Obj[] | undefined)?.forEach((a, i) => {
		if (a.contributions === undefined) return;
		const cat = `${at}.assets[${i}].contributions`;
		if (!isObj(a.contributions)) invalid(cat);
		month(a.contributions.since, `${cat}.since`);
		int(a.contributions.amount, `${cat}.amount`, 0);
	});
	return value as unknown as Snapshot;
}

/**
 * Replaces all budget data (categories, items, incomes, assets, check-ins, goals, scenarios) with the given data in one
 * transaction. All IDs are kept so snapshots and bookmarked check-in links stay valid. Users and
 * sessions are not touched.
 */
export function restoreData(data: BudgetData) {
	const { categories, items, itemVersions, incomeSources, incomeVersions, assets, assetVersions, checkIns, goals, scenarios } =
		schema;
	db.transaction((tx) => {
		resetAll();
		for (const c of data.categories) tx.insert(categories).values(c).run();
		// Assets first: saving items refer to them
		for (const { versions, ...asset } of data.assets) {
			tx.insert(assets).values(asset).run();
			for (const v of versions) tx.insert(assetVersions).values({ assetId: asset.id, ...v }).run();
		}
		for (const { versions, ...item } of data.items) {
			tx.insert(items).values(item).run();
			for (const v of versions) tx.insert(itemVersions).values({ itemId: item.id, ...v }).run();
		}
		for (const { versions, ...source } of data.incomes) {
			tx.insert(incomeSources).values(source).run();
			for (const v of versions) tx.insert(incomeVersions).values({ sourceId: source.id, ...v }).run();
		}
		for (const c of data.checkIns) {
			tx.insert(checkIns)
				.values({ ...c, snapshot: c.snapshot ? JSON.stringify(c.snapshot) : null })
				.run();
		}
		for (const g of data.goals) tx.insert(goals).values(g).run();
		for (const sc of data.scenarios) {
			tx.insert(scenarios)
				.values({ ...sc, changes: JSON.stringify(sc.changes) })
				.run();
		}
	});
}

// Validators. Each returns the value or throws with the path of the broken entry.

function invalid(at: string): never {
	throw new RestoreError(`Der Export ist unvollständig oder beschädigt (${at}).`);
}

function isObj(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function list<T>(value: unknown, at: string, parse: (entry: Obj, at: string) => T): T[] {
	if (!Array.isArray(value)) invalid(at);
	return value.map((entry, i) => {
		if (!isObj(entry)) invalid(`${at}[${i}]`);
		return parse(entry, `${at}[${i}]`);
	});
}

function unique(values: (number | string)[], at: string) {
	if (new Set(values).size !== values.length) invalid(at);
}

function int(value: unknown, at: string, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
	if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(at);
	return value as number;
}

function positive(value: unknown, at: string): number {
	return int(value, at, 1);
}

function str(value: unknown, at: string): string {
	if (typeof value !== 'string' || !value.trim()) invalid(at);
	return value;
}

function optionalStr(value: unknown, at: string): string | null {
	if (value == null) return null;
	if (typeof value !== 'string') invalid(at);
	return value;
}

function bool(value: unknown, at: string): boolean {
	if (typeof value !== 'boolean') invalid(at);
	return value;
}

function month(value: unknown, at: string): string {
	if (typeof value !== 'string' || !MONTH.test(value)) invalid(at);
	return value;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], at: string): T {
	if (!options.includes(value as T)) invalid(at);
	return value as T;
}
