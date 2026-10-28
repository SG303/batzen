/**
 * Domain model and all budget calculations. Pure functions, shared by server and client.
 * Amounts are in Rappen; months are 'YYYY-MM' strings (they sort lexically).
 */

export type Month = string;
export type ItemKind = 'fixed' | 'variable' | 'saving';
export type Interval = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
export type IncomeType = 'salary' | 'bonus' | 'expenses' | 'other';
export type AssetType = 'account' | 'pillar3a' | 'pension' | 'securities' | 'crypto' | 'other';

export interface Category {
	id: number;
	name: string;
	color: number;
	sort: number;
}

/** Longest note of an item version (characters) */
export const ITEM_NOTE_MAX = 500;

export interface ItemVersion {
	id: number;
	from: Month;
	amount: number;
	interval: Interval;
	share: number;
	/**
	 * Month of the year (1–12) of a payment; the others follow the interval, e.g. 2 for quarterly
	 * means February, May, August and November. Optional, always null for monthly versions.
	 */
	dueMonth: number | null;
	/** Free text valid from this month on, e.g. the provider; kept per version so the history stays */
	note: string | null;
	ended: boolean;
}

export interface Item {
	id: number;
	name: string;
	categoryId: number;
	kind: ItemKind;
	/** Saving items only: the asset the money goes into */
	assetId: number | null;
	/** Counts towards the monthly reserve while its interval is not monthly */
	reserve: boolean;
	versions: ItemVersion[];
}

export interface IncomeVersion {
	id: number;
	from: Month;
	amount: number;
	interval: 'monthly' | 'yearly';
	thirteenth: boolean;
	ended: boolean;
}

export interface IncomeSource {
	id: number;
	name: string;
	type: IncomeType;
	/** Whether this income counts towards the budget (bonus and Spesen default to no) */
	counted: boolean;
	versions: IncomeVersion[];
}

export interface AssetVersion {
	id: number;
	from: Month;
	/** Balance in Rappen */
	balance: number;
	/** The asset was closed from this month on */
	ended: boolean;
}

export interface Asset {
	id: number;
	name: string;
	type: AssetType;
	/** Where the money is held, e.g. a bank or broker */
	provider: string | null;
	/** What is inside, e.g. "Global ETF, Gold ETF" */
	note: string | null;
	versions: AssetVersion[];
}

/** The state of all costs and incomes frozen at the moment of a check-in. */
export interface Snapshot {
	asOf: Month;
	categories: Category[];
	items: {
		id: number;
		name: string;
		categoryId: number;
		kind: ItemKind;
		amount: number;
		interval: Interval;
		share: number;
	}[];
	incomes: {
		id: number;
		name: string;
		type: IncomeType;
		counted: boolean;
		amount: number;
		interval: 'monthly' | 'yearly';
		thirteenth: boolean;
	}[];
	/** Missing in snapshots from before assets existed */
	assets?: {
		id: number;
		name: string;
		type: AssetType;
		provider: string | null;
		balance: number;
		/**
		 * Money paid in since the previous check-in (`since` is its month), as confirmed in this
		 * check-in. Only on assets fed by a saving item; missing in older snapshots.
		 */
		contributions?: { since: Month; amount: number };
	}[];
}

export interface CheckIn {
	id: number;
	asOf: Month;
	completedAt: string;
	note: string | null;
	/** Null for check-ins recorded before snapshots existed */
	snapshot: Snapshot | null;
}

/** A target amount to reach by a month, measured on an asset or on an amount entered by hand. */
export interface Goal {
	id: number;
	name: string;
	/** Rappen */
	target: number;
	/** The month the target should be reached */
	due: Month;
	/** The balance of this asset is the progress; null: the progress is `saved` */
	assetId: number | null;
	/** Saved so far, entered by hand; only for goals without an asset */
	saved: number;
}

/**
 * One change of a scenario, applied to the budget of a month. `percent` scales the current amount
 * (80 = 80 %), `amount` replaces it in the same interval; the own share and the 13th salary stay.
 */
export type ScenarioChange =
	| { type: 'change'; target: 'item' | 'income'; id: number; mode: 'percent' | 'amount'; value: number }
	| { type: 'remove'; target: 'item' | 'income'; id: number }
	| {
			type: 'addItem';
			name: string;
			categoryId: number;
			kind: ItemKind;
			amount: number;
			interval: Interval;
			share: number;
	  }
	| { type: 'addIncome'; name: string; amount: number; interval: 'monthly' | 'yearly'; thirteenth: boolean };

/** "What if": a named list of changes compared with the actual budget. The budget itself stays as it is. */
export interface Scenario {
	id: number;
	name: string;
	note: string | null;
	changes: ScenarioChange[];
}

export interface BudgetData {
	categories: Category[];
	items: Item[];
	incomes: IncomeSource[];
	assets: Asset[];
	checkIns: CheckIn[];
	goals: Goal[];
	scenarios: Scenario[];
}

export const INTERVALS: { value: Interval; label: string; perYear: number }[] = [
	{ value: 'monthly', label: 'monatlich', perYear: 12 },
	{ value: 'quarterly', label: 'vierteljährlich', perYear: 4 },
	{ value: 'semiannual', label: 'halbjährlich', perYear: 2 },
	{ value: 'yearly', label: 'jährlich', perYear: 1 }
];

export const KINDS: { value: ItemKind; label: string }[] = [
	{ value: 'fixed', label: 'Fix' },
	{ value: 'variable', label: 'Variabel' },
	{ value: 'saving', label: 'Sparen' }
];

export const INCOME_TYPES: { value: IncomeType; label: string; counted: boolean }[] = [
	{ value: 'salary', label: 'Lohn', counted: true },
	{ value: 'other', label: 'Weiteres Einkommen', counted: true },
	{ value: 'bonus', label: 'Bonus', counted: false },
	{ value: 'expenses', label: 'Spesen', counted: false }
];

/**
 * `tied`: locked until retirement (or a similar event), not available in an emergency.
 * `cash`: money on an account that counts towards the emergency fund.
 */
export const ASSET_TYPES: { value: AssetType; label: string; tied: boolean; cash: boolean }[] = [
	{ value: 'account', label: 'Konto / Sparkonto', tied: false, cash: true },
	{ value: 'pillar3a', label: 'Säule 3a', tied: true, cash: false },
	{ value: 'pension', label: 'Pensionskasse (2. Säule)', tied: true, cash: false },
	{ value: 'securities', label: 'Wertschriftendepot', tied: false, cash: false },
	{ value: 'crypto', label: 'Krypto', tied: false, cash: false },
	{ value: 'other', label: 'Weiteres', tied: false, cash: false }
];

/** Rough number of working days per year, used to express costs as working time. */
export const WORKDAYS_PER_YEAR = 220;

export const MONTH_NAMES = [
	'Januar',
	'Februar',
	'März',
	'April',
	'Mai',
	'Juni',
	'Juli',
	'August',
	'September',
	'Oktober',
	'November',
	'Dezember'
];

export function currentMonth(date = new Date()): Month {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: Month, short = false): string {
	const [y, m] = month.split('-').map(Number);
	const name = MONTH_NAMES[m - 1];
	return `${short ? name.slice(0, 3) : name} ${y}`;
}

export function monthsOfYear(year: number): Month[] {
	return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

export function intervalLabel(interval: Interval | 'monthly' | 'yearly'): string {
	return INTERVALS.find((i) => i.value === interval)?.label ?? interval;
}

/** The version in effect in a given month, or null if none (not started yet or ended). */
export function versionAt<V extends { from: Month; ended: boolean }>(
	versions: V[],
	month: Month
): V | null {
	let found: V | null = null;
	for (const v of versions) {
		if (v.from <= month && (!found || v.from > found.from)) found = v;
	}
	return found && !found.ended ? found : null;
}

/** Latest version with from <= month, including an "ended" marker. */
export function lastVersionUpTo<V extends { from: Month }>(versions: V[], month: Month): V | null {
	let found: V | null = null;
	for (const v of versions) {
		if (v.from <= month && (!found || v.from > found.from)) found = v;
	}
	return found;
}

export function perYear(interval: Interval): number {
	return INTERVALS.find((i) => i.value === interval)?.perYear ?? 12;
}

/** Monthly equivalent of a version, total and own share. */
export function versionMonthly(v: ItemVersion): { total: number; mine: number } {
	const total = (v.amount * perYear(v.interval)) / 12;
	return { total, mine: (total * v.share) / 100 };
}

export function incomeMonthly(v: IncomeVersion): number {
	if (v.interval === 'yearly') return v.amount / 12;
	return (v.amount * (v.thirteenth ? 13 : 12)) / 12;
}

/** Default for new income sources: salary and other income count, bonus and Spesen don't. */
export function countedByDefault(type: IncomeType): boolean {
	return INCOME_TYPES.find((t) => t.value === type)?.counted ?? true;
}

export function yearRange(data: BudgetData, today = currentMonth()): number[] {
	const months = [
		...data.items.flatMap((i) => i.versions.map((v) => v.from)),
		...data.incomes.flatMap((s) => s.versions.map((v) => v.from))
	];
	const thisYear = Number(today.slice(0, 4));
	if (!months.length) return [thisYear];
	const first = Number(months.reduce((a, b) => (a < b ? a : b)).slice(0, 4));
	const last = Math.max(thisYear, Number(months.reduce((a, b) => (a > b ? a : b)).slice(0, 4)));
	return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

export interface ItemSummary {
	item: Item;
	/** Average per month over the period */
	monthly: { total: number; mine: number };
	/** Sum over the period */
	yearly: { total: number; mine: number };
	current: ItemVersion | null;
}

export interface CategorySummary {
	category: Category;
	monthly: { total: number; mine: number };
	items: ItemSummary[];
}

export interface YearSummary {
	year: number;
	/** Monthly averages over the period, own share */
	income: { counted: number; bonus: number; expenses: number; other: number; salary: number };
	/** Incomes not counted towards the budget, monthly average */
	excluded: { name: string; monthly: number }[];
	/** Every income with an amount in the period, monthly average */
	sources: { source: IncomeSource; monthly: number }[];
	spending: number;
	fixed: number;
	variable: number;
	saving: number;
	free: number;
	categories: CategorySummary[];
	items: ItemSummary[];
	/** Number of months in the year with any data */
	coveredMonths: number;
}

/**
 * Summarise a calendar year. Every figure is the average month of that year, so changes
 * in the middle of a year are weighted by how long they applied.
 */
export function summarizeYear(data: BudgetData, year: number): YearSummary {
	return summarizeMonths(data, monthsOfYear(year));
}

/** The figures of one single month, e.g. the month of a check-in. */
export function summarizeMonth(data: BudgetData, month: Month): YearSummary {
	return summarizeMonths(data, [month]);
}

function summarizeMonths(data: BudgetData, months: Month[]): YearSummary {
	const year = Number(months[0].slice(0, 4));
	const n = months.length;
	const reference = months[months.length - 1];

	const items: ItemSummary[] = data.items.map((item) => {
		let total = 0;
		let mine = 0;
		for (const m of months) {
			const v = versionAt(item.versions, m);
			if (!v) continue;
			const mm = versionMonthly(v);
			total += mm.total;
			mine += mm.mine;
		}
		return {
			item,
			monthly: { total: total / n, mine: mine / n },
			yearly: { total, mine },
			current: versionAt(item.versions, reference)
		};
	});

	const income = { counted: 0, bonus: 0, expenses: 0, other: 0, salary: 0 };
	const excluded = new Map<string, number>();
	const bySource = new Map<number, number>();
	let coveredMonths = 0;
	for (const m of months) {
		let any = false;
		for (const src of data.incomes) {
			const v = versionAt(src.versions, m);
			if (!v) continue;
			any = true;
			const value = incomeMonthly(v) / n;
			bySource.set(src.id, (bySource.get(src.id) ?? 0) + value);
			if (src.type === 'salary') income.salary += value;
			if (src.type === 'other') income.other += value;
			if (src.type === 'bonus') income.bonus += value;
			if (src.type === 'expenses') income.expenses += value;
			if (src.counted) income.counted += value;
			else excluded.set(src.name, (excluded.get(src.name) ?? 0) + value);
		}
		if (!any && data.items.some((i) => versionAt(i.versions, m))) any = true;
		if (any) coveredMonths++;
	}

	const sumKind = (kind: ItemKind) =>
		items.filter((s) => s.item.kind === kind).reduce((a, s) => a + s.monthly.mine, 0);
	const fixed = sumKind('fixed');
	const variable = sumKind('variable');
	const saving = sumKind('saving');

	const categories = [...data.categories]
		.sort((a, b) => a.sort - b.sort)
		.map((category) => {
			const own = items
				.filter((s) => s.item.categoryId === category.id && s.monthly.total > 0)
				.sort((a, b) => b.monthly.mine - a.monthly.mine);
			return {
				category,
				items: own,
				monthly: {
					total: own.reduce((a, s) => a + s.monthly.total, 0),
					mine: own.reduce((a, s) => a + s.monthly.mine, 0)
				}
			};
		})
		.filter((c) => c.monthly.total > 0);

	return {
		year,
		income,
		excluded: [...excluded].map(([name, monthly]) => ({ name, monthly })),
		sources: data.incomes.flatMap((source) => {
			const monthly = bySource.get(source.id) ?? 0;
			return monthly > 0 ? [{ source, monthly }] : [];
		}),
		spending: fixed + variable,
		fixed,
		variable,
		saving,
		free: income.counted - fixed - variable - saving,
		categories,
		items,
		coveredMonths
	};
}

export interface Change {
	item: Item;
	kind: 'new' | 'ended' | 'up' | 'down';
	before: number;
	after: number;
}

/** Items whose own monthly cost changed between two year summaries, biggest first. */
export function compareYears(prev: YearSummary, next: YearSummary): Change[] {
	const changes: Change[] = [];
	for (const n of next.items) {
		const p = prev.items.find((s) => s.item.id === n.item.id);
		const before = p?.monthly.mine ?? 0;
		const after = n.monthly.mine;
		if (Math.abs(after - before) < 200) continue; // ignore changes below CHF 2 a month
		const kind = before === 0 ? 'new' : after === 0 ? 'ended' : after > before ? 'up' : 'down';
		changes.push({ item: n.item, kind, before, after });
	}
	return changes.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
}

/** Snapshot of all items and incomes at a given month (used by the list and check-in). */
export function stateAt(data: BudgetData, month: Month) {
	return {
		items: data.items.map((item) => ({
			item,
			version: versionAt(item.versions, month),
			last: lastVersionUpTo(item.versions, month)
		})),
		incomes: data.incomes.map((source) => ({
			source,
			version: versionAt(source.versions, month),
			last: lastVersionUpTo(source.versions, month)
		}))
	};
}

/** Freeze the state at a month. Stored with each check-in. */
export function buildSnapshot(data: BudgetData, asOf: Month): Snapshot {
	return {
		asOf,
		categories: data.categories.map((c) => ({ ...c })),
		items: data.items.flatMap((item) => {
			const v = versionAt(item.versions, asOf);
			return v
				? [{ id: item.id, name: item.name, categoryId: item.categoryId, kind: item.kind, amount: v.amount, interval: v.interval, share: v.share }]
				: [];
		}),
		incomes: data.incomes.flatMap((src) => {
			const v = versionAt(src.versions, asOf);
			return v
				? [{ id: src.id, name: src.name, type: src.type, counted: src.counted, amount: v.amount, interval: v.interval, thirteenth: v.thirteenth }]
				: [];
		}),
		assets: data.assets.flatMap((asset) => {
			const v = versionAt(asset.versions, asOf);
			return v ? [{ id: asset.id, name: asset.name, type: asset.type, provider: asset.provider, balance: v.balance }] : [];
		})
	};
}

/**
 * Turn a snapshot back into budget data so the normal summaries work on it. Whether an
 * income counts follows the current setting of that source; it is a view preference.
 */
export function snapshotData(snapshot: Snapshot, current: BudgetData): BudgetData {
	const from = snapshot.asOf;
	return {
		categories: snapshot.categories,
		items: snapshot.items.map((i) => ({
			id: i.id,
			name: i.name,
			categoryId: i.categoryId,
			kind: i.kind,
			assetId: null,
			reserve: current.items.find((c) => c.id === i.id)?.reserve ?? true,
			versions: [{ id: 0, from, amount: i.amount, interval: i.interval, share: i.share, dueMonth: null, note: null, ended: false }]
		})),
		incomes: snapshot.incomes.map((s) => ({
			id: s.id,
			name: s.name,
			type: s.type,
			counted: current.incomes.find((c) => c.id === s.id)?.counted ?? s.counted,
			versions: [{ id: 0, from, amount: s.amount, interval: s.interval, thirteenth: s.thirteenth, ended: false }]
		})),
		assets: (snapshot.assets ?? []).map((a) => ({
			id: a.id,
			name: a.name,
			type: a.type,
			provider: a.provider,
			note: null,
			versions: [{ id: 0, from, balance: a.balance, ended: false }]
		})),
		checkIns: [],
		goals: [],
		scenarios: []
	};
}

/** The frozen state of a check-in; older check-ins without one are rebuilt from the history. */
export function checkInData(checkIn: CheckIn, current: BudgetData): BudgetData {
	return snapshotData(checkIn.snapshot ?? buildSnapshot(current, checkIn.asOf), current);
}

// Assets

export function assetTypeInfo(type: AssetType) {
	return ASSET_TYPES.find((t) => t.value === type) ?? ASSET_TYPES[ASSET_TYPES.length - 1];
}

/** Balance in a month: the latest entry up to then, 0 before the first entry or after closing. */
export function balanceAt(asset: Asset, month: Month): number {
	return versionAt(asset.versions, month)?.balance ?? 0;
}

/** Name shown for assets without a provider in the split by provider. */
export const NO_PROVIDER = 'Ohne Anbieter';

export interface AssetSummary {
	month: Month;
	total: number;
	/** Locked: pillar 3a and pension fund */
	tied: number;
	/** Total minus tied */
	free: number;
	/** Money on accounts, the base of the emergency fund */
	cash: number;
	byType: { type: AssetType; total: number }[];
	byProvider: { provider: string; total: number }[];
	/** Every asset with a balance in this month, largest first */
	assets: { asset: Asset; balance: number }[];
}

export function summarizeAssets(assets: Asset[], month: Month): AssetSummary {
	const rows = assets
		.map((asset) => ({ asset, balance: balanceAt(asset, month) }))
		.filter((r) => versionAt(r.asset.versions, month))
		.sort((a, b) => b.balance - a.balance);

	let total = 0;
	let tied = 0;
	let cash = 0;
	const byType = new Map<AssetType, number>();
	const byProvider = new Map<string, { provider: string; total: number }>();
	for (const { asset, balance } of rows) {
		const info = assetTypeInfo(asset.type);
		total += balance;
		if (info.tied) tied += balance;
		if (info.cash) cash += balance;
		byType.set(asset.type, (byType.get(asset.type) ?? 0) + balance);
		// Providers are matched ignoring case and surrounding blanks; the first spelling is shown.
		const name = asset.provider?.trim() || NO_PROVIDER;
		const key = name.toLowerCase();
		const entry = byProvider.get(key) ?? { provider: name, total: 0 };
		entry.total += balance;
		byProvider.set(key, entry);
	}

	return {
		month,
		total,
		tied,
		free: total - tied,
		cash,
		byType: ASSET_TYPES.filter((t) => byType.has(t.value))
			.map((t) => ({ type: t.value, total: byType.get(t.value)! }))
			.sort((a, b) => b.total - a.total),
		byProvider: [...byProvider.values()].sort((a, b) => b.total - a.total),
		assets: rows
	};
}

/** How many months the cash on accounts covers the monthly spending; null without spending. */
export function emergencyMonths(cash: number, monthlySpending: number): number | null {
	return monthlySpending > 0 ? cash / monthlySpending : null;
}

export interface YearEndAssets {
	year: number;
	/** 31 December, or the current month for the running year */
	month: Month;
	total: number;
	tied: number;
	free: number;
}

/**
 * Total assets at the end of every year from the first recorded balance on. The running year
 * is measured at the current month because December has not happened yet.
 */
export function yearEndAssets(assets: Asset[], today = currentMonth()): YearEndAssets[] {
	const starts = assets.flatMap((a) => a.versions.map((v) => v.from));
	if (!starts.length) return [];
	const first = Number(starts.reduce((a, b) => (a < b ? a : b)).slice(0, 4));
	const thisYear = Number(today.slice(0, 4));
	const out: YearEndAssets[] = [];
	for (let year = first; year <= thisYear; year++) {
		const month = year === thisYear ? today : `${year}-12`;
		const { total, tied, free } = summarizeAssets(assets, month);
		out.push({ year, month, total, tied, free });
	}
	return out;
}

// Contributions and market performance

function nextMonth(month: Month): Month {
	const [y, m] = month.split('-').map(Number);
	return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** The months after `since` up to and including `to`. */
export function monthsAfter(since: Month, to: Month): Month[] {
	const out: Month[] = [];
	for (let m = nextMonth(since); m <= to; m = nextMonth(m)) out.push(m);
	return out;
}

/** Saving items that pay into an asset. */
export function linkedItems(items: Item[], assetId: number): Item[] {
	return items.filter((i) => i.kind === 'saving' && i.assetId === assetId);
}

/**
 * What the linked saving items planned to pay into an asset after `since` up to `to` (own share).
 * Only an estimate: the budget spreads yearly payments evenly over the months.
 */
export function plannedContributions(items: Item[], assetId: number, since: Month, to: Month): number {
	let sum = 0;
	for (const item of linkedItems(items, assetId)) {
		for (const m of monthsAfter(since, to)) {
			const v = versionAt(item.versions, m);
			if (v) sum += versionMonthly(v).mine;
		}
	}
	return Math.round(sum);
}

/** The check-in a new one at `asOf` follows: the latest up to that month (same order as the overview). */
export function lastCheckInUpTo(checkIns: CheckIn[], asOf: Month): CheckIn | null {
	return (
		[...checkIns]
			.sort((a, b) => a.asOf.localeCompare(b.asOf) || a.id - b.id)
			.filter((c) => c.asOf <= asOf)
			.at(-1) ?? null
	);
}

export interface ContributionPrompt {
	assetId: number;
	/** Month of the previous check-in; contributions are counted after it */
	since: Month;
	/** Balance frozen in the previous check-in */
	before: number;
	/** What the linked saving items planned for the months in between */
	planned: number;
}

/**
 * Assets the check-in at `asOf` asks about contributions: fed by a saving item, still open and
 * already part of the previous check-in, so the balance can be compared.
 */
export function contributionPrompts(data: BudgetData, asOf: Month): ContributionPrompt[] {
	const previous = lastCheckInUpTo(data.checkIns, asOf);
	if (!previous) return [];
	const before = new Map(checkInData(previous, data).assets.map((a) => [a.id, a.versions[0].balance]));
	return data.assets.flatMap((asset) => {
		const balance = before.get(asset.id);
		if (balance === undefined || lastVersionUpTo(asset.versions, asOf)?.ended) return [];
		if (!linkedItems(data.items, asset.id).length) return [];
		return [
			{
				assetId: asset.id,
				since: previous.asOf,
				before: balance,
				planned: plannedContributions(data.items, asset.id, previous.asOf, asOf)
			}
		];
	});
}

/** Adds the confirmed contributions (Rappen per asset ID) to the assets they were asked for. */
export function withContributions(
	snapshot: Snapshot,
	prompts: ContributionPrompt[],
	amounts: Map<number, number>
): Snapshot {
	return {
		...snapshot,
		assets: snapshot.assets?.map((a) => {
			const prompt = prompts.find((p) => p.assetId === a.id);
			const amount = amounts.get(a.id);
			return prompt && amount !== undefined ? { ...a, contributions: { since: prompt.since, amount } } : a;
		})
	};
}

export interface AssetPerformance {
	id: number;
	name: string;
	before: number;
	after: number;
	paidIn: number;
	/** The change not explained by contributions: interest, dividends and price changes */
	market: number;
}

/** Balance change of an asset split into own contributions and the market. */
export function assetPerformance(
	asset: { id: number; name: string },
	before: number,
	after: number,
	paidIn: number
): AssetPerformance {
	return { id: asset.id, name: asset.name, before, after, paidIn, market: after - before - paidIn };
}

/**
 * Market performance of every asset with confirmed contributions between a check-in and the one
 * before it. Contributions confirmed against a different check-in (e.g. one recorded later for an
 * earlier month) are left out, because they cover another period.
 */
export function checkInPerformance(
	checkIn: CheckIn,
	previous: CheckIn | null,
	current: BudgetData
): AssetPerformance[] {
	if (!previous || !checkIn.snapshot?.assets) return [];
	const before = new Map(checkInData(previous, current).assets.map((a) => [a.id, a.versions[0].balance]));
	return checkIn.snapshot.assets.flatMap((a) => {
		const balance = before.get(a.id);
		if (!a.contributions || a.contributions.since !== previous.asOf || balance === undefined) return [];
		return [assetPerformance(a, balance, a.balance, a.contributions.amount)];
	});
}

export interface YearPerformance {
	/** Month of the check-in the first period starts from, possibly in the year before */
	since: Month;
	paidIn: number;
	market: number;
}

/**
 * Contributions and market performance of every check-in in a year, each against the one before it,
 * added up over all assets with confirmed contributions. Null when there is none.
 */
export function yearPerformance(data: BudgetData, year: number): YearPerformance | null {
	const sorted = [...data.checkIns].sort((a, b) => a.asOf.localeCompare(b.asOf) || a.id - b.id);
	let result: YearPerformance | null = null;
	sorted.forEach((c, i) => {
		if (i === 0 || !c.asOf.startsWith(`${year}-`)) return;
		const rows = checkInPerformance(c, sorted[i - 1], data);
		if (!rows.length) return;
		result ??= { since: sorted[i - 1].asOf, paidIn: 0, market: 0 };
		for (const r of rows) {
			result.paidIn += r.paidIn;
			result.market += r.market;
		}
	});
	return result;
}

// Due dates and reserves

/** The due month as stored: within 1–12, and only for intervals other than monthly. */
export function normalizeDueMonth(interval: Interval, value: unknown): number | null {
	const month = Number(value);
	if (interval === 'monthly' || value === null || value === '' || !Number.isInteger(month)) return null;
	return month >= 1 && month <= 12 ? month : null;
}

/** The months of the year (1–12) a version is due, in order. Empty for monthly or undated versions. */
export function dueMonthsOfYear(v: Pick<ItemVersion, 'interval' | 'dueMonth'>): number[] {
	if (v.interval === 'monthly' || v.dueMonth === null) return [];
	const gap = 12 / perYear(v.interval);
	const first = ((v.dueMonth - 1) % gap) + 1;
	return Array.from({ length: perYear(v.interval) }, (_, i) => first + i * gap);
}

/** "fällig im März" or "fällig im Feb, Mai, Aug, Nov"; null without a due month. */
export function dueLabel(v: Pick<ItemVersion, 'interval' | 'dueMonth'>): string | null {
	const months = dueMonthsOfYear(v);
	if (!months.length) return null;
	if (months.length === 1) return `fällig im ${MONTH_NAMES[months[0] - 1]}`;
	return `fällig im ${months.map((m) => MONTH_NAMES[m - 1].slice(0, 3)).join(', ')}`;
}

/** Whether a version counts towards the reserve: not monthly, and the item is not switched off. */
export function inReserve(item: Item, v: ItemVersion): boolean {
	return item.reserve && v.interval !== 'monthly';
}

export interface DuePayment {
	item: Item;
	/** The full bill and the own share of it */
	total: number;
	mine: number;
	/** Counts towards the reserve */
	reserved: boolean;
}

export interface ReserveMonth {
	month: Month;
	/** Bills due in this month, largest own share first */
	due: DuePayment[];
	/** Own share of the bills due that the reserve pays */
	reservedDue: number;
	/** Own share to set aside in this month */
	setAside: number;
}

export interface ReservePlan {
	year: number;
	months: ReserveMonth[];
	/** Monthly amount to set aside, averaged over the year like every other year figure */
	monthly: number;
	/** Items that are not monthly but have no due month, with their latest version in the year */
	undated: { item: Item; version: ItemVersion; reserved: boolean }[];
}

/**
 * The bills of a year by month and what to set aside for them. Monthly items are left out: they
 * are paid from the running budget. The amount to set aside does not depend on the due months.
 */
export function reservePlan(data: BudgetData, year: number): ReservePlan {
	const undated = new Map<number, { item: Item; version: ItemVersion; reserved: boolean }>();
	const months = monthsOfYear(year).map((month): ReserveMonth => {
		const monthNo = Number(month.slice(5));
		const due: DuePayment[] = [];
		let setAside = 0;
		for (const item of data.items) {
			const v = versionAt(item.versions, month);
			if (!v || v.interval === 'monthly') continue;
			const reserved = inReserve(item, v);
			if (reserved) setAside += versionMonthly(v).mine;
			if (v.dueMonth === null) undated.set(item.id, { item, version: v, reserved });
			else if (dueMonthsOfYear(v).includes(monthNo)) {
				due.push({ item, total: v.amount, mine: (v.amount * v.share) / 100, reserved });
			}
		}
		due.sort((a, b) => b.mine - a.mine);
		const reservedDue = due.filter((d) => d.reserved).reduce((a, d) => a + d.mine, 0);
		return { month, due, reservedDue, setAside };
	});
	return {
		year,
		months,
		monthly: months.reduce((a, m) => a + m.setAside, 0) / 12,
		undated: [...undated.values()].sort((a, b) => a.item.name.localeCompare(b.item.name, 'de'))
	};
}

export interface ReserveTarget {
	month: Month;
	/** What should be set aside at the end of the month for the bills still to come (own share) */
	total: number;
	/** Reserved items that are not monthly but have no due month, so they are not included */
	undated: number;
}

/**
 * What should have been set aside by the end of `month`: for every reserved item with a due month,
 * the part of its next bill saved since the last one. Assumes the same amount is set aside every
 * month, including the due month, so right after a bill is paid nothing is left for it.
 */
export function reserveTarget(data: BudgetData, month: Month): ReserveTarget {
	const monthNo = Number(month.slice(5));
	let total = 0;
	let undated = 0;
	for (const item of data.items) {
		const v = versionAt(item.versions, month);
		if (!v || !inReserve(item, v)) continue;
		if (v.dueMonth === null) {
			undated++;
			continue;
		}
		const gap = 12 / perYear(v.interval);
		const saved = (((monthNo - v.dueMonth) % gap) + gap) % gap;
		total += (((v.amount * v.share) / 100) * saved) / gap;
	}
	return { month, total: Math.round(total), undated };
}

// Flow of the income

export interface BudgetFlow {
	/** Counted incomes, largest first */
	sources: { id: number; name: string; value: number }[];
	/** What spending and saving take beyond the income; 0 when the income covers them */
	deficit: number;
	spending: number;
	saving: number;
	/** What is left over, never negative */
	free: number;
	/** Fixed and variable costs per category, in category order */
	categories: { category: Category; value: number }[];
	/** Saving items with their category, largest first */
	savings: { item: Item; category: Category | null; value: number }[];
}

/**
 * The income split into spending, saving and what is left, then spending into categories and saving
 * into its items. Monthly own share, like the summary it comes from. Both sides always add up: a
 * deficit is shown as a source of its own.
 */
export function budgetFlow(s: YearSummary): BudgetFlow {
	const categories = s.categories.flatMap((c) => {
		const value = c.items.filter((x) => x.item.kind !== 'saving').reduce((a, x) => a + x.monthly.mine, 0);
		return value > 0 ? [{ category: c.category, value }] : [];
	});
	const savings = s.items
		.filter((x) => x.item.kind === 'saving' && x.monthly.mine > 0)
		.map((x) => ({
			item: x.item,
			category: s.categories.find((c) => c.category.id === x.item.categoryId)?.category ?? null,
			value: x.monthly.mine
		}))
		.sort((a, b) => b.value - a.value);
	return {
		sources: s.sources
			.filter((x) => x.source.counted)
			.map((x) => ({ id: x.source.id, name: x.source.name, value: x.monthly }))
			.sort((a, b) => b.value - a.value),
		deficit: Math.max(-s.free, 0),
		spending: s.spending,
		saving: s.saving,
		free: Math.max(s.free, 0),
		categories,
		savings
	};
}

// Check-in reminder

/** The overview asks for a new check-in once the last one is this many months old. */
export const CHECK_IN_REMINDER_MONTHS = 5;

export interface CheckInReminder {
	/** The latest check-in up to today; null without any */
	last: CheckIn | null;
	monthsAgo: number | null;
	due: boolean;
}

export function checkInReminder(checkIns: CheckIn[], today: Month): CheckInReminder {
	const last = lastCheckInUpTo(checkIns, today);
	if (!last) return { last: null, monthsAgo: null, due: true };
	const monthsAgo = monthsBetween(last.asOf, today);
	return { last, monthsAgo, due: monthsAgo >= CHECK_IN_REMINDER_MONTHS };
}

/** "diesen Monat", "vor einem Monat", "vor 5 Monaten", "vor 2 Jahren" */
export function monthsAgoLabel(months: number): string {
	if (months <= 0) return 'diesen Monat';
	if (months === 1) return 'vor einem Monat';
	if (months < 24) return `vor ${months} Monaten`;
	return `vor ${Math.floor(months / 12)} Jahren`;
}

// Saving rate

export interface SavingsRate {
	/** Percent of the counted income */
	total: number;
	/** Saving items: money saved on purpose */
	planned: number;
	/** What is left over at the end of the month */
	leftover: number;
}

/** Saving rate split into saving items and what is left over; null without income. A deficit counts as 0. */
export function savingsRate(s: Pick<YearSummary, 'income' | 'saving' | 'free'>): SavingsRate | null {
	const income = s.income.counted;
	if (income <= 0) return null;
	const planned = (s.saving / income) * 100;
	const leftover = (Math.max(s.free, 0) / income) * 100;
	return { total: planned + leftover, planned, leftover };
}

// Planning: scenarios and savings goals

/** `month` moved by `n` months; negative goes back. */
export function addMonths(month: Month, n: number): Month {
	const [y, m] = month.split('-').map(Number);
	const index = y * 12 + m - 1 + n;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Whole months from `from` to `to`; negative when `to` is earlier. */
export function monthsBetween(from: Month, to: Month): number {
	const [fy, fm] = from.split('-').map(Number);
	const [ty, tm] = to.split('-').map(Number);
	return (ty - fy) * 12 + tm - fm;
}

/** Items and incomes a scenario adds get negative IDs, so they never clash with stored ones. */
const addedId = (index: number) => -(index + 1);

function changedAmount(change: Extract<ScenarioChange, { type: 'change' }>, amount: number): number {
	return change.mode === 'percent' ? Math.round((amount * change.value) / 100) : change.value;
}

/**
 * The budget of `month` with the changes of a scenario applied. Every item and income has a single
 * version, the one in effect in that month; changes to anything not active then have no effect.
 */
export function scenarioData(data: BudgetData, changes: ScenarioChange[], month: Month): BudgetData {
	const base = snapshotData(buildSnapshot(data, month), data);
	let { items, incomes } = base;
	changes.forEach((c, i) => {
		if (c.type === 'remove') {
			if (c.target === 'item') items = items.filter((x) => x.id !== c.id);
			else incomes = incomes.filter((x) => x.id !== c.id);
		} else if (c.type === 'change') {
			const apply = <T extends { id: number; versions: { amount: number }[] }>(x: T): T =>
				x.id === c.id ? { ...x, versions: x.versions.map((v) => ({ ...v, amount: changedAmount(c, v.amount) })) } : x;
			if (c.target === 'item') items = items.map(apply);
			else incomes = incomes.map(apply);
		} else if (c.type === 'addItem') {
			const { name, categoryId, kind, amount, interval, share } = c;
			const version = { id: 0, from: month, amount, interval, share, dueMonth: null, note: null, ended: false };
			items = [...items, { id: addedId(i), name, categoryId, kind, assetId: null, reserve: true, versions: [version] }];
		} else {
			const { name, amount, interval, thirteenth } = c;
			const version = { id: 0, from: month, amount, interval, thirteenth, ended: false };
			incomes = [...incomes, { id: addedId(i), name, type: 'other', counted: true, versions: [version] }];
		}
	});
	return { ...base, items, incomes };
}

export interface ScenarioEffect {
	change: ScenarioChange;
	target: 'item' | 'income';
	/** Null when the item or income was deleted */
	name: string | null;
	/** False when the item or income is not active in the month, so the change does nothing */
	active: boolean;
	/** Monthly amount before and with the change; own share for costs */
	before: number;
	after: number;
}

/** What every change of a scenario does on its own, as monthly amounts. */
export function scenarioEffects(data: BudgetData, changes: ScenarioChange[], month: Month): ScenarioEffect[] {
	const base = snapshotData(buildSnapshot(data, month), data);
	return changes.map((change): ScenarioEffect => {
		if (change.type === 'addItem') {
			const { amount, interval, share } = change;
			const after = versionMonthly({ id: 0, from: month, amount, interval, share, dueMonth: null, note: null, ended: false }).mine;
			return { change, target: 'item', name: change.name, active: true, before: 0, after };
		}
		if (change.type === 'addIncome') {
			const { amount, interval, thirteenth } = change;
			const after = incomeMonthly({ id: 0, from: month, amount, interval, thirteenth, ended: false });
			return { change, target: 'income', name: change.name, active: true, before: 0, after };
		}
		const { target, id } = change;
		const name = (target === 'item' ? data.items : data.incomes).find((x) => x.id === id)?.name ?? null;
		const newAmount = (amount: number) => (change.type === 'remove' ? 0 : changedAmount(change, amount));
		if (target === 'item') {
			const v = base.items.find((x) => x.id === id)?.versions[0];
			if (!v) return { change, target, name, active: false, before: 0, after: 0 };
			const after = versionMonthly({ ...v, amount: newAmount(v.amount) }).mine;
			return { change, target, name, active: true, before: versionMonthly(v).mine, after };
		}
		const v = base.incomes.find((x) => x.id === id)?.versions[0];
		if (!v) return { change, target, name, active: false, before: 0, after: 0 };
		return { change, target, name, active: true, before: incomeMonthly(v), after: incomeMonthly({ ...v, amount: newAmount(v.amount) }) };
	});
}

export interface ScenarioComparison {
	month: Month;
	actual: YearSummary;
	scenario: YearSummary;
	effects: ScenarioEffect[];
	/** Months the cash on accounts covers the spending, with today's balances */
	emergency: { actual: number | null; scenario: number | null };
}

/** The budget of a month next to the same budget with the scenario applied. */
export function compareScenario(data: BudgetData, changes: ScenarioChange[], month: Month): ScenarioComparison {
	const actual = summarizeMonth(data, month);
	const scenario = summarizeMonth(scenarioData(data, changes, month), month);
	const { cash } = summarizeAssets(data.assets, month);
	return {
		month,
		actual,
		scenario,
		effects: scenarioEffects(data, changes, month),
		emergency: { actual: emergencyMonths(cash, actual.spending), scenario: emergencyMonths(cash, scenario.spending) }
	};
}

/** Money that is free to put towards a goal: saving items that feed no asset plus what is left over. */
export function freeSaving(s: YearSummary): number {
	const unlinked = s.items
		.filter((x) => x.item.kind === 'saving' && x.item.assetId === null)
		.reduce((a, x) => a + x.monthly.mine, 0);
	return unlinked + Math.max(s.free, 0);
}

export interface GoalStatus {
	goal: Goal;
	/** The asset whose balance is the progress; null for goals without one */
	asset: Asset | null;
	current: number;
	remaining: number;
	/** Months left including the current one; 0 once the due month has passed */
	monthsLeft: number;
	/** Monthly saving needed to reach the target in time; null when reached or too late */
	needed: number | null;
	/** Monthly saving that goes towards the goal today, own share */
	pace: number;
	/**
	 * 'items': the saving items that feed the asset. 'budget': saving items that feed no asset plus
	 * what is left over, for goals without an asset or with an asset no saving item feeds.
	 */
	paceFrom: 'items' | 'budget';
	/** Month the target is reached at this pace; null without any pace */
	reachedBy: Month | null;
	state: 'reached' | 'onTrack' | 'behind' | 'missed';
}

/**
 * Where a goal stands in `today` and whether the current saving reaches it in time. Market gains
 * are not projected: the pace counts only what is paid in. `available` is the free saving left for
 * this goal when it shares it with others (see `goalStatuses`).
 */
export function goalStatus(data: BudgetData, goal: Goal, today: Month, available?: number): GoalStatus {
	const asset = goal.assetId === null ? null : (data.assets.find((a) => a.id === goal.assetId) ?? null);
	const current = asset ? balanceAt(asset, today) : goal.saved;
	const remaining = Math.max(goal.target - current, 0);
	const monthsLeft = goal.due < today ? 0 : monthsBetween(today, goal.due) + 1;

	const fromItems = asset
		? linkedItems(data.items, asset.id).reduce((a, item) => {
				const v = versionAt(item.versions, today);
				return a + (v ? versionMonthly(v).mine : 0);
			}, 0)
		: 0;
	const paceFrom = fromItems > 0 ? 'items' : 'budget';
	const pace = paceFrom === 'items' ? fromItems : (available ?? freeSaving(summarizeMonth(data, today)));

	const needed = remaining > 0 && monthsLeft > 0 ? remaining / monthsLeft : null;
	const reachedBy = remaining === 0 ? today : pace > 0 ? addMonths(today, Math.ceil(remaining / pace) - 1) : null;
	const state =
		remaining === 0 ? 'reached' : monthsLeft === 0 ? 'missed' : pace >= needed! - 100 ? 'onTrack' : 'behind';
	return { goal, asset, current, remaining, monthsLeft, needed, pace, paceFrom, reachedBy, state };
}

/**
 * Every goal, in the order given. Goals without their own saving items share the free saving: the one
 * due first takes what it needs, the next one gets the rest, so two goals are never both counted on
 * the same money.
 */
export function goalStatuses(data: BudgetData, today: Month): GoalStatus[] {
	let free = freeSaving(summarizeMonth(data, today));
	const byDue = [...data.goals].sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
	const statuses = new Map<number, GoalStatus>();
	for (const goal of byDue) {
		const s = goalStatus(data, goal, today, free);
		if (s.paceFrom === 'budget' && s.needed !== null) free = Math.max(0, free - Math.min(s.needed, s.pace));
		statuses.set(goal.id, s);
	}
	return data.goals.map((g) => statuses.get(g.id)!);
}
