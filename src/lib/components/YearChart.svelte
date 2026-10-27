<script lang="ts">
	import type { YearSummary } from '#lib/domain.ts';
	import { catColor } from '#lib/categories.ts';
	import { privacy } from '#lib/privacy.svelte.ts';
	import { chf } from '#lib/money.ts';
	import { forPeriod, periodSuffix } from '#lib/prefs.svelte.ts';

	/** Stacked columns per year (own share by category) with the income as a tick above. */
	let { years }: { years: YearSummary[] } = $props();

	let width = $state(640);
	const height = 300;
	const pad = { top: 16, right: 8, bottom: 32, left: 48 };

	const plotW = $derived(Math.max(width - pad.left - pad.right, 10));
	const plotH = height - pad.top - pad.bottom;

	const max = $derived(
		Math.max(1, ...years.map((y) => Math.max(y.income.counted, y.spending + y.saving)))
	);
	const ticks = $derived.by(() => {
		const raw = forPeriod(max) / 100 / 4;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)! * 100;
		const top = Math.ceil(forPeriod(max) / step) * step;
		return { step, top, values: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
	});
	const y = (v: number) => pad.top + plotH - (forPeriod(v) / ticks.top) * plotH;

	const band = $derived(plotW / Math.max(years.length, 1));
	const barW = $derived(Math.min(36, band * 0.46));
	const x = (i: number) => pad.left + band * i + (band - barW) / 2;

	type Seg = { key: string; name: string; color: string; value: number; y0: number; y1: number; top: boolean };
	const columns = $derived(
		years.map((s, i) => {
			let acc = 0;
			const cats = s.categories.filter((c) => c.monthly.mine > 0);
			const segs: Seg[] = cats.map((c, k) => {
				const y0 = y(acc);
				acc += c.monthly.mine;
				return {
					key: `${s.year}-${c.category.id}`,
					name: c.category.name,
					color: catColor(c.category.color),
					value: c.monthly.mine,
					y0,
					y1: y(acc),
					top: k === cats.length - 1
				};
			});
			return { s, i, segs };
		})
	);

	let tip = $state<{ x: number; y: number; title: string; value: number; color?: string } | null>(null);

	/** Column with only the top end rounded (4px), square at the baseline. */
	function topRounded(x0: number, yTop: number, w: number, h: number, r = 4) {
		r = Math.min(r, h, w / 2);
		return `M${x0},${yTop + h}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x0 + w - r}Q${x0 + w},${yTop} ${x0 + w},${yTop + r}V${yTop + h}Z`;
	}
</script>

<div class="relative" bind:clientWidth={width}>
	<svg {width} {height} role="img" aria-label="Ausgaben pro Kategorie und Einkommen pro Jahr. Die Werte stehen auch in der Tabelle darunter.">
		{#each ticks.values as t (t)}
			{@const ty = pad.top + plotH - (t / ticks.top) * plotH}
			<line x1={pad.left} x2={width - pad.right} y1={ty} y2={ty} stroke={t === 0 ? 'var(--rule-strong)' : 'var(--rule)'} stroke-width="1" />
			<text x={pad.left - 10} y={ty} dy="0.32em" text-anchor="end" class="num fill-ink-3 text-[11px]">
				{t >= 100000 && !privacy.on ? `${chf(t / 1000)}k` : chf(t)}
			</text>
		{/each}

		{#each columns as col (col.s.year)}
			{#each col.segs as seg (seg.key)}
				{@const h = Math.max(seg.y0 - seg.y1 - 2, 1)}
				{#if seg.top}
					<path d={topRounded(x(col.i), seg.y1, barW, h)} fill={seg.color} class="seg" />
				{:else}
					<rect x={x(col.i)} y={seg.y1} width={barW} height={h} fill={seg.color} class="seg" />
				{/if}
				<rect
					x={x(col.i) - 6}
					y={seg.y1}
					width={barW + 12}
					height={Math.max(seg.y0 - seg.y1, 6)}
					fill="transparent"
					tabindex="0"
					role="button"
					aria-label="{col.s.year}, {seg.name}: CHF {chf(forPeriod(seg.value))}"
					onpointerenter={() => (tip = { x: x(col.i) + barW / 2, y: seg.y1, title: `${seg.name}, ${col.s.year}`, value: seg.value, color: seg.color })}
					onpointerleave={() => (tip = null)}
					onfocus={() => (tip = { x: x(col.i) + barW / 2, y: seg.y1, title: `${seg.name}, ${col.s.year}`, value: seg.value, color: seg.color })}
					onblur={() => (tip = null)}
				/>
			{/each}
			{#if col.s.income.counted > 0}
				{@const iy = y(col.s.income.counted)}
				<line x1={x(col.i) - 8} x2={x(col.i) + barW + 8} y1={iy} y2={iy} stroke="var(--ink)" stroke-width="2" stroke-linecap="round" />
				<rect
					x={x(col.i) - 10}
					y={iy - 8}
					width={barW + 20}
					height="16"
					fill="transparent"
					role="button"
					tabindex="0"
					aria-label="{col.s.year}, Einkommen: CHF {chf(forPeriod(col.s.income.counted))}"
					onpointerenter={() => (tip = { x: x(col.i) + barW / 2, y: iy, title: `Einkommen ${col.s.year}`, value: col.s.income.counted })}
					onpointerleave={() => (tip = null)}
					onfocus={() => (tip = { x: x(col.i) + barW / 2, y: iy, title: `Einkommen ${col.s.year}`, value: col.s.income.counted })}
					onblur={() => (tip = null)}
				/>
			{/if}
			<text x={x(col.i) + barW / 2} y={height - 8} text-anchor="middle" class="num fill-ink-2 text-[12px]">{col.s.year}</text>
		{/each}
	</svg>

	{#if tip}
		<div
			class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-rule bg-surface px-3.5 py-2.5 whitespace-nowrap shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)]"
			style="left: clamp(80px, {tip.x}px, calc(100% - 80px)); top: {tip.y - 10}px"
			role="tooltip"
		>
			<div class="text-[1rem] font-semibold">CHF {chf(forPeriod(tip.value))} <span class="font-normal text-ink-2 text-[0.8125rem]">{periodSuffix()}</span></div>
			<div class="flex items-center gap-2 text-[0.8125rem] text-ink-2">
				<span class="h-[2px] w-3 rounded-full" style="background: {tip.color ?? 'var(--ink)'}"></span>
				{tip.title}
			</div>
		</div>
	{/if}
</div>

<style>
	.seg {
		transition: opacity 120ms;
	}
	svg:has(rect[role='button']:hover) .seg {
		opacity: 0.85;
	}
	rect[role='button'] {
		outline: none;
		cursor: default;
	}
</style>
