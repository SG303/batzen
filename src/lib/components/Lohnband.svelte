<script lang="ts">
	import type { CategorySummary } from '#lib/domain.ts';
	import { catColor } from '#lib/categories.ts';
	import { chf, percent } from '#lib/money.ts';
	import { forPeriod, periodSuffix } from '#lib/prefs.svelte.ts';

	/**
	 * The income as one band: each category takes its share from the left, what stays empty
	 * on the right is what is left over. All values are monthly, own share.
	 */
	let {
		income,
		categories,
		scale: sharedScale
	}: {
		income: number;
		categories: CategorySummary[];
		/** Full width in Rappen, to compare several bands; defaults to the larger of income and spending */
		scale?: number;
	} = $props();

	const out = $derived(categories.reduce((a, c) => a + c.monthly.mine, 0));
	const scale = $derived(Math.max(income, out, 1));
	/** Share of the available width this band takes when compared with others */
	const extent = $derived(scale / Math.max(sharedScale ?? 0, scale));
	const free = $derived(income - out);
	const over = $derived(out > income);

	let width = $state(0);
	let active = $state<number | null>(null);
	let tipX = $state(0);

	type Segment = { key: number; name: string; color: string; value: number; left: number; w: number };

	const segments = $derived.by(() => {
		let left = 0;
		return categories
			.filter((c) => c.monthly.mine > 0)
			.map((c): Segment => {
				const w = c.monthly.mine / scale;
				const s = { key: c.category.id, name: c.category.name, color: catColor(c.category.color), value: c.monthly.mine, left, w };
				left += w;
				return s;
			});
	});

	const activeSegment = $derived(segments.find((s) => s.key === active) ?? null);

	// Only label segments that comfortably fit their text below the band.
	// The free amount is always labelled at the right edge; keep clear of it.
	const freeLabel = $derived(!over && free > 0);
	const labelled = $derived(
		segments.filter((s) => s.w * width >= 84 && (!freeLabel || (s.left + s.w) * width < width - 56))
	);

	function show(s: Segment) {
		active = s.key;
		tipX = (s.left + s.w / 2) * width;
	}
</script>

<div class="relative" style="width: {extent * 100}%" bind:clientWidth={width}>
	<div
		class="flex h-12 gap-[2px] overflow-hidden rounded-[10px] bg-sunken sm:h-16"
		role="group"
		aria-label="Aufteilung des Einkommens"
	>
		{#each segments as s (s.key)}
			<button
				type="button"
				class="h-full min-w-[3px] rounded-[3px] transition-[filter,opacity] first:rounded-l-[10px] {active !== null && active !== s.key ? 'opacity-55' : ''}"
				style="width: {s.w * 100}%; background: {s.color}"
				aria-label="{s.name}: CHF {chf(forPeriod(s.value))} {periodSuffix()}, {percent(s.value, income)} des Einkommens"
				onpointerenter={() => show(s)}
				onpointerleave={() => (active = null)}
				onfocus={() => show(s)}
				onblur={() => (active = null)}
			></button>
		{/each}
	</div>

	{#if over}
		<div
			class="pointer-events-none absolute -top-2 -bottom-2 w-[2px] rounded-full bg-ink"
			style="left: calc({(income / scale) * 100}% - 1px)"
			aria-hidden="true"
		></div>
	{/if}

	{#if activeSegment}
		<div
			class="pointer-events-none absolute bottom-full z-10 mb-3 -translate-x-1/2 rounded-xl border border-rule bg-surface px-3.5 py-2.5 whitespace-nowrap shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)]"
			style="left: clamp(90px, {tipX}px, calc(100% - 90px))"
			role="tooltip"
		>
			<div class="text-[1.0625rem] font-semibold">CHF {chf(forPeriod(activeSegment.value))}</div>
			<div class="flex items-center gap-2 text-[0.8125rem] text-ink-2">
				<span class="h-[2px] w-3 rounded-full" style="background: {activeSegment.color}"></span>
				{activeSegment.name}, {percent(activeSegment.value, income)}
			</div>
		</div>
	{/if}

	<div class="relative mt-3 h-10 text-[0.8125rem]" aria-hidden="true">
		{#each labelled as s (s.key)}
			<div class="absolute top-0 pr-2" style="left: {s.left * 100}%; max-width: {s.w * 100}%">
				<div class="truncate text-ink-2 [font-stretch:85%]">{s.name}</div>
				<div class="num text-ink">{chf(forPeriod(s.value))}</div>
			</div>
		{/each}
		{#if freeLabel}
			<div class="absolute top-0 right-0 text-right">
				<div class="text-ink-2 [font-stretch:85%]">frei</div>
				<div class="num font-semibold text-accent">{chf(forPeriod(free))}</div>
			</div>
		{/if}
		{#if over}
			<div class="absolute top-0 text-ink-2" style="left: {(income / scale) * 100}%; transform: translateX(-100%)">
				<div class="pr-2 text-right [font-stretch:85%]">Einkommen</div>
			</div>
		{/if}
	</div>
</div>
