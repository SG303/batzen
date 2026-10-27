export const PALETTE_SIZE = 8;

export function catColor(slot: number): string {
	return `var(--cat-${((slot - 1) % PALETTE_SIZE) + 1})`;
}
