import { beforeAll, describe, expect, it } from 'vitest';
import { checkInPerformance, yearPerformance } from '#lib/domain.ts';
import { loadData } from './repo';
import { loadSample } from './sample';

beforeAll(() => loadSample());

describe('yearPerformance', () => {
	it('adds up contributions and market of every check-in in the year against the one before', () => {
		const data = loadData();
		const [, c2024, c2025a, c2025b] = data.checkIns;
		const rows = [...checkInPerformance(c2025a, c2024, data), ...checkInPerformance(c2025b, c2025a, data)];
		const p = yearPerformance(data, 2025)!;
		expect(p.since).toBe('2024-03');
		expect(p.paidIn).toBe(rows.reduce((a, r) => a + r.paidIn, 0));
		expect(p.market).toBe(rows.reduce((a, r) => a + r.market, 0));
		expect(p.paidIn).toBeGreaterThan(0);
	});

	it('is null for years without check-ins that confirm contributions', () => {
		expect(yearPerformance(loadData(), 2023)).toBeNull();
		expect(yearPerformance(loadData(), 2030)).toBeNull();
	});
});
