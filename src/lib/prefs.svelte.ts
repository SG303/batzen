/** View preferences shared across pages and kept in localStorage. */
export const prefs = $state({
	period: 'month' as 'month' | 'year',
	share: 'mine' as 'mine' | 'total',
	/** "Wohin es fliesst" in the overview: flow chart or list */
	flow: 'chart' as 'chart' | 'list'
});

const KEY = 'batzen.prefs';

export function loadPrefs() {
	try {
		Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
	} catch {
		// ignore malformed storage
	}
}

export function savePrefs() {
	localStorage.setItem(KEY, JSON.stringify(prefs));
}

/** Monthly value → value for the selected period. */
export function forPeriod(monthly: number): number {
	return prefs.period === 'year' ? monthly * 12 : monthly;
}

export function periodSuffix(): string {
	return prefs.period === 'year' ? 'im Jahr' : 'im Monat';
}
