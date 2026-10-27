import { privacy } from './privacy.svelte.ts';

/** Shown instead of an amount in privacy mode */
export const HIDDEN = '•••';

const whole = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 1 });

/** Rappen → "1’240" (rounded to whole francs, the app's default precision). */
export function chf(rappen: number): string {
	if (privacy.on) return HIDDEN;
	return whole.format(Math.round(rappen / 100));
}

/** Rappen → "13.95", or "13.–" for whole amounts (Swiss price notation). */
export function chfExact(rappen: number): string {
	if (privacy.on) return HIDDEN;
	if (rappen % 100 === 0) return `${whole.format(rappen / 100)}.–`;
	return exact.format(rappen / 100);
}

/** Signed difference, e.g. "+120" or "−45". */
export function chfDelta(rappen: number): string {
	if (privacy.on) return HIDDEN;
	const v = Math.round(rappen / 100);
	if (v === 0) return '±0';
	return `${v > 0 ? '+' : '−'}${whole.format(Math.abs(v))}`;
}

export function percent(part: number, whole: number): string {
	if (!whole) return '–';
	return `${oneDecimal.format((part / whole) * 100)} %`;
}

export function decimal(value: number): string {
	return oneDecimal.format(value);
}

/** Parse user input like "1'234.50", "1234,5" or "13.–" into Rappen. */
export function parseChf(input: string): number | null {
	const cleaned = input
		.replace(/[’'\s]/g, '')
		.replace(/\.–$|\.-$/, '')
		.replace(',', '.');
	if (!cleaned) return null;
	const value = Number(cleaned);
	if (!Number.isFinite(value) || value < 0) return null;
	return Math.round(value * 100);
}

/** Rappen → editable input string "1234.50" */
export function toInput(rappen: number): string {
	return rappen % 100 === 0 ? String(rappen / 100) : (rappen / 100).toFixed(2);
}
