import { describe, expect, it } from 'vitest';
import {
	balanceAt,
	buildSnapshot,
	checkInData,
	compareYears,
	countedByDefault,
	currentMonth,
	emergencyMonths,
	incomeMonthly,
	lastVersionUpTo,
	monthLabel,
	monthsOfYear,
	snapshotData,
	stateAt,
	summarizeAssets,
	summarizeMonth,
	summarizeYear,
	versionAt,
	versionMonthly,
	yearEndAssets,
	yearRange,
	assetPerformance,
	checkInPerformance,
	contributionPrompts,
	lastCheckInUpTo,
	linkedItems,
	monthsAfter,
	plannedContributions,
	withContributions,
	dueLabel,
	dueMonthsOfYear,
	normalizeDueMonth,
	reservePlan,
	reserveTarget,
	addMonths,
	compareScenario,
	freeSaving,
	goalStatus,
	goalStatuses,
	monthsBetween,
	checkInReminder,
	monthsAgoLabel,
	budgetFlow,
	savingsRate,
	scenarioData,
	scenarioEffects,
	type Asset,
	type Goal,
	type ScenarioChange,
	type CheckIn,
	type AssetVersion,
	type BudgetData,
	type Category,
	type IncomeSource,
	type IncomeVersion,
	type Item,
	type ItemVersion
} from './domain';

// Fixtures. Amounts are in Rappen, so 100_000 is CHF 1'000.

let nextId = 1;

function iv(from: string, amount: number, extra: Partial<ItemVersion> = {}): ItemVersion {
	return { id: nextId++, from, amount, interval: 'monthly', share: 100, dueMonth: null, ended: false, ...extra };
}

function ended(from: string): ItemVersion {
	return iv(from, 0, { ended: true });
}

function item(id: number, name: string, versions: ItemVersion[], extra: Partial<Item> = {}): Item {
	return { id, name, categoryId: 1, kind: 'fixed', note: null, assetId: null, reserve: true, versions, ...extra };
}

function inc(from: string, amount: number, extra: Partial<IncomeVersion> = {}): IncomeVersion {
	return { id: nextId++, from, amount, interval: 'monthly', thirteenth: false, ended: false, ...extra };
}

function source(id: number, name: string, versions: IncomeVersion[], extra: Partial<IncomeSource> = {}): IncomeSource {
	return { id, name, type: 'salary', counted: true, versions, ...extra };
}

const CATEGORIES: Category[] = [
	{ id: 1, name: 'Wohnen', color: 1, sort: 2 },
	{ id: 2, name: 'Freizeit', color: 2, sort: 1 },
	{ id: 3, name: 'Leer', color: 3, sort: 3 }
];

function data(items: Item[], incomes: IncomeSource[] = []): BudgetData {
	return { categories: CATEGORIES, items, incomes, assets: [], checkIns: [], goals: [], scenarios: [] };
}

describe('months', () => {
	it('formats the current month with a leading zero', () => {
		expect(currentMonth(new Date(2026, 2, 31))).toBe('2026-03');
		expect(currentMonth(new Date(2026, 11, 1))).toBe('2026-12');
	});

	it('labels months in German, optionally short', () => {
		expect(monthLabel('2026-03')).toBe('März 2026');
		expect(monthLabel('2026-03', true)).toBe('Mär 2026');
		expect(monthLabel('2025-12')).toBe('Dezember 2025');
	});

	it('lists the twelve months of a year', () => {
		const months = monthsOfYear(2026);
		expect(months).toHaveLength(12);
		expect(months[0]).toBe('2026-01');
		expect(months[11]).toBe('2026-12');
	});
});

describe('versionAt', () => {
	const versions = [iv('2025-07', 120_000), iv('2025-01', 100_000), ended('2026-01')];

	it('is null before the first version', () => {
		expect(versionAt(versions, '2024-12')).toBeNull();
	});

	it('picks the latest version that has started, regardless of order', () => {
		expect(versionAt(versions, '2025-01')?.amount).toBe(100_000);
		expect(versionAt(versions, '2025-06')?.amount).toBe(100_000);
		expect(versionAt(versions, '2025-07')?.amount).toBe(120_000);
		expect(versionAt(versions, '2025-12')?.amount).toBe(120_000);
	});

	it('is null once the item has ended', () => {
		expect(versionAt(versions, '2026-01')).toBeNull();
		expect(versionAt(versions, '2030-05')).toBeNull();
	});

	it('applies again after a restart', () => {
		expect(versionAt([...versions, iv('2026-06', 50_000)], '2026-08')?.amount).toBe(50_000);
	});

	it('lastVersionUpTo includes the ended marker', () => {
		expect(lastVersionUpTo(versions, '2026-03')?.ended).toBe(true);
		expect(lastVersionUpTo(versions, '2025-08')?.amount).toBe(120_000);
		expect(lastVersionUpTo(versions, '2024-01')).toBeNull();
	});
});

describe('monthly equivalents', () => {
	it('spreads costs over the year by interval', () => {
		expect(versionMonthly(iv('2025-01', 120_000))).toEqual({ total: 120_000, mine: 120_000 });
		expect(versionMonthly(iv('2025-01', 30_000, { interval: 'quarterly' })).total).toBe(10_000);
		expect(versionMonthly(iv('2025-01', 60_000, { interval: 'semiannual' })).total).toBe(10_000);
		expect(versionMonthly(iv('2025-01', 120_000, { interval: 'yearly' })).total).toBe(10_000);
	});

	it('applies the own share', () => {
		expect(versionMonthly(iv('2025-01', 272_000, { share: 50 }))).toEqual({ total: 272_000, mine: 136_000 });
		expect(versionMonthly(iv('2025-01', 120_000, { share: 0 })).mine).toBe(0);
	});

	it('counts a 13th salary and yearly incomes', () => {
		expect(incomeMonthly(inc('2025-01', 600_000))).toBe(600_000);
		expect(incomeMonthly(inc('2025-01', 600_000, { thirteenth: true }))).toBe(650_000);
		expect(incomeMonthly(inc('2025-01', 1_200_000, { interval: 'yearly' }))).toBe(100_000);
		// 13th salary only applies to monthly pay
		expect(incomeMonthly(inc('2025-01', 1_200_000, { interval: 'yearly', thirteenth: true }))).toBe(100_000);
	});

	it('counts salary and other income by default, bonus and Spesen not', () => {
		expect(countedByDefault('salary')).toBe(true);
		expect(countedByDefault('other')).toBe(true);
		expect(countedByDefault('bonus')).toBe(false);
		expect(countedByDefault('expenses')).toBe(false);
	});
});

describe('yearRange', () => {
	it('is only the current year without data', () => {
		expect(yearRange(data([]), '2026-10')).toEqual([2026]);
	});

	it('spans from the first entry to the current year', () => {
		const d = data([item(1, 'Miete', [iv('2023-05', 100_000)])], [source(1, 'Lohn', [inc('2024-01', 1)])]);
		expect(yearRange(d, '2026-10')).toEqual([2023, 2024, 2025, 2026]);
	});

	it('includes future entries', () => {
		const d = data([item(1, 'Miete', [iv('2025-01', 1), iv('2028-01', 2)])]);
		expect(yearRange(d, '2026-10')).toEqual([2025, 2026, 2027, 2028]);
	});
});

describe('summarizeYear', () => {
	const budget = data(
		[
			// Rent goes up in July: 6 × 1'000 + 6 × 1'200, shared 50/50
			item(1, 'Miete', [iv('2025-01', 200_000, { share: 50 }), iv('2025-07', 240_000, { share: 50 })]),
			// Yearly insurance
			item(2, 'Versicherung', [iv('2024-01', 120_000, { interval: 'yearly' })]),
			// Started in October: 3 of 12 months
			item(3, 'Kino', [iv('2025-10', 4_000)], { categoryId: 2, kind: 'variable' }),
			// Cancelled at the end of March: 3 of 12 months
			item(4, 'Netflix', [iv('2024-01', 2_000), ended('2025-04')], { categoryId: 2 }),
			// Saving counts separately from spending
			item(5, 'Säule 3a', [iv('2025-01', 50_000)], { categoryId: 2, kind: 'saving' })
		],
		[
			// Raise in April, with 13th salary
			source(1, 'Lohn', [inc('2025-01', 600_000, { thirteenth: true }), inc('2025-04', 720_000, { thirteenth: true })]),
			source(2, 'Nebenjob', [inc('2025-07', 120_000)], { type: 'other' }),
			source(3, 'Bonus', [inc('2025-01', 1_200_000, { interval: 'yearly' })], { type: 'bonus', counted: false }),
			source(4, 'Spesen', [inc('2025-01', 30_000)], { type: 'expenses', counted: false })
		]
	);
	const year = summarizeYear(budget, 2025);
	const byName = (name: string) => year.items.find((s) => s.item.name === name)!;

	it('weights changes in the middle of a year by how long they applied', () => {
		expect(byName('Miete').monthly).toEqual({ total: 220_000, mine: 110_000 });
		expect(byName('Miete').yearly).toEqual({ total: 2_640_000, mine: 1_320_000 });
		expect(byName('Miete').current?.amount).toBe(240_000);
	});

	it('counts items that start or end during the year only for their months', () => {
		expect(byName('Kino').monthly.mine).toBe(1_000);
		expect(byName('Netflix').monthly.mine).toBe(500);
		expect(byName('Netflix').current).toBeNull();
		expect(byName('Versicherung').monthly.mine).toBe(10_000);
	});

	it('sums spending by kind and computes what is left', () => {
		expect(year.fixed).toBe(110_000 + 10_000 + 500);
		expect(year.variable).toBe(1_000);
		expect(year.saving).toBe(50_000);
		expect(year.spending).toBe(year.fixed + year.variable);
		expect(year.free).toBe(year.income.counted - year.fixed - year.variable - year.saving);
	});

	it('splits income by type and only counts counted sources', () => {
		// Lohn: 3 × 6'500 + 9 × 7'800 over 12 months
		const salary = (3 * 650_000 + 9 * 780_000) / 12;
		expect(year.income.salary).toBeCloseTo(salary);
		expect(year.income.other).toBeCloseTo(60_000);
		expect(year.income.bonus).toBeCloseTo(100_000);
		expect(year.income.expenses).toBeCloseTo(30_000);
		expect(year.income.counted).toBeCloseTo(salary + 60_000);
		expect(year.excluded).toEqual([
			{ name: 'Bonus', monthly: expect.closeTo(100_000) },
			{ name: 'Spesen', monthly: expect.closeTo(30_000) }
		]);
	});

	it('groups by category in the configured order and skips empty ones', () => {
		expect(year.categories.map((c) => c.category.name)).toEqual(['Freizeit', 'Wohnen']);
		const freizeit = year.categories[0];
		expect(freizeit.items.map((s) => s.item.name)).toEqual(['Säule 3a', 'Kino', 'Netflix']);
		expect(freizeit.monthly.mine).toBe(50_000 + 1_000 + 500);
		expect(year.categories[1].monthly).toEqual({ total: 220_000 + 10_000, mine: 110_000 + 10_000 });
	});

	it('counts the months that have any data', () => {
		expect(year.coveredMonths).toBe(12);
		expect(summarizeYear(budget, 2023).coveredMonths).toBe(0);
		// 2024 only has the insurance and Netflix
		expect(summarizeYear(budget, 2024).coveredMonths).toBe(12);
		const late = data([item(1, 'Miete', [iv('2025-09', 100_000)])]);
		expect(summarizeYear(late, 2025).coveredMonths).toBe(4);
	});

	it('handles a year without any data', () => {
		const empty = summarizeYear(data([]), 2025);
		expect(empty.free).toBe(0);
		expect(empty.categories).toEqual([]);
		expect(empty.coveredMonths).toBe(0);
	});

	it('summarizeMonth shows the figures of that single month', () => {
		const june = summarizeMonth(budget, '2025-06');
		expect(june.year).toBe(2025);
		expect(june.items.find((s) => s.item.name === 'Miete')!.monthly.mine).toBe(100_000);
		expect(june.items.find((s) => s.item.name === 'Kino')!.monthly.mine).toBe(0);
		expect(june.income.counted).toBe(780_000);
		const july = summarizeMonth(budget, '2025-07');
		expect(july.income.counted).toBe(780_000 + 120_000);
	});
});

describe('compareYears', () => {
	const budget = data([
		item(1, 'Miete', [iv('2024-01', 100_000), iv('2025-01', 110_000)]),
		item(2, 'Netflix', [iv('2024-01', 2_000), ended('2025-01')]),
		item(3, 'Gym', [iv('2025-01', 7_000)]),
		item(4, 'Handy', [iv('2024-01', 4_500), iv('2025-01', 3_500)]),
		// Changes below CHF 2 a month are noise
		item(5, 'Spotify', [iv('2024-01', 1_295), iv('2025-01', 1_395)]),
		item(6, 'Strom', [iv('2024-01', 10_000)])
	]);
	const changes = compareYears(summarizeYear(budget, 2024), summarizeYear(budget, 2025));

	it('classifies changes and sorts by size', () => {
		expect(changes.map((c) => [c.item.name, c.kind, c.before, c.after])).toEqual([
			['Miete', 'up', 100_000, 110_000],
			['Gym', 'new', 0, 7_000],
			['Netflix', 'ended', 2_000, 0],
			['Handy', 'down', 4_500, 3_500]
		]);
	});
});

describe('stateAt', () => {
	it('returns the version in effect and the last entry per item and income', () => {
		const d = data(
			[item(1, 'Netflix', [iv('2024-01', 2_000), ended('2025-01')]), item(2, 'Gym', [iv('2027-01', 7_000)])],
			[source(1, 'Lohn', [inc('2024-01', 600_000)])]
		);
		const state = stateAt(d, '2025-06');
		expect(state.items[0].version).toBeNull();
		expect(state.items[0].last?.ended).toBe(true);
		expect(state.items[1].version).toBeNull();
		expect(state.items[1].last).toBeNull();
		expect(state.incomes[0].version?.amount).toBe(600_000);
	});
});

describe('snapshots', () => {
	const budget = data(
		[
			item(1, 'Miete', [iv('2024-01', 200_000, { share: 50 }), iv('2025-07', 240_000, { share: 50 })]),
			item(2, 'Steuern', [iv('2024-01', 1_200_000, { interval: 'yearly' })]),
			item(3, 'Netflix', [iv('2024-01', 2_000), ended('2025-01')], { categoryId: 2 }),
			item(4, 'Gym', [iv('2026-01', 7_000)], { categoryId: 2 })
		],
		[
			source(1, 'Lohn', [inc('2024-01', 700_000, { thirteenth: true })]),
			source(2, 'Bonus', [inc('2024-01', 600_000, { interval: 'yearly' })], { type: 'bonus', counted: false })
		]
	);

	it('freezes only what is in effect at the check-in month', () => {
		const snap = buildSnapshot(budget, '2025-08');
		expect(snap.asOf).toBe('2025-08');
		expect(snap.categories).toEqual(CATEGORIES);
		expect(snap.categories[0]).not.toBe(CATEGORIES[0]);
		expect(snap.items).toEqual([
			{ id: 1, name: 'Miete', categoryId: 1, kind: 'fixed', amount: 240_000, interval: 'monthly', share: 50 },
			{ id: 2, name: 'Steuern', categoryId: 1, kind: 'fixed', amount: 1_200_000, interval: 'yearly', share: 100 }
		]);
		expect(snap.incomes.map((s) => [s.name, s.amount, s.thirteenth, s.counted])).toEqual([
			['Lohn', 700_000, true, true],
			['Bonus', 600_000, false, false]
		]);
	});

	it('gives the same month figures as the live data', () => {
		const month = '2025-08';
		const live = summarizeMonth(budget, month);
		const frozen = summarizeMonth(snapshotData(buildSnapshot(budget, month), budget), month);
		for (const key of ['fixed', 'variable', 'saving', 'spending', 'free'] as const) {
			expect(frozen[key]).toBeCloseTo(live[key]);
		}
		expect(frozen.income).toEqual(live.income);
	});

	it('stays unchanged when the live data changes later', () => {
		const snap = buildSnapshot(budget, '2025-08');
		const later = data(
			[item(1, 'Miete', [iv('2024-01', 300_000)])],
			budget.incomes
		);
		const frozen = summarizeMonth(snapshotData(snap, later), '2025-08');
		expect(frozen.items.find((s) => s.item.name === 'Miete')!.monthly.mine).toBe(120_000);
	});

	it('follows the current counted setting of an income', () => {
		const snap = buildSnapshot(budget, '2025-08');
		const now = { ...budget, incomes: budget.incomes.map((s) => ({ ...s, counted: s.name === 'Bonus' })) };
		const frozen = summarizeMonth(snapshotData(snap, now), '2025-08');
		expect(frozen.income.counted).toBe(50_000);
		// A source deleted since then keeps its frozen setting
		const deleted = summarizeMonth(snapshotData(snap, data([])), '2025-08');
		expect(deleted.income.counted).toBeCloseTo((700_000 * 13) / 12);
	});

	it('rebuilds check-ins without a snapshot from the history', () => {
		const old = checkInData({ id: 1, asOf: '2024-06', completedAt: '', note: null, snapshot: null }, budget);
		expect(old.items.map((i) => [i.name, i.versions[0].amount])).toEqual([
			['Miete', 200_000],
			['Steuern', 1_200_000],
			['Netflix', 2_000]
		]);
		const snap = buildSnapshot(budget, '2025-08');
		const stored = checkInData({ id: 2, asOf: '2025-08', completedAt: '', note: null, snapshot: snap }, data([]));
		expect(stored.items.map((i) => i.name)).toEqual(['Miete', 'Steuern']);
	});
});

// Assets. Balances are in Rappen, so 1_000_000 is CHF 10'000.

function av(from: string, balance: number, extra: Partial<AssetVersion> = {}): AssetVersion {
	return { id: nextId++, from, balance, ended: false, ...extra };
}

function asset(id: number, name: string, versions: AssetVersion[], extra: Partial<Asset> = {}): Asset {
	return { id, name, type: 'account', provider: null, note: null, versions, ...extra };
}

describe('balanceAt', () => {
	const sparkonto = asset(1, 'Sparkonto', [av('2026-01', 1_800_000), av('2026-06', 2_115_000), av('2026-10', 2_390_000)]);

	it('carries the last entry forward until the next one', () => {
		expect(balanceAt(sparkonto, '2026-03')).toBe(1_800_000);
		expect(balanceAt(sparkonto, '2026-06')).toBe(2_115_000);
		expect(balanceAt(sparkonto, '2026-07')).toBe(2_115_000);
		expect(balanceAt(sparkonto, '2027-01')).toBe(2_390_000);
	});

	it('is zero before the first entry and after the asset was closed', () => {
		expect(balanceAt(sparkonto, '2025-12')).toBe(0);
		const closed = asset(2, 'Altes Konto', [av('2025-01', 500_000), av('2026-03', 0, { ended: true })]);
		expect(balanceAt(closed, '2026-02')).toBe(500_000);
		expect(balanceAt(closed, '2026-03')).toBe(0);
		expect(balanceAt(closed, '2027-01')).toBe(0);
	});
});

describe('summarizeAssets', () => {
	const all: Asset[] = [
		asset(1, 'Sparkonto', [av('2026-01', 2_000_000)], { provider: 'Kantonalbank' }),
		asset(2, 'Privatkonto', [av('2026-01', 500_000)], { provider: 'kantonalbank ' }),
		asset(3, 'Säule 3a', [av('2026-01', 3_000_000)], { type: 'pillar3a', provider: 'VIAC' }),
		asset(4, 'Pensionskasse', [av('2026-01', 10_000_000)], { type: 'pension', provider: 'PK' }),
		asset(5, 'Depot', [av('2026-01', 1_500_000)], { type: 'securities', provider: 'Swissquote', note: 'Global ETF' }),
		asset(6, 'Bitcoin', [av('2026-01', 100_000)], { type: 'crypto' }),
		asset(7, 'Neu', [av('2027-01', 9_900_000)]),
		asset(8, 'Aufgelöst', [av('2025-01', 700_000), av('2026-01', 0, { ended: true })])
	];
	const s = summarizeAssets(all, '2026-06');

	it('adds up total, tied and free', () => {
		expect(s.total).toBe(17_100_000);
		// 3a and pension fund are tied up
		expect(s.tied).toBe(13_000_000);
		expect(s.free).toBe(4_100_000);
		expect(s.free + s.tied).toBe(s.total);
	});

	it('counts only accounts as cash', () => {
		expect(s.cash).toBe(2_500_000);
	});

	it('leaves out assets that do not exist in that month', () => {
		expect(s.assets.map((r) => r.asset.name)).toEqual(['Pensionskasse', 'Säule 3a', 'Sparkonto', 'Depot', 'Privatkonto', 'Bitcoin']);
	});

	it('splits by type, largest first', () => {
		expect(s.byType).toEqual([
			{ type: 'pension', total: 10_000_000 },
			{ type: 'pillar3a', total: 3_000_000 },
			{ type: 'account', total: 2_500_000 },
			{ type: 'securities', total: 1_500_000 },
			{ type: 'crypto', total: 100_000 }
		]);
	});

	it('splits by provider ignoring case and blanks, assets without provider together', () => {
		expect(s.byProvider).toEqual([
			{ provider: 'PK', total: 10_000_000 },
			{ provider: 'VIAC', total: 3_000_000 },
			{ provider: 'Kantonalbank', total: 2_500_000 },
			{ provider: 'Swissquote', total: 1_500_000 },
			{ provider: 'Ohne Anbieter', total: 100_000 }
		]);
	});

	it('is all zero without assets', () => {
		expect(summarizeAssets([], '2026-06')).toEqual({
			month: '2026-06',
			total: 0,
			tied: 0,
			free: 0,
			cash: 0,
			byType: [],
			byProvider: [],
			assets: []
		});
	});
});

describe('emergencyMonths', () => {
	it('divides the cash by the monthly spending', () => {
		expect(emergencyMonths(2_500_000, 500_000)).toBe(5);
		expect(emergencyMonths(750_000, 500_000)).toBe(1.5);
		expect(emergencyMonths(0, 500_000)).toBe(0);
	});

	it('is unknown without spending', () => {
		expect(emergencyMonths(2_500_000, 0)).toBeNull();
	});
});

describe('yearEndAssets', () => {
	const all = [
		asset(1, 'Sparkonto', [av('2024-05', 1_000_000), av('2025-11', 1_200_000)]),
		asset(2, 'Säule 3a', [av('2025-03', 2_000_000), av('2026-02', 2_400_000)], { type: 'pillar3a' })
	];

	it('measures every year at 31 December and the running year at the current month', () => {
		expect(yearEndAssets(all, '2026-10')).toEqual([
			{ year: 2024, month: '2024-12', total: 1_000_000, tied: 0, free: 1_000_000 },
			{ year: 2025, month: '2025-12', total: 3_200_000, tied: 2_000_000, free: 1_200_000 },
			{ year: 2026, month: '2026-10', total: 3_600_000, tied: 2_400_000, free: 1_200_000 }
		]);
	});

	it('starts with the year of the first balance and is empty without assets', () => {
		expect(yearEndAssets(all, '2024-06').map((y) => y.year)).toEqual([2024]);
		expect(yearEndAssets([], '2026-10')).toEqual([]);
	});

	it('shows zero for a year in which everything was closed', () => {
		const closed = [asset(1, 'Konto', [av('2023-01', 100_000), av('2024-06', 0, { ended: true })])];
		expect(yearEndAssets(closed, '2025-01').map((y) => y.total)).toEqual([100_000, 0, 0]);
	});
});

describe('asset snapshots', () => {
	const budget: BudgetData = {
		...data([item(1, 'Miete', [iv('2024-01', 200_000)])]),
		assets: [
			asset(1, 'Sparkonto', [av('2025-01', 1_000_000), av('2026-01', 1_500_000)], { provider: 'Bank', note: 'geheim' }),
			asset(2, 'Depot', [av('2026-03', 400_000)], { type: 'securities', provider: null }),
			asset(3, 'Aufgelöst', [av('2025-01', 100_000), av('2025-06', 0, { ended: true })])
		]
	};

	it('freezes the balances in effect at the check-in month', () => {
		expect(buildSnapshot(budget, '2025-09').assets).toEqual([
			{ id: 1, name: 'Sparkonto', type: 'account', provider: 'Bank', balance: 1_000_000 }
		]);
		expect(buildSnapshot(budget, '2026-04').assets?.map((a) => [a.name, a.balance])).toEqual([
			['Sparkonto', 1_500_000],
			['Depot', 400_000]
		]);
	});

	it('gives the same asset figures as the live data', () => {
		const { assets: _live, ...live } = summarizeAssets(budget.assets, '2026-04');
		const frozen = snapshotData(buildSnapshot(budget, '2026-04'), budget);
		const { assets: _frozen, ...figures } = summarizeAssets(frozen.assets, '2026-04');
		expect(figures).toEqual(live);
	});

	it('stays unchanged when the balances change later', () => {
		const snap = buildSnapshot(budget, '2026-04');
		const later = { ...budget, assets: [asset(1, 'Sparkonto', [av('2026-01', 9_900_000)])] };
		expect(summarizeAssets(snapshotData(snap, later).assets, '2026-04').total).toBe(1_900_000);
	});

	it('treats snapshots from before assets existed as having no assets', () => {
		const old = buildSnapshot(budget, '2026-04');
		delete old.assets;
		expect(snapshotData(old, budget).assets).toEqual([]);
	});

	it('rebuilds assets for check-ins without a snapshot from the history', () => {
		const rebuilt = checkInData({ id: 1, asOf: '2025-09', completedAt: '', note: null, snapshot: null }, budget);
		expect(rebuilt.assets.map((a) => [a.name, a.versions[0].balance])).toEqual([['Sparkonto', 1_000_000]]);
	});
});

// Contributions and market performance. 3a: CHF 7'200 a year = CHF 600 a month.

describe('monthsAfter', () => {
	it('lists the months after the start up to and including the end, across years', () => {
		expect(monthsAfter('2025-11', '2026-02')).toEqual(['2025-12', '2026-01', '2026-02']);
		expect(monthsAfter('2026-03', '2026-03')).toEqual([]);
		expect(monthsAfter('2026-05', '2026-03')).toEqual([]);
	});
});

describe('contributions', () => {
	const saving = (id: number, name: string, versions: ItemVersion[], assetId: number | null) =>
		item(id, name, versions, { kind: 'saving', assetId });
	const items = [
		saving(1, '3. Säule a', [iv('2025-01', 720_000, { interval: 'yearly' }), iv('2026-01', 756_000, { interval: 'yearly' })], 10),
		saving(2, 'ETF Sparplan', [iv('2026-01', 50_000), ended('2026-04')], 20),
		saving(3, 'ETF Bonus', [iv('2026-01', 120_000, { interval: 'yearly', share: 50 })], 20),
		saving(4, 'Sparen Privatkonto', [iv('2025-01', 30_000)], null),
		// A cost that points to an asset (e.g. from an old kind change) never counts as contribution
		item(5, 'Depotgebühr', [iv('2025-01', 1_000)], { assetId: 20 })
	];

	it('finds the saving items that feed an asset', () => {
		expect(linkedItems(items, 20).map((i) => i.name)).toEqual(['ETF Sparplan', 'ETF Bonus']);
		expect(linkedItems(items, 99)).toEqual([]);
	});

	it('adds up the planned own share for the months after the start, with changes and endings', () => {
		// Nov + Dec 2025 at 600, Jan to Mar 2026 at 630
		expect(plannedContributions(items, 10, '2025-10', '2026-03')).toBe(2 * 60_000 + 3 * 63_000);
		// Sparplan Jan to Mar (ended in April), Bonus half of 1'200 a year = 50 a month, Jan to Jun
		expect(plannedContributions(items, 20, '2025-12', '2026-06')).toBe(3 * 50_000 + 6 * 5_000);
		expect(plannedContributions(items, 10, '2026-03', '2026-03')).toBe(0);
	});

	const checkIn = (id: number, asOf: string, snapshot: CheckIn['snapshot'] = null): CheckIn => ({
		id,
		asOf,
		completedAt: '',
		note: null,
		snapshot
	});

	it('finds the check-in a new one follows, by month and then by order of recording', () => {
		const list = [checkIn(3, '2026-04'), checkIn(1, '2025-10'), checkIn(2, '2026-04')];
		expect(lastCheckInUpTo(list, '2026-06')?.id).toBe(3);
		expect(lastCheckInUpTo(list, '2026-04')?.id).toBe(3);
		expect(lastCheckInUpTo(list, '2026-01')?.id).toBe(1);
		expect(lastCheckInUpTo(list, '2025-09')).toBeNull();
	});

	const budget: BudgetData = {
		...data(items),
		assets: [
			asset(10, 'Säule 3a', [av('2025-01', 3_000_000)], { type: 'pillar3a' }),
			asset(20, 'Depot', [av('2025-06', 1_000_000)], { type: 'securities' }),
			asset(30, 'Privatkonto', [av('2025-01', 500_000)]),
			asset(40, 'Neues Depot', [av('2026-02', 200_000)], { type: 'securities' })
		]
	};
	// Linked to an asset that only starts after the first check-in
	budget.items.push(saving(6, 'Neuer Sparplan', [iv('2026-02', 10_000)], 40));
	budget.checkIns = [checkIn(1, '2025-10', buildSnapshot(budget, '2025-10'))];

	it('asks only for open assets that are fed by a saving item and were part of the last check-in', () => {
		expect(contributionPrompts(budget, '2026-03')).toEqual([
			{ assetId: 10, since: '2025-10', before: 3_000_000, planned: 2 * 60_000 + 3 * 63_000 },
			{ assetId: 20, since: '2025-10', before: 1_000_000, planned: 3 * 50_000 + 3 * 5_000 }
		]);
	});

	it('asks nothing without a previous check-in or for closed assets', () => {
		expect(contributionPrompts({ ...budget, checkIns: [] }, '2026-03')).toEqual([]);
		const closed = {
			...budget,
			assets: budget.assets.map((a) => (a.id === 10 ? { ...a, versions: [...a.versions, av('2026-03', 0, { ended: true })] } : a))
		};
		expect(contributionPrompts(closed, '2026-03').map((p) => p.assetId)).toEqual([20]);
	});

	it('stores the confirmed amounts with the month of the previous check-in, only where asked', () => {
		const prompts = contributionPrompts(budget, '2026-03');
		const snap = withContributions(
			buildSnapshot(budget, '2026-03'),
			prompts,
			new Map([[10, 0], [30, 99_999]])
		);
		expect(snap.assets?.map((a) => [a.name, a.contributions])).toEqual([
			['Säule 3a', { since: '2025-10', amount: 0 }],
			['Depot', undefined],
			['Privatkonto', undefined],
			['Neues Depot', undefined]
		]);
	});

	it('splits a balance change into contributions and market', () => {
		expect(assetPerformance({ id: 1, name: '3a' }, 4_120_000, 4_480_000, 352_800)).toEqual({
			id: 1,
			name: '3a',
			before: 4_120_000,
			after: 4_480_000,
			paidIn: 352_800,
			market: 7_200
		});
		// Nothing paid in, balance fell: the whole change is the market
		expect(assetPerformance({ id: 1, name: 'Depot' }, 1_000_000, 940_000, 0).market).toBe(-60_000);
	});

	it('compares a check-in with the one before for every asset with confirmed contributions', () => {
		const later = {
			...budget,
			assets: budget.assets.map((a) =>
				a.id === 10 ? { ...a, versions: [...a.versions, av('2026-03', 3_800_000)] } : a
			)
		};
		const first = budget.checkIns[0];
		const snap = withContributions(buildSnapshot(later, '2026-03'), contributionPrompts(later, '2026-03'), new Map([[10, 720_000]]));
		const second = checkIn(2, '2026-03', snap);
		expect(checkInPerformance(second, first, later)).toEqual([
			{ id: 10, name: 'Säule 3a', before: 3_000_000, after: 3_800_000, paidIn: 720_000, market: 80_000 }
		]);
		// No previous check-in, or one that is not the check-in the contributions were confirmed against
		expect(checkInPerformance(second, null, later)).toEqual([]);
		expect(checkInPerformance(second, checkIn(5, '2026-01', buildSnapshot(later, '2026-01')), later)).toEqual([]);
		// Older snapshots have no contributions
		expect(checkInPerformance(checkIn(3, '2026-03', buildSnapshot(later, '2026-03')), first, later)).toEqual([]);
	});
});

describe('due months', () => {
	it('keeps a due month only for valid months and intervals other than monthly', () => {
		expect(normalizeDueMonth('yearly', '3')).toBe(3);
		expect(normalizeDueMonth('quarterly', 12)).toBe(12);
		expect(normalizeDueMonth('monthly', 3)).toBeNull();
		for (const value of ['', null, undefined, '0', '13', '2.5', 'März']) {
			expect(normalizeDueMonth('yearly', value), String(value)).toBeNull();
		}
	});

	it('lists every month a bill is due, starting in January', () => {
		expect(dueMonthsOfYear({ interval: 'yearly', dueMonth: 9 })).toEqual([9]);
		expect(dueMonthsOfYear({ interval: 'semiannual', dueMonth: 10 })).toEqual([4, 10]);
		expect(dueMonthsOfYear({ interval: 'quarterly', dueMonth: 2 })).toEqual([2, 5, 8, 11]);
		expect(dueMonthsOfYear({ interval: 'quarterly', dueMonth: 11 })).toEqual([2, 5, 8, 11]);
		expect(dueMonthsOfYear({ interval: 'yearly', dueMonth: null })).toEqual([]);
		expect(dueMonthsOfYear({ interval: 'monthly', dueMonth: 4 })).toEqual([]);
	});

	it('describes the due months', () => {
		expect(dueLabel({ interval: 'yearly', dueMonth: 3 })).toBe('fällig im März');
		expect(dueLabel({ interval: 'quarterly', dueMonth: 2 })).toBe('fällig im Feb, Mai, Aug, Nov');
		expect(dueLabel({ interval: 'yearly', dueMonth: null })).toBeNull();
	});
});

describe('reservePlan', () => {
	// Taxes CHF 12'000 in September, electricity CHF 240 a quarter from February (half each),
	// rent monthly, a yearly gym without due month, and a 3a switched off from the reserve.
	const budget = data([
		item(1, 'Steuern', [iv('2026-01', 1_200_000, { interval: 'yearly', dueMonth: 9 })]),
		item(2, 'Strom', [iv('2026-01', 24_000, { interval: 'quarterly', dueMonth: 2, share: 50 })]),
		item(3, 'Miete', [iv('2026-01', 272_000)]),
		item(4, 'Gym', [iv('2026-01', 89_000, { interval: 'yearly' })]),
		item(5, '3a', [iv('2026-01', 725_800, { interval: 'yearly', dueMonth: 12 })], { kind: 'saving', reserve: false })
	]);

	it('puts every bill with a due month into its months, monthly items not at all', () => {
		const plan = reservePlan(budget, 2026);
		const names = plan.months.map((m) => m.due.map((d) => d.item.name));
		expect(names[1]).toEqual(['Strom']);
		expect(names[8]).toEqual(['Steuern']);
		expect(names[11]).toEqual(['3a']);
		expect(names[0]).toEqual([]);
		expect(plan.months[1].due[0]).toMatchObject({ total: 24_000, mine: 12_000, reserved: true });
		expect(plan.months[11].due[0].reserved).toBe(false);
		expect(plan.months[11].reservedDue).toBe(0);
	});

	it('sets aside the monthly share of every reserved item, with or without due month', () => {
		const plan = reservePlan(budget, 2026);
		// 1'000 taxes + 40 electricity (own half of 960 a year) + 74.17 gym, no 3a
		const expected = 100_000 + 4_000 + 89_000 / 12;
		expect(plan.months[0].setAside).toBeCloseTo(expected);
		expect(plan.monthly).toBeCloseTo(expected);
		expect(plan.undated.map((u) => [u.item.name, u.reserved])).toEqual([['Gym', true]]);
	});

	it('weights changes during the year and follows a new due month', () => {
		const changed = data([
			item(1, 'Steuern', [
				iv('2026-01', 1_200_000, { interval: 'yearly', dueMonth: 3 }),
				iv('2026-07', 600_000, { interval: 'yearly', dueMonth: 9 })
			])
		]);
		const plan = reservePlan(changed, 2026);
		expect(plan.monthly).toBeCloseTo((6 * 100_000 + 6 * 50_000) / 12);
		expect(plan.months[2].due[0].total).toBe(1_200_000);
		expect(plan.months[8].due[0].total).toBe(600_000);
	});
});

describe('reserveTarget', () => {
	const budget = data([
		item(1, 'Steuern', [iv('2026-01', 1_200_000, { interval: 'yearly', dueMonth: 9 })]),
		item(2, 'Strom', [iv('2026-01', 24_000, { interval: 'quarterly', dueMonth: 2, share: 50 })]),
		item(3, 'Gym', [iv('2026-01', 89_000, { interval: 'yearly' })]),
		item(4, '3a', [iv('2026-01', 725_800, { interval: 'yearly', dueMonth: 12 })], { reserve: false })
	]);

	it('is empty right after a bill and grows until the next one', () => {
		// September: taxes just paid; electricity paid in August, one of three months saved
		expect(reserveTarget(budget, '2026-09').total).toBe(4_000);
		// August: eleven twelfths of the taxes, electricity just paid
		expect(reserveTarget(budget, '2026-08').total).toBe(1_100_000);
		// October: one twelfth of the taxes, two thirds of the own half of electricity
		expect(reserveTarget(budget, '2026-10').total).toBe(100_000 + 8_000);
	});

	it('counts reserved items without due month separately', () => {
		expect(reserveTarget(budget, '2026-10').undated).toBe(1);
	});
});

describe('savingsRate', () => {
	it('splits the rate into saving items and what is left over', () => {
		const budget = data(
			[item(1, 'Miete', [iv('2026-01', 200_000)]), item(2, '3a', [iv('2026-01', 60_000)], { kind: 'saving' })],
			[source(1, 'Lohn', [inc('2026-01', 600_000)])]
		);
		expect(savingsRate(summarizeMonth(budget, '2026-03'))).toEqual({ total: (400_000 / 600_000) * 100, planned: 10, leftover: (340_000 / 600_000) * 100 });
	});

	it('counts a deficit as nothing left over and has no rate without income', () => {
		expect(savingsRate({ income: { counted: 100_000 } as never, saving: 10_000, free: -5_000 })).toEqual({ total: 10, planned: 10, leftover: 0 });
		expect(savingsRate({ income: { counted: 0 } as never, saving: 10_000, free: -10_000 })).toBeNull();
	});
});

describe('month arithmetic', () => {
	it('moves months across years in both directions', () => {
		expect(addMonths('2026-10', 3)).toBe('2027-01');
		expect(addMonths('2026-01', -1)).toBe('2025-12');
		expect(addMonths('2026-05', 0)).toBe('2026-05');
		expect(addMonths('2026-05', 24)).toBe('2028-05');
	});

	it('counts the months between two months', () => {
		expect(monthsBetween('2026-10', '2027-02')).toBe(4);
		expect(monthsBetween('2026-10', '2026-10')).toBe(0);
		expect(monthsBetween('2027-02', '2026-10')).toBe(-4);
	});
});

describe('scenarios', () => {
	const budget = data(
		[
			item(1, 'Miete', [iv('2026-01', 300_000, { share: 50 })]),
			item(2, 'Auto', [iv('2026-01', 45_000)], { categoryId: 2 }),
			item(3, 'Steuern', [iv('2026-01', 1_200_000, { interval: 'yearly' })]),
			item(4, 'Netflix', [iv('2025-01', 2_000), ended('2026-01')], { categoryId: 2 }),
			item(5, 'ETF', [iv('2026-01', 50_000)], { kind: 'saving' })
		],
		[source(1, 'Lohn', [inc('2026-01', 700_000, { thirteenth: true })]), source(2, 'Bonus', [inc('2026-01', 600_000, { interval: 'yearly' })], { type: 'bonus', counted: false })]
	);
	budget.assets = [asset(1, 'Sparkonto', [av('2026-01', 2_400_000)])];

	const workload: ScenarioChange = { type: 'change', target: 'income', id: 1, mode: 'percent', value: 80 };
	const move: ScenarioChange[] = [
		{ type: 'change', target: 'item', id: 1, mode: 'amount', value: 340_000 },
		{ type: 'remove', target: 'item', id: 2 },
		{ type: 'addItem', name: 'GA', categoryId: 2, kind: 'fixed', amount: 399_500, interval: 'yearly', share: 100 }
	];

	it('scales an income by percent and keeps the 13th salary', () => {
		const s = scenarioData(budget, [workload], '2026-10');
		expect(s.incomes[0].versions[0]).toMatchObject({ amount: 560_000, thirteenth: true });
		// The real budget is not touched
		expect(budget.incomes[0].versions[0].amount).toBe(700_000);
	});

	it('replaces an amount in the same interval and keeps the own share, removes and adds items', () => {
		const s = scenarioData(budget, move, '2026-10');
		expect(s.items.map((i) => [i.name, i.versions[0].amount, i.versions[0].share])).toEqual([
			['Miete', 340_000, 50],
			['Steuern', 1_200_000, 100],
			['ETF', 50_000, 100],
			['GA', 399_500, 100]
		]);
		expect(s.items.at(-1)!.id).toBeLessThan(0);
	});

	it('adds an income that counts towards the budget', () => {
		const s = scenarioData(budget, [{ type: 'addIncome', name: 'Nebenjob', amount: 100_000, interval: 'monthly', thirteenth: false }], '2026-10');
		expect(s.incomes.at(-1)).toMatchObject({ name: 'Nebenjob', type: 'other', counted: true });
		expect(summarizeMonth(s, '2026-10').income.counted).toBe(summarizeMonth(budget, '2026-10').income.counted + 100_000);
	});

	it('compares the budget of a month with the scenario', () => {
		const c = compareScenario(budget, [workload, ...move], '2026-10');
		// 13 × 7'000 / 12 vs. 13 × 5'600 / 12
		expect(c.actual.income.counted).toBeCloseTo((700_000 * 13) / 12);
		expect(c.scenario.income.counted).toBeCloseTo((560_000 * 13) / 12);
		// Rent share 1'500 → 1'700, car 450 gone, GA 3'995 a year added
		expect(c.scenario.spending - c.actual.spending).toBeCloseTo(20_000 - 45_000 + 399_500 / 12);
		expect(c.scenario.saving).toBe(c.actual.saving);
		expect(c.emergency.actual).toBeCloseTo(2_400_000 / c.actual.spending);
		expect(c.emergency.scenario).toBeCloseTo(2_400_000 / c.scenario.spending);
	});

	it('shows the monthly effect of every change, own share for costs', () => {
		const effects = scenarioEffects(budget, [workload, ...move], '2026-10');
		expect(effects.map((e) => [e.target, e.name, e.active, Math.round(e.before), Math.round(e.after)])).toEqual([
			['income', 'Lohn', true, Math.round((700_000 * 13) / 12), Math.round((560_000 * 13) / 12)],
			['item', 'Miete', true, 150_000, 170_000],
			['item', 'Auto', true, 45_000, 0],
			['item', 'GA', true, 0, Math.round(399_500 / 12)]
		]);
	});

	it('marks changes to ended or deleted entries as without effect and skips them', () => {
		const changes: ScenarioChange[] = [
			{ type: 'remove', target: 'item', id: 4 },
			{ type: 'change', target: 'income', id: 99, mode: 'percent', value: 50 }
		];
		expect(scenarioEffects(budget, changes, '2026-10').map((e) => [e.name, e.active])).toEqual([
			['Netflix', false],
			[null, false]
		]);
		const figures = (x: ReturnType<typeof summarizeMonth>) => [x.income.counted, x.spending, x.saving, x.free];
		expect(figures(summarizeMonth(scenarioData(budget, changes, '2026-10'), '2026-10'))).toEqual(figures(summarizeMonth(budget, '2026-10')));
	});

	it('without changes gives the figures of the actual budget', () => {
		const c = compareScenario(budget, [], '2026-10');
		expect(c.scenario.free).toBeCloseTo(c.actual.free);
		expect(c.scenario.categories.map((x) => x.monthly.mine)).toEqual(c.actual.categories.map((x) => x.monthly.mine));
	});
});

describe('goals', () => {
	const budget = data(
		[
			item(1, 'Miete', [iv('2026-01', 300_000)]),
			item(2, '3a', [iv('2026-01', 60_000)], { kind: 'saving', assetId: 1 }),
			item(3, 'Ferienkonto', [iv('2026-01', 20_000)], { kind: 'saving' })
		],
		[source(1, 'Lohn', [inc('2026-01', 500_000)])]
	);
	budget.assets = [
		asset(1, 'Säule 3a', [av('2026-01', 1_000_000)], { type: 'pillar3a' }),
		asset(2, 'Sparkonto', [av('2026-01', 2_000_000)])
	];
	const goal = (extra: Partial<Goal>): Goal => ({ id: 1, name: 'Ziel', target: 0, due: '2027-09', assetId: null, saved: 0, ...extra });

	it('counts saving items that feed no asset plus what is left over as free to save', () => {
		// 5'000 − 3'000 − 600 − 200 = 1'200 left over, plus 200 into no asset
		expect(freeSaving(summarizeMonth(budget, '2026-10'))).toBe(140_000);
	});

	it('measures a goal on an asset at the pace of the saving items that feed it', () => {
		const s = goalStatus(budget, goal({ target: 2_000_000, assetId: 1, due: '2027-09' }), '2026-10');
		// October 2026 to September 2027 are 12 months for the missing 10'000
		expect(s).toMatchObject({ current: 1_000_000, remaining: 1_000_000, monthsLeft: 12, pace: 60_000, paceFrom: 'items', state: 'behind' });
		expect(s.needed).toBeCloseTo(1_000_000 / 12);
		// 17 months at 600 → reached in February 2028
		expect(s.reachedBy).toBe('2028-02');
	});

	it('uses the free saving for an asset that no saving item feeds and for goals without asset', () => {
		const onAccount = goalStatus(budget, goal({ target: 3_000_000, assetId: 2 }), '2026-10');
		expect(onAccount).toMatchObject({ current: 2_000_000, pace: 140_000, paceFrom: 'budget', state: 'onTrack' });
		const byHand = goalStatus(budget, goal({ target: 800_000, saved: 100_000, due: '2026-12' }), '2026-10');
		expect(byHand).toMatchObject({ current: 100_000, remaining: 700_000, monthsLeft: 3, paceFrom: 'budget', state: 'behind', reachedBy: '2027-02' });
	});

	it('is reached once the progress covers the target, and missed after the due month', () => {
		expect(goalStatus(budget, goal({ target: 500_000, assetId: 1 }), '2026-10')).toMatchObject({ state: 'reached', remaining: 0, needed: null, reachedBy: '2026-10' });
		expect(goalStatus(budget, goal({ target: 5_000_000, assetId: 1, due: '2026-09' }), '2026-10')).toMatchObject({ state: 'missed', monthsLeft: 0, needed: null });
		// The due month itself still counts
		expect(goalStatus(budget, goal({ target: 1_050_000, assetId: 1, due: '2026-10' }), '2026-10')).toMatchObject({ state: 'onTrack', monthsLeft: 1 });
	});

	it('lets goals without saving items share the free saving, the earliest first', () => {
		const shared: BudgetData = {
			...budget,
			goals: [
				goal({ id: 1, name: 'Später', target: 1_200_000, due: '2027-09' }),
				goal({ id: 2, name: 'Früher', target: 500_000, due: '2027-01' }),
				goal({ id: 3, name: '3a', target: 2_000_000, assetId: 1, due: '2027-09' }),
				goal({ id: 4, name: 'Erreicht', target: 100, saved: 100, due: '2026-12' })
			]
		};
		const s = goalStatuses(shared, '2026-10');
		expect(s.map((x) => x.goal.name)).toEqual(['Später', 'Früher', '3a', 'Erreicht']);
		// "Früher" needs 1'250 a month from October to January and gets all 1'400; 150 are left for "Später"
		expect(s[1]).toMatchObject({ pace: 140_000, state: 'onTrack' });
		expect(s[0]).toMatchObject({ pace: 15_000, state: 'behind' });
		// Goals with their own saving items and reached goals take nothing from the free saving
		expect(s[2]).toMatchObject({ pace: 60_000, paceFrom: 'items' });
		expect(s[3].state).toBe('reached');
	});

	it('has no date to reach the goal without any saving', () => {
		const broke = data([item(1, 'Miete', [iv('2026-01', 600_000)])], [source(1, 'Lohn', [inc('2026-01', 500_000)])]);
		expect(goalStatus(broke, goal({ target: 100_000 }), '2026-10')).toMatchObject({ pace: 0, reachedBy: null, state: 'behind' });
	});
});

describe('check-in reminder', () => {
	const checkIn = (id: number, asOf: string): CheckIn => ({ id, asOf, completedAt: '', note: null, snapshot: null });

	it('waits six months after the start of use without any check-in', () => {
		expect(checkInReminder([], '2026-10', '2026-10')).toEqual({ last: null, monthsAgo: null, due: false });
		expect(checkInReminder([], '2027-03', '2026-10').due).toBe(false);
		expect(checkInReminder([], '2027-04', '2026-10').due).toBe(true);
	});

	it('is due without any check-in when the start is unknown', () => {
		expect(checkInReminder([], '2026-10')).toEqual({ last: null, monthsAgo: null, due: true });
	});

	it('is due six months after the latest check-in, also when older months were backfilled later', () => {
		const list = [checkIn(1, '2026-04'), checkIn(2, '2023-01')];
		expect(checkInReminder(list, '2026-09', '2020-01')).toMatchObject({ monthsAgo: 5, due: false });
		expect(checkInReminder(list, '2026-10', '2020-01')).toMatchObject({ last: { id: 1 }, monthsAgo: 6, due: true });
	});

	it('describes how long ago it was', () => {
		expect([0, 1, 5, 23, 24, 37].map(monthsAgoLabel)).toEqual([
			'diesen Monat',
			'vor einem Monat',
			'vor 5 Monaten',
			'vor 23 Monaten',
			'vor 2 Jahren',
			'vor 3 Jahren'
		]);
	});
});

describe('budgetFlow', () => {
	const budget = data(
		[
			item(1, 'Miete', [iv('2026-01', 300_000, { share: 50 })]),
			item(2, 'Ausgang', [iv('2026-01', 40_000)], { categoryId: 2, kind: 'variable' }),
			item(3, 'ETF', [iv('2026-01', 50_000)], { categoryId: 2, kind: 'saving' }),
			item(4, '3a', [iv('2026-01', 720_000, { interval: 'yearly' })], { categoryId: 2, kind: 'saving' })
		],
		[
			source(1, 'Lohn', [inc('2026-01', 500_000)]),
			source(2, 'Nebenjob', [inc('2026-01', 60_000)], { type: 'other' }),
			source(3, 'Bonus', [inc('2026-01', 600_000, { interval: 'yearly' })], { type: 'bonus', counted: false })
		]
	);

	it('splits the counted income into spending by category, saving by item and what is left', () => {
		const f = budgetFlow(summarizeMonth(budget, '2026-03'));
		expect(f.sources.map((x) => [x.name, x.value])).toEqual([['Lohn', 500_000], ['Nebenjob', 60_000]]);
		// Saving items stay out of the category, even in a category with costs
		expect(f.categories.map((c) => [c.category.name, c.value])).toEqual([['Freizeit', 40_000], ['Wohnen', 150_000]]);
		expect(f.savings.map((x) => [x.item.name, x.value])).toEqual([['3a', 60_000], ['ETF', 50_000]]);
		expect([f.spending, f.saving, f.free, f.deficit]).toEqual([190_000, 110_000, 260_000, 0]);
	});

	it('adds up on both sides, with a deficit as a source of its own', () => {
		for (const income of [500_000, 200_000]) {
			const b = { ...budget, incomes: [source(1, 'Lohn', [inc('2026-01', income)])] };
			const f = budgetFlow(summarizeMonth(b, '2026-03'));
			const left = f.sources.reduce((a, x) => a + x.value, 0) + f.deficit;
			expect(left).toBeCloseTo(f.spending + f.saving + f.free);
			expect(f.categories.reduce((a, c) => a + c.value, 0)).toBeCloseTo(f.spending);
			expect(f.savings.reduce((a, x) => a + x.value, 0)).toBeCloseTo(f.saving);
		}
		const short = budgetFlow(summarizeMonth({ ...budget, incomes: [source(1, 'Lohn', [inc('2026-01', 200_000)])] }, '2026-03'));
		expect([short.free, short.deficit]).toEqual([0, 100_000]);
	});
});
