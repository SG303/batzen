import { afterEach, describe, expect, it } from 'vitest';
import { chf, chfDelta, chfExact, HIDDEN, parseChf, percent } from './money';
import { privacy } from './privacy.svelte.ts';

afterEach(() => {
	privacy.on = false;
});

describe('formatting amounts', () => {
	it('formats Rappen in Swiss notation', () => {
		// The thousands separator depends on the ICU data (' or ’)
		expect(chf(124_049)).toMatch(/^1['’]240$/);
		expect(chfExact(1_395)).toBe('13.95');
		expect(chfExact(1_300)).toBe('13.–');
		expect([chfDelta(12_000), chfDelta(-4_500), chfDelta(20)]).toEqual(['+120', '−45', '±0']);
	});

	it('hides every amount in privacy mode, but not percentages', () => {
		privacy.on = true;
		expect([chf(124_049), chfExact(1_395), chfDelta(-4_500)]).toEqual([HIDDEN, HIDDEN, HIDDEN]);
		expect(percent(1, 4)).toBe('25 %');
		// Parsing input is not affected
		expect(parseChf("1'234.50")).toBe(123_450);
	});
});
