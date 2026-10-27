import type { YearSummary } from './domain.ts';
import { chf } from './money.ts';

/** One honest sentence about how income and spending moved against each other, monthly amounts. */
export function incomeVerdict(prev: YearSummary, s: YearSummary): string {
	const dIncome = s.income.counted - prev.income.counted;
	const dSpend = s.spending - prev.spending;
	const spendText =
		Math.abs(dSpend) < 1000
			? 'deine Ausgaben sind etwa gleich geblieben'
			: `deine Ausgaben um ${chf(Math.abs(dSpend))} Franken ${dSpend > 0 ? 'gestiegen' : 'gesunken'}`;
	if (dIncome >= 1000) {
		const ratio = dSpend / dIncome;
		const head = `Dein Einkommen ist um ${chf(dIncome)} Franken im Monat gestiegen, ${spendText}.`;
		if (ratio >= 1) return `${head} Die Ausgaben wachsen schneller als der Lohn.`;
		if (ratio >= 0.75) return `${head} Fast die ganze Erhöhung fliesst in höhere Ausgaben.`;
		if (ratio >= 0.25) return `${head} Rund ${Math.round(ratio * 100)} % der Erhöhung fliessen in höhere Ausgaben.`;
		return `${head} Der grösste Teil der Erhöhung bleibt dir.`;
	}
	if (dIncome <= -1000) return `Dein Einkommen ist um ${chf(-dIncome)} Franken im Monat gesunken, ${spendText}.`;
	return `Dein Einkommen ist etwa gleich geblieben, ${spendText}.`;
}
