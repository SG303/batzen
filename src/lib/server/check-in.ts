import { INTERVALS, normalizeDueMonth } from '#lib/domain.ts';
import type { CheckInChange } from './repo';

/** Validates the changes posted by the check-in page; null if anything is malformed. */
export function parseChanges(raw: unknown): CheckInChange[] | null {
	if (!Array.isArray(raw)) return null;
	const out: CheckInChange[] = [];
	for (const c of raw) {
		if (!c || typeof c !== 'object') return null;
		const id = Number(c.id);
		if (!Number.isInteger(id) || id <= 0) return null;
		if (c.target !== 'item' && c.target !== 'income' && c.target !== 'asset') return null;
		if (c.action === 'end') {
			out.push({ target: c.target, id, action: 'end' });
			continue;
		}
		if (c.action !== 'update') return null;
		const amount = Math.round(Number(c.amount));
		if (!Number.isFinite(amount) || amount < 0) return null;
		if (c.target === 'asset') {
			out.push({ target: 'asset', id, action: 'update', balance: amount });
		} else if (c.target === 'item') {
			const interval = INTERVALS.find((i) => i.value === c.interval)?.value ?? 'monthly';
			const share = Math.min(100, Math.max(0, Math.round(Number(c.share ?? 100))));
			const dueMonth = normalizeDueMonth(interval, c.dueMonth ?? null);
			out.push({ target: 'item', id, action: 'update', amount, interval, share, dueMonth });
		} else {
			out.push({
				target: 'income',
				id,
				action: 'update',
				amount,
				interval: c.interval === 'yearly' ? 'yearly' : 'monthly',
				thirteenth: Boolean(c.thirteenth)
			});
		}
	}
	return out;
}

/** Validates the confirmed contributions ([{ id, amount }], Rappen per asset); null if malformed. */
export function parseContributions(raw: unknown): Map<number, number> | null {
	if (!Array.isArray(raw)) return null;
	const out = new Map<number, number>();
	for (const c of raw) {
		if (!c || typeof c !== 'object') return null;
		const id = Number(c.id);
		const amount = Number(c.amount);
		if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(amount) || amount < 0) return null;
		out.set(id, amount);
	}
	return out;
}
