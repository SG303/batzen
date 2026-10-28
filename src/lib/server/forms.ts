import {
	ASSET_TYPES,
	INCOME_TYPES,
	INTERVALS,
	ITEM_NOTE_MAX,
	KINDS,
	type AssetType,
	type IncomeType,
	normalizeDueMonth,
	type Interval,
	type ItemKind,
	type ScenarioChange
} from '#lib/domain.ts';
import { parseChf } from '#lib/money.ts';

/** Small, explicit parsers for form posts. Each returns a value or an error message. */

export class FormError extends Error {}

export function text(form: FormData, key: string, label: string): string {
	const value = String(form.get(key) ?? '').trim();
	if (!value) throw new FormError(`${label} fehlt.`);
	return value.slice(0, 200);
}

export function id(form: FormData, key = 'id'): number {
	const value = Number(form.get(key));
	if (!Number.isInteger(value) || value <= 0) throw new FormError('Eintrag nicht gefunden.');
	return value;
}

export function optionalId(form: FormData, key: string): number | undefined {
	const value = Number(form.get(key));
	return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function month(form: FormData, key = 'from'): string {
	const value = String(form.get(key) ?? '');
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new FormError('Wähle einen gültigen Monat.');
	return value;
}

export function amount(form: FormData): number {
	const value = parseChf(String(form.get('amount') ?? ''));
	if (value === null) throw new FormError('Gib einen Betrag ein, zum Beispiel 49.90.');
	return value;
}

export function interval(form: FormData): Interval {
	const value = String(form.get('interval'));
	return (INTERVALS.find((i) => i.value === value)?.value ?? 'monthly') as Interval;
}

/** Optional month of the year (1–12) a bill is due; null if not given or the interval is monthly. */
export function dueMonth(form: FormData, interval: Interval): number | null {
	return normalizeDueMonth(interval, form.get('dueMonth'));
}

/** Optional note of an item version, e.g. the provider or what the bundle includes. */
export function itemNote(form: FormData): string | null {
	return optionalText(form, 'note', ITEM_NOTE_MAX);
}

/** Whether an item counts towards the reserve; posted as '1' or '0', counts when missing. */
export function reserve(form: FormData): boolean {
	return form.get('reserve') !== '0';
}

export function kind(form: FormData): ItemKind {
	const value = String(form.get('kind'));
	return KINDS.find((k) => k.value === value)?.value ?? 'fixed';
}

export function incomeType(form: FormData): IncomeType {
	const value = String(form.get('type'));
	return INCOME_TYPES.find((t) => t.value === value)?.value ?? 'salary';
}

export function assetType(form: FormData): AssetType {
	const value = String(form.get('type'));
	return ASSET_TYPES.find((t) => t.value === value)?.value ?? 'other';
}

/** Optional free text; blank becomes null. */
export function optionalText(form: FormData, key: string, max = 200): string | null {
	return String(form.get(key) ?? '').trim().slice(0, max) || null;
}

export function share(form: FormData): number {
	const value = Math.round(Number(form.get('share') ?? 100));
	return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
}

/** A whole percentage, e.g. "80" or "80 %". */
export function percent(form: FormData, key = 'value'): number {
	const value = Number(String(form.get(key) ?? '').replace(/[%\s]/g, '').replace(',', '.'));
	if (!Number.isFinite(value) || value < 0 || value > 1000) throw new FormError('Gib eine Prozentzahl ein, zum Beispiel 80.');
	return Math.round(value);
}

/** An amount in CHF under another field name than `amount`; blank is null. */
export function optionalAmount(form: FormData, key: string): number | null {
	const raw = String(form.get(key) ?? '').trim();
	if (!raw) return null;
	const value = parseChf(raw);
	if (value === null) throw new FormError('Gib einen Betrag ein, zum Beispiel 8000.');
	return value;
}

/**
 * One change of a scenario. `what` is 'item:<id>', 'income:<id>', 'newItem' or 'newIncome'; changes to
 * existing entries have a `mode` ('percent', 'amount' or 'remove') and a `value`.
 */
export function scenarioChange(form: FormData): ScenarioChange {
	const what = String(form.get('what') ?? '');
	if (what === 'newItem') {
		return {
			type: 'addItem',
			name: text(form, 'name', 'Der Name'),
			categoryId: id(form, 'categoryId'),
			kind: kind(form),
			amount: amount(form),
			interval: interval(form),
			share: share(form)
		};
	}
	if (what === 'newIncome') {
		return {
			type: 'addIncome',
			name: text(form, 'name', 'Der Name'),
			amount: amount(form),
			interval: interval(form) === 'yearly' ? 'yearly' : 'monthly',
			thirteenth: form.get('thirteenth') === 'on'
		};
	}
	const match = /^(item|income):(\d+)$/.exec(what);
	if (!match) throw new FormError('Wähle aus, was sich ändert.');
	const target = match[1] as 'item' | 'income';
	const targetId = Number(match[2]);
	const mode = String(form.get('mode'));
	if (mode === 'remove') return { type: 'remove', target, id: targetId };
	if (mode === 'percent') return { type: 'change', target, id: targetId, mode, value: percent(form) };
	const value = parseChf(String(form.get('value') ?? ''));
	if (value === null) throw new FormError('Gib einen Betrag ein, zum Beispiel 2400.');
	return { type: 'change', target, id: targetId, mode: 'amount', value };
}
