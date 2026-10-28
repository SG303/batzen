import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { buildSnapshot, contributionPrompts, withContributions, type Snapshot } from '#lib/domain.ts';
import type {
	AssetType,
	AssetVersion,
	BudgetData,
	Goal,
	IncomeType,
	IncomeVersion,
	Interval,
	ItemKind,
	ItemVersion,
	Month,
	Scenario,
	ScenarioChange
} from '#lib/domain.ts';

const {
	categories,
	items,
	itemVersions,
	incomeSources,
	incomeVersions,
	assets,
	assetVersions,
	checkIns,
	goals,
	scenarios
} = schema;

export function loadData(): BudgetData {
	const cats = db.select().from(categories).orderBy(asc(categories.sort)).all();
	const its = db.select().from(items).orderBy(asc(items.name)).all();
	const ivs = db.select().from(itemVersions).orderBy(asc(itemVersions.from)).all();
	const srcs = db.select().from(incomeSources).orderBy(asc(incomeSources.id)).all();
	const incs = db.select().from(incomeVersions).orderBy(asc(incomeVersions.from)).all();
	const ass = db.select().from(assets).orderBy(asc(assets.name)).all();
	const avs = db.select().from(assetVersions).orderBy(asc(assetVersions.from)).all();
	const cis = db.select().from(checkIns).orderBy(asc(checkIns.asOf)).all();
	const gls = db.select().from(goals).orderBy(asc(goals.due), asc(goals.id)).all();
	const scs = db.select().from(scenarios).orderBy(asc(scenarios.id)).all();

	return {
		categories: cats,
		items: its.map((i) => ({
			...i,
			kind: i.kind as ItemKind,
			versions: ivs
				.filter((v) => v.itemId === i.id)
				.map(({ itemId: _, ...v }) => ({ ...v, interval: v.interval as Interval }))
		})),
		incomes: srcs.map((s) => ({
			...s,
			type: s.type as IncomeType,
			versions: incs
				.filter((v) => v.sourceId === s.id)
				.map(({ sourceId: _, ...v }) => ({ ...v, interval: v.interval as 'monthly' | 'yearly' }))
		})),
		assets: ass.map((a) => ({
			...a,
			type: a.type as AssetType,
			versions: avs.filter((v) => v.assetId === a.id).map(({ assetId: _, ...v }) => v)
		})),
		checkIns: cis.map((c) => ({ ...c, snapshot: parseSnapshot(c.snapshot) })),
		goals: gls,
		scenarios: scs.map((sc) => ({ ...sc, changes: parseChanges(sc.changes) }))
	};
}

function parseChanges(raw: string): ScenarioChange[] {
	try {
		const changes = JSON.parse(raw);
		return Array.isArray(changes) ? changes : [];
	} catch {
		return [];
	}
}

function parseSnapshot(raw: string | null): Snapshot | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Snapshot;
	} catch {
		return null;
	}
}

export function isEmpty(): boolean {
	return !db.select({ id: items.id }).from(items).limit(1).get() &&
		!db.select({ id: incomeSources.id }).from(incomeSources).limit(1).get() &&
		!db.select({ id: assets.id }).from(assets).limit(1).get();
}

// Items

export function saveItem(input: {
	id?: number;
	name: string;
	categoryId: number;
	kind: ItemKind;
	/** Kept only for saving items */
	assetId?: number | null;
	/** Left unchanged when missing; new items count towards the reserve */
	reserve?: boolean;
}): number {
	const { id, ...values } = input;
	values.assetId = values.kind === 'saving' ? (values.assetId ?? null) : null;
	if (id) {
		db.update(items).set(values).where(eq(items.id, id)).run();
		return id;
	}
	return db.insert(items).values(values).returning({ id: items.id }).get().id;
}

export function deleteItem(id: number) {
	db.delete(items).where(eq(items.id, id)).run();
}

export function upsertItemVersion(itemId: number, v: Omit<ItemVersion, 'id'>, replaceId?: number) {
	db.transaction((tx) => {
		if (replaceId) tx.delete(itemVersions).where(eq(itemVersions.id, replaceId)).run();
		tx.insert(itemVersions)
			.values({ itemId, ...v })
			.onConflictDoUpdate({
				target: [itemVersions.itemId, itemVersions.from],
				set: { amount: v.amount, interval: v.interval, share: v.share, dueMonth: v.dueMonth, note: v.note, ended: v.ended }
			})
			.run();
	});
}

export function deleteItemVersion(id: number) {
	db.delete(itemVersions).where(eq(itemVersions.id, id)).run();
}

// Income

export function saveIncomeSource(input: {
	id?: number;
	name: string;
	type: IncomeType;
	counted: boolean;
}): number {
	const { id, ...values } = input;
	if (id) {
		db.update(incomeSources).set(values).where(eq(incomeSources.id, id)).run();
		return id;
	}
	return db.insert(incomeSources).values(values).returning({ id: incomeSources.id }).get().id;
}

export function deleteIncomeSource(id: number) {
	db.delete(incomeSources).where(eq(incomeSources.id, id)).run();
}

export function upsertIncomeVersion(
	sourceId: number,
	v: Omit<IncomeVersion, 'id'>,
	replaceId?: number
) {
	db.transaction((tx) => {
		if (replaceId) tx.delete(incomeVersions).where(eq(incomeVersions.id, replaceId)).run();
		tx.insert(incomeVersions)
			.values({ sourceId, ...v })
			.onConflictDoUpdate({
				target: [incomeVersions.sourceId, incomeVersions.from],
				set: { amount: v.amount, interval: v.interval, thirteenth: v.thirteenth, ended: v.ended }
			})
			.run();
	});
}

export function deleteIncomeVersion(id: number) {
	db.delete(incomeVersions).where(eq(incomeVersions.id, id)).run();
}

// Assets

export function saveAsset(input: {
	id?: number;
	name: string;
	type: AssetType;
	provider: string | null;
	note: string | null;
}): number {
	const { id, ...values } = input;
	if (id) {
		db.update(assets).set(values).where(eq(assets.id, id)).run();
		return id;
	}
	return db.insert(assets).values(values).returning({ id: assets.id }).get().id;
}

export function assetExists(id: number): boolean {
	return !!db.select({ id: assets.id }).from(assets).where(eq(assets.id, id)).get();
}

/** Saving items linked to the asset keep existing; only the link is removed. */
export function deleteAsset(id: number) {
	db.delete(assets).where(eq(assets.id, id)).run();
}

export function upsertAssetVersion(assetId: number, v: Omit<AssetVersion, 'id'>, replaceId?: number) {
	db.transaction((tx) => {
		if (replaceId) tx.delete(assetVersions).where(eq(assetVersions.id, replaceId)).run();
		tx.insert(assetVersions)
			.values({ assetId, ...v })
			.onConflictDoUpdate({
				target: [assetVersions.assetId, assetVersions.from],
				set: { balance: v.balance, ended: v.ended }
			})
			.run();
	});
}

export function deleteAssetVersion(id: number) {
	db.delete(assetVersions).where(eq(assetVersions.id, id)).run();
}

// Planning

export function saveGoal(input: Omit<Goal, 'id'> & { id?: number }): number {
	const { id, ...values } = input;
	if (values.assetId) values.saved = 0;
	if (id) {
		db.update(goals).set(values).where(eq(goals.id, id)).run();
		return id;
	}
	return db.insert(goals).values(values).returning({ id: goals.id }).get().id;
}

export function deleteGoal(id: number) {
	db.delete(goals).where(eq(goals.id, id)).run();
}

export function saveScenario(input: { id?: number; name: string; note: string | null }): number {
	const { id, ...values } = input;
	if (id) {
		db.update(scenarios).set(values).where(eq(scenarios.id, id)).run();
		return id;
	}
	return db.insert(scenarios).values(values).returning({ id: scenarios.id }).get().id;
}

export function getScenario(id: number): Scenario | null {
	const row = db.select().from(scenarios).where(eq(scenarios.id, id)).get();
	return row ? { ...row, changes: parseChanges(row.changes) } : null;
}

export function setScenarioChanges(id: number, changes: ScenarioChange[]) {
	db.update(scenarios).set({ changes: JSON.stringify(changes) }).where(eq(scenarios.id, id)).run();
}

/** A new scenario with the name and changes of an existing one. */
export function copyScenario(id: number, name: string): number | null {
	const source = getScenario(id);
	if (!source) return null;
	const copy = saveScenario({ name, note: source.note });
	setScenarioChanges(copy, source.changes);
	return copy;
}

export function deleteScenario(id: number) {
	db.delete(scenarios).where(eq(scenarios.id, id)).run();
}

// Categories

export function saveCategory(input: { id?: number; name: string; color: number }) {
	if (input.id) {
		db.update(categories)
			.set({ name: input.name, color: input.color })
			.where(eq(categories.id, input.id))
			.run();
		return;
	}
	const max = db.select({ max: sql<number>`coalesce(max(${categories.sort}), 0)` }).from(categories).get();
	db.insert(categories)
		.values({ name: input.name, color: input.color, sort: (max?.max ?? 0) + 1 })
		.run();
}

/** Returns false if the category still has items. */
export function deleteCategory(id: number): boolean {
	const used = db.select({ id: items.id }).from(items).where(eq(items.categoryId, id)).limit(1).get();
	if (used) return false;
	db.delete(categories).where(eq(categories.id, id)).run();
	return true;
}

export function moveCategory(id: number, direction: -1 | 1) {
	const all = db.select().from(categories).orderBy(asc(categories.sort)).all();
	const index = all.findIndex((c) => c.id === id);
	const other = all[index + direction];
	if (index < 0 || !other) return;
	[all[index], all[index + direction]] = [other, all[index]];
	db.transaction((tx) => {
		all.forEach((c, i) => tx.update(categories).set({ sort: i + 1 }).where(eq(categories.id, c.id)).run());
	});
}

// Check-ins

export type CheckInChange =
	| { target: 'item'; id: number; action: 'update'; amount: number; interval: Interval; share: number; dueMonth: number | null }
	| { target: 'item'; id: number; action: 'end' }
	| { target: 'income'; id: number; action: 'update'; amount: number; interval: 'monthly' | 'yearly'; thirteenth: boolean }
	| { target: 'income'; id: number; action: 'end' }
	| { target: 'asset'; id: number; action: 'update'; balance: number }
	| { target: 'asset'; id: number; action: 'end' };

/**
 * Writes the changes and stores the check-in with its snapshot. `contributions` are the amounts
 * (Rappen per asset ID) paid into assets since the previous check-in; amounts for assets the
 * check-in does not ask about are ignored.
 */
export function applyCheckIn(
	asOf: Month,
	changes: CheckInChange[],
	note: string | null,
	contributions = new Map<number, number>()
): number {
	return db.transaction((tx) => {
		for (const c of changes) {
			if (c.target === 'item') {
				const values =
					c.action === 'end'
						? { amount: 0, interval: 'monthly', share: 100, dueMonth: null, ended: true }
						: { amount: c.amount, interval: c.interval, share: c.share, dueMonth: c.dueMonth, ended: false };
				// The check-in does not ask for notes: a new version inherits the note in effect, and a
				// version that already exists for this month keeps its own
				const note =
					c.action === 'end'
						? null
						: (tx
								.select({ note: itemVersions.note })
								.from(itemVersions)
								.where(and(eq(itemVersions.itemId, c.id), lte(itemVersions.from, asOf)))
								.orderBy(desc(itemVersions.from))
								.limit(1)
								.get()?.note ?? null);
				tx.insert(itemVersions)
					.values({ itemId: c.id, from: asOf, ...values, note })
					.onConflictDoUpdate({
						target: [itemVersions.itemId, itemVersions.from],
						set: c.action === 'end' ? { ...values, note: null } : values
					})
					.run();
			} else if (c.target === 'asset') {
				const values = c.action === 'end' ? { balance: 0, ended: true } : { balance: c.balance, ended: false };
				tx.insert(assetVersions)
					.values({ assetId: c.id, from: asOf, ...values })
					.onConflictDoUpdate({ target: [assetVersions.assetId, assetVersions.from], set: values })
					.run();
			} else {
				const values =
					c.action === 'end'
						? { amount: 0, interval: 'monthly', thirteenth: false, ended: true }
						: { amount: c.amount, interval: c.interval, thirteenth: c.thirteenth, ended: false };
				tx.insert(incomeVersions)
					.values({ sourceId: c.id, from: asOf, ...values })
					.onConflictDoUpdate({ target: [incomeVersions.sourceId, incomeVersions.from], set: values })
					.run();
			}
		}
		// Same connection, so the snapshot already sees the changes written above.
		const data = loadData();
		const snapshot = JSON.stringify(
			withContributions(buildSnapshot(data, asOf), contributionPrompts(data, asOf), contributions)
		);
		return tx
			.insert(checkIns)
			.values({ asOf, completedAt: new Date().toISOString(), note, snapshot })
			.returning({ id: checkIns.id })
			.get().id;
	});
}

export function updateCheckInNote(id: number, note: string | null) {
	db.update(checkIns).set({ note }).where(eq(checkIns.id, id)).run();
}

/** Removes the check-in and its snapshot; the amounts it changed stay. */
export function deleteCheckIn(id: number) {
	db.delete(checkIns).where(eq(checkIns.id, id)).run();
}

// Whole database

export function resetAll() {
	db.transaction((tx) => {
		tx.delete(checkIns).run();
		tx.delete(goals).run();
		tx.delete(scenarios).run();
		tx.delete(itemVersions).run();
		tx.delete(items).run();
		tx.delete(incomeVersions).run();
		tx.delete(incomeSources).run();
		tx.delete(assetVersions).run();
		tx.delete(assets).run();
		tx.delete(categories).run();
	});
}

export const DEFAULT_CATEGORIES = [
	'Wohnen',
	'Steuern',
	'Versicherungen & Gesundheit',
	'Essen & Alltag',
	'Mobilität',
	'Abos & Medien',
	'Freizeit',
	'Sparen & Vorsorge'
];

export function ensureCategories() {
	if (db.select({ id: categories.id }).from(categories).limit(1).get()) return;
	db.insert(categories)
		.values(DEFAULT_CATEGORIES.map((name, i) => ({ name, color: i + 1, sort: i + 1 })))
		.run();
}
