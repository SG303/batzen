import { db, schema } from './db';
import { DEFAULT_CATEGORIES, loadData, resetAll } from './repo';
import {
	buildSnapshot,
	contributionPrompts,
	countedByDefault,
	withContributions,
	type AssetType,
	type IncomeType,
	type Interval,
	type ItemKind,
	type ScenarioChange
} from '#lib/domain.ts';

/** [from, CHF, interval, own share %] — `null` as amount marks the item as cancelled */
type V = [string, number | null, Interval?, number?];

/** [name, category, kind, versions, asset the saving goes into] */
const ITEMS: [string, string, ItemKind, V[], string?][] = [
	['Miete mit Parkplatz', 'Wohnen', 'fixed', [['2023-01', 2480, 'monthly', 50], ['2025-01', 2560, 'monthly', 50]]],
	['Nebenkosten', 'Wohnen', 'fixed', [['2023-01', 160, 'monthly', 50]]],
	['Heizkosten', 'Wohnen', 'fixed', [['2023-01', 1400, 'yearly', 50], ['2024-01', 1750, 'yearly', 50]]],
	['Strom', 'Wohnen', 'fixed', [['2023-01', 190, 'quarterly', 50], ['2024-01', 230, 'quarterly', 50]]],
	['Internet & Fernsehen', 'Wohnen', 'fixed', [['2023-01', 65, 'monthly', 50]]],
	['Serafe', 'Wohnen', 'fixed', [['2023-01', 335, 'yearly', 50]]],

	['Staats- und Gemeindesteuern', 'Steuern', 'fixed', [['2023-01', 8600, 'yearly'], ['2024-01', 9300, 'yearly'], ['2025-01', 10200, 'yearly'], ['2026-01', 10900, 'yearly']]],

	['Krankenkasse', 'Versicherungen & Gesundheit', 'fixed', [['2023-01', 362, 'monthly'], ['2024-01', 395, 'monthly'], ['2025-01', 431, 'monthly'], ['2026-01', 456.8, 'monthly']]],
	['Hausrat, Haftpflicht, Rechtsschutz, Reise', 'Versicherungen & Gesundheit', 'fixed', [['2023-01', 580, 'yearly', 50]]],
	['Fitnessabo', 'Versicherungen & Gesundheit', 'fixed', [['2023-01', 720, 'yearly'], ['2025-01', 840, 'yearly']]],

	['Lebensmittel', 'Essen & Alltag', 'variable', [['2023-01', 1000, 'monthly', 50], ['2024-01', 1100, 'monthly', 50], ['2025-01', 1200, 'monthly', 50]]],
	['Kleider', 'Essen & Alltag', 'variable', [['2023-01', 90, 'monthly'], ['2025-01', 120, 'monthly']]],
	['Coiffeur', 'Essen & Alltag', 'fixed', [['2023-01', 40, 'monthly']]],
	['Sonstige Anschaffungen', 'Essen & Alltag', 'variable', [['2023-01', 100, 'monthly'], ['2025-01', 150, 'monthly']]],

	['Auto', 'Mobilität', 'fixed', [['2023-01', 380, 'monthly'], ['2025-01', 410, 'monthly']]],
	['Halbtax', 'Mobilität', 'fixed', [['2023-01', 190, 'yearly']]],
	['Zugtickets', 'Mobilität', 'variable', [['2023-01', 50, 'monthly'], ['2025-01', 70, 'monthly']]],

	['Musik-Streaming', 'Abos & Medien', 'fixed', [['2023-01', 12.9, 'monthly'], ['2024-03', 13.9, 'monthly']]],
	['Handyabo', 'Abos & Medien', 'fixed', [['2023-01', 40, 'monthly'], ['2024-06', 30, 'monthly']]],
	['Zeitungsabo', 'Abos & Medien', 'fixed', [['2023-01', 399, 'yearly'], ['2025-01', 429, 'yearly']]],
	['Cloud-Speicher', 'Abos & Medien', 'fixed', [['2023-01', 99, 'yearly']]],
	['Software-Abo', 'Abos & Medien', 'fixed', [['2023-01', 80, 'yearly']]],
	['Video-Streaming', 'Abos & Medien', 'fixed', [['2023-01', 17.9, 'monthly'], ['2024-09', null]]],

	['Auswärts essen', 'Freizeit', 'variable', [['2023-01', 300, 'monthly'], ['2025-01', 360, 'monthly']]],
	['Unternehmungen', 'Freizeit', 'variable', [['2023-01', 150, 'monthly'], ['2025-01', 200, 'monthly']]],

	['3. Säule a', 'Sparen & Vorsorge', 'saving', [['2023-01', 7056, 'yearly'], ['2025-01', 7258, 'yearly']], 'Säule 3a'],
	['Global ETF', 'Sparen & Vorsorge', 'saving', [['2024-06', 400, 'monthly'], ['2025-07', 600, 'monthly']], 'Wertschriftendepot']
];

/**
 * Due month (1–12) of items that are not monthly. The small subscriptions are left without one,
 * as most people would not know.
 */
const DUE: Record<string, number> = {
	Heizkosten: 10,
	Strom: 3,
	Serafe: 4,
	'Staats- und Gemeindesteuern': 9,
	'Hausrat, Haftpflicht, Rechtsschutz, Reise': 1,
	Fitnessabo: 2,
	Halbtax: 6,
	Zeitungsabo: 11,
	'3. Säule a': 12
};

/** Paid from the bonus, so no need to set money aside for it */
const NOT_RESERVED = new Set(['3. Säule a']);

/** [name, type, versions: [from, CHF, interval, 13th salary]] */
const INCOMES: [string, IncomeType, [string, number | null, 'monthly' | 'yearly', boolean?][]][] = [
	['Lohn', 'salary', [['2023-01', 5800, 'monthly', true], ['2024-04', 6050, 'monthly', true], ['2025-04', 6400, 'monthly', true], ['2026-04', 6650, 'monthly', true]]],
	['Bonus', 'bonus', [['2023-01', 2500, 'yearly'], ['2025-01', 4000, 'yearly']]],
	['Spesenpauschale', 'expenses', [['2024-01', 200, 'monthly']]]
];

/** [name, type, provider, note, balances: [from, CHF]] — `null` as balance marks the asset as closed */
const ASSETS: [string, AssetType, string, string | null, [string, number | null][]][] = [
	['Sparkonto', 'account', 'Kantonalbank', null, [['2023-01', 11800], ['2024-03', 15200], ['2025-02', 18600], ['2025-09', 16900], ['2026-04', 21400]]],
	['Privatkonto', 'account', 'Kantonalbank', null, [['2023-01', 4800], ['2025-02', 6100], ['2026-04', 6900]]],
	['Altes Sparkonto', 'account', 'Regionalbank', null, [['2023-01', 2700], ['2024-01', null]]],
	['Säule 3a', 'pillar3a', 'Vorsorgestiftung', 'Globale Aktien', [['2023-01', 24800], ['2024-03', 32100], ['2025-02', 39600], ['2025-09', 45300], ['2026-04', 53900]]],
	['Pensionskasse', 'pension', 'Pensionskasse', 'Stand gemäss Vorsorgeausweis', [['2023-01', 96000], ['2024-03', 104500], ['2025-02', 114800], ['2026-04', 127300]]],
	['Wertschriftendepot', 'securities', 'Online-Broker', 'Globaler Aktien-ETF', [['2024-06', 2400], ['2025-02', 8100], ['2025-09', 13900], ['2026-04', 19800]]],
	['Kryptowährungen', 'crypto', 'Online-Broker', null, [['2024-09', 1500], ['2026-04', 2600]]]
];

/**
 * [month, note, contributions in CHF per asset name]. Assets fed by a saving item but missing here
 * get the planned amount. The 3a is paid once a year in December.
 */
const CHECK_INS: [string, string | null, Record<string, number>?][] = [
	['2023-02', 'Erster Check-in. Startwerte erfasst.'],
	['2024-03', 'Global ETF ab Juni geplant. Strom teurer.', { 'Säule 3a': 7056 }],
	['2025-02', 'Krankenkassenprämie und Mietzins gestiegen.', { 'Säule 3a': 7056 }],
	['2025-09', null, { 'Säule 3a': 0 }],
	['2026-04', 'Lohnerhöhung per April. Steuern höher geschätzt.', { 'Säule 3a': 7258 }]
];

/** [name, target CHF, due month, asset or CHF saved by hand] */
const GOALS: [string, number, string, string | number][] = [
	['Notgroschen auf 30’000', 30000, '2027-12', 'Sparkonto'],
	['Ferienreise', 8000, '2027-06', 1500]
];

type Ref = (kind: 'item' | 'income', name: string) => number;

/** [name, note, changes built from the IDs of the sample items] */
const SCENARIOS: [string, string | null, (ref: Ref, category: (name: string) => number) => ScenarioChange[]][] = [
	['80 % Pensum', 'Ein Tag pro Woche frei, alles andere bleibt.', (ref) => [
		{ type: 'change', target: 'income', id: ref('income', 'Lohn'), mode: 'percent', value: 80 }
	]],
	['Umzug in die Stadt', 'Kleinere Wohnung in der Stadt, dafür ohne Auto.', (ref, category) => [
		{ type: 'change', target: 'item', id: ref('item', 'Miete mit Parkplatz'), mode: 'amount', value: 340_000 },
		{ type: 'remove', target: 'item', id: ref('item', 'Auto') },
		{ type: 'remove', target: 'item', id: ref('item', 'Halbtax') },
		{ type: 'remove', target: 'item', id: ref('item', 'Zugtickets') },
		{ type: 'addItem', name: 'GA 2. Klasse', categoryId: category('Mobilität'), kind: 'fixed', amount: 399_500, interval: 'yearly', share: 100 }
	]]
];

const rappen = (chf: number | null) => Math.round((chf ?? 0) * 100);

export function loadSample() {
	resetAll();
	db.transaction((tx) => {
		const catIds = new Map<string, number>();
		DEFAULT_CATEGORIES.forEach((name, i) => {
			const row = tx
				.insert(schema.categories)
				.values({ name, color: i + 1, sort: i + 1 })
				.returning({ id: schema.categories.id })
				.get();
			catIds.set(name, row.id);
		});

		const assetIds = new Map<string, number>();
		for (const [name, type, provider, note, balances] of ASSETS) {
			const { id } = tx
				.insert(schema.assets)
				.values({ name, type, provider, note })
				.returning({ id: schema.assets.id })
				.get();
			assetIds.set(name, id);
			for (const [from, balance] of balances) {
				tx.insert(schema.assetVersions)
					.values({ assetId: id, from, balance: rappen(balance), ended: balance === null })
					.run();
			}
		}

		for (const [name, category, kind, versions, asset] of ITEMS) {
			const { id } = tx
				.insert(schema.items)
				.values({
					name,
					categoryId: catIds.get(category)!,
					kind,
					assetId: asset ? assetIds.get(asset)! : null,
					reserve: !NOT_RESERVED.has(name)
				})
				.returning({ id: schema.items.id })
				.get();
			for (const [from, amount, interval = 'monthly', share = 100] of versions) {
				tx.insert(schema.itemVersions)
					.values({
						itemId: id,
						from,
						amount: rappen(amount),
						interval,
						share,
						dueMonth: interval === 'monthly' ? null : (DUE[name] ?? null),
						ended: amount === null
					})
					.run();
			}
		}

		for (const [name, type, versions] of INCOMES) {
			const { id } = tx
				.insert(schema.incomeSources)
				.values({ name, type, counted: countedByDefault(type) })
				.returning({ id: schema.incomeSources.id })
				.get();
			for (const [from, amount, interval, thirteenth = false] of versions) {
				tx.insert(schema.incomeVersions)
					.values({ sourceId: id, from, amount: rappen(amount), interval, thirteenth, ended: amount === null })
					.run();
			}
		}

		const loaded = loadData();
		const itemIds = new Map(loaded.items.map((i) => [i.name, i.id]));
		const incomeIds = new Map(loaded.incomes.map((i) => [i.name, i.id]));
		const ref: Ref = (kind, name) => (kind === 'item' ? itemIds : incomeIds).get(name)!;
		for (const [name, note, changes] of SCENARIOS) {
			tx.insert(schema.scenarios)
				.values({ name, note, changes: JSON.stringify(changes(ref, (c) => catIds.get(c)!)) })
				.run();
		}
		for (const [name, target, due, progress] of GOALS) {
			const assetId = typeof progress === 'string' ? assetIds.get(progress)! : null;
			const saved = typeof progress === 'number' ? rappen(progress) : 0;
			tx.insert(schema.goals).values({ name, target: rappen(target), due, assetId, saved }).run();
		}

		// Each check-in confirms the contributions, sometimes different from the plan
		for (const [asOf, note, paidIn = {}] of CHECK_INS) {
			const data = loadData();
			const prompts = contributionPrompts(data, asOf);
			const amounts = new Map(
				prompts.map((p) => {
					const name = data.assets.find((a) => a.id === p.assetId)!.name;
					return [p.assetId, name in paidIn ? rappen(paidIn[name]) : p.planned];
				})
			);
			tx.insert(schema.checkIns)
				.values({
					asOf,
					note,
					completedAt: `${asOf}-15T12:00:00.000Z`,
					snapshot: JSON.stringify(withContributions(buildSnapshot(data, asOf), prompts, amounts))
				})
				.run();
		}
	});
}
