<script lang="ts">
	import { MONTH_NAMES, type Category, type Month, type ReservePlan, type ReserveTarget } from '#lib/domain.ts';
	import { catColor } from '#lib/categories.ts';
	import { privacy } from '#lib/privacy.svelte.ts';
	import { chf } from '#lib/money.ts';

	/**
	 * The bills of a year that are not monthly: what falls due in which month against the steady
	 * amount set aside for them, the bills per month as a list, and what has no due month yet.
	 */
	let {
		plan,
		target,
		today,
		categories
	}: {
		plan: ReservePlan;
		/** Only for the running year */
		target: ReserveTarget | null;
		today: Month;
		categories: Category[];
	} = $props();

	const monthName = (m: Month) => MONTH_NAMES[Number(m.slice(5)) - 1];
	const isPast = (m: Month) => m < today;
	const color = (categoryId: number) => catColor(categories.find((c) => c.id === categoryId)?.color ?? 1);

	const dueMonths = $derived(plan.months.filter((m) => m.due.length));
	const peak = $derived(plan.months.reduce((a, m) => (m.reservedDue > a.reservedDue ? m : a), plan.months[0]));

	// Chart
	let width = $state(640);
	const height = 220;
	const pad = { top: 12, right: 8, bottom: 28, left: 48 };
	const plotW = $derived(Math.max(width - pad.left - pad.right, 10));
	const plotH = height - pad.top - pad.bottom;
	const narrow = $derived(width < 480);

	const ticks = $derived.by(() => {
		const max = Math.max(1, ...plan.months.map((m) => Math.max(m.reservedDue, m.setAside)));
		const raw = max / 100 / 3;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)! * 100;
		const top = Math.ceil(max / step) * step;
		return { top, values: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
	});
	const y = (v: number) => pad.top + plotH - (v / ticks.top) * plotH;
	const band = $derived(plotW / 12);
	const barW = $derived(Math.min(28, band * 0.56));
	const x = (i: number) => pad.left + band * i + (band - barW) / 2;

	/** The amount set aside as a step line, one level per month. */
	const setAsidePath = $derived(
		plan.months
			.map((m, i) => `${i === 0 ? 'M' : 'L'}${pad.left + band * i},${y(m.setAside)}H${pad.left + band * (i + 1)}`)
			.join('')
	);

	let tip = $state<{ x: number; y: number; index: number } | null>(null);
	const tipMonth = $derived(tip ? plan.months[tip.index] : null);

	function show(i: number) {
		const m = plan.months[i];
		tip = { x: x(i) + barW / 2, y: Math.min(y(m.reservedDue), y(m.setAside)), index: i };
	}

	/** Column with only the top end rounded (4px), square at the baseline. */
	function topRounded(x0: number, yTop: number, w: number, h: number, r = 4) {
		r = Math.min(r, h, w / 2);
		return `M${x0},${yTop + h}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x0 + w - r}Q${x0 + w},${yTop} ${x0 + w},${yTop + r}V${yTop + h}Z`;
	}
</script>

<p class="mt-1 max-w-[56ch] text-[0.9375rem] text-ink-2">
	Leg jeden Monat {chf(plan.monthly)} Franken zur Seite, dann ist jede Rechnung gedeckt, die nicht monatlich kommt.
</p>

<div class="relative mt-6" bind:clientWidth={width}>
	<svg
		{width}
		{height}
		role="img"
		aria-label="Fällige Rechnungen pro Monat und der Betrag, den du jeden Monat zur Seite legst. Die Rechnungen stehen auch in der Liste darunter."
	>
		{#each ticks.values as t (t)}
			<line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--rule-strong)' : 'var(--rule)'} stroke-width="1" />
			<text x={pad.left - 10} y={y(t)} dy="0.32em" text-anchor="end" class="num fill-ink-3 text-[11px]">
				{t >= 10_000_000 && !privacy.on ? `${chf(t / 1000)}k` : chf(t)}
			</text>
		{/each}

		{#each plan.months as m, i (m.month)}
			{#if m.reservedDue > 0}
				{@const top = y(m.reservedDue)}
				<path
					d={topRounded(x(i), top, barW, Math.max(y(0) - top, 1))}
					class="bar"
					class:past={isPast(m.month)}
					class:dim={tip && tip.index !== i}
				/>
			{/if}
			<text
				x={x(i) + barW / 2}
				y={height - 8}
				text-anchor="middle"
				class="text-[12px] {m.month === today ? 'fill-ink font-semibold' : 'fill-ink-2'}"
			>
				{narrow ? monthName(m.month)[0] : monthName(m.month).slice(0, 3)}
			</text>
		{/each}

		<path d={setAsidePath} fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

		{#each plan.months as m, i (m.month)}
			<rect
				x={pad.left + band * i}
				y={pad.top}
				width={band}
				height={plotH}
				fill="transparent"
				role="button"
				tabindex="0"
				aria-label="{monthName(m.month)}: {m.reservedDue > 0 ? `CHF ${chf(m.reservedDue)} fällig` : 'nichts fällig'}, CHF {chf(m.setAside)} zur Seite"
				onpointerenter={() => show(i)}
				onpointerleave={() => (tip = null)}
				onfocus={() => show(i)}
				onblur={() => (tip = null)}
			/>
		{/each}
	</svg>

	{#if tip && tipMonth}
		{@const shown = tipMonth.due.filter((d) => d.reserved)}
		<div
			class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-rule bg-surface px-3.5 py-2.5 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)]"
			style="left: clamp(100px, {tip.x}px, calc(100% - 100px)); top: {tip.y - 10}px"
			role="tooltip"
		>
			<div class="text-[0.8125rem] text-ink-2">{monthName(tipMonth.month)}</div>
			<div class="text-[1rem] font-semibold whitespace-nowrap">
				{tipMonth.reservedDue > 0 ? `CHF ${chf(tipMonth.reservedDue)} fällig` : 'Nichts fällig'}
			</div>
			{#if shown.length}
				<ul class="mt-1 max-w-[14rem] text-[0.8125rem] text-ink-2">
					{#each shown.slice(0, 4) as d (d.item.id)}<li class="truncate">{d.item.name}</li>{/each}
					{#if shown.length > 4}<li>und {shown.length - 4} weitere</li>{/if}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<ul class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem] text-ink-2" aria-hidden="true">
	<li class="flex items-center gap-2"><span class="bar-key size-2.5 rounded-[3px]"></span>Fällige Rechnungen, dein Anteil</li>
	<li class="flex items-center gap-2"><span class="h-[2px] w-3.5 rounded-full bg-accent"></span>Jeden Monat zur Seite</li>
</ul>

<dl class="mt-6 grid grid-cols-2 gap-y-5 border-y border-rule py-4 sm:grid-cols-3">
	<div>
		<dt class="text-[0.8125rem] text-ink-2">Jeden Monat zur Seite</dt>
		<dd class="num mt-0.5 text-[1.25rem] font-medium text-accent">{chf(plan.monthly)}</dd>
	</div>
	{#if target}
		<div>
			<dt class="text-[0.8125rem] text-ink-2">Sollte Ende {monthName(target.month)} bereitliegen</dt>
			<dd class="num mt-0.5 text-[1.25rem]">{chf(target.total)}</dd>
			{#if target.undated}
				<dd class="text-[0.8125rem] text-ink-3">
					Ohne {target.undated} Posten ohne Fälligkeit
				</dd>
			{/if}
		</div>
	{/if}
	{#if peak.reservedDue > 0}
		<div>
			<dt class="text-[0.8125rem] text-ink-2">Teuerster Monat</dt>
			<dd class="num mt-0.5 text-[1.25rem]">{chf(peak.reservedDue)}</dd>
			<dd class="text-[0.8125rem] text-ink-3">{monthName(peak.month)}</dd>
		</div>
	{/if}
</dl>

{#if dueMonths.length}
	<ol class="mt-2">
		{#each dueMonths as m (m.month)}
			<li class="grid gap-x-6 gap-y-1 border-b border-rule py-3 sm:grid-cols-[9rem_1fr] sm:px-2">
				<span class="font-medium {isPast(m.month) ? 'text-ink-3' : ''}">{monthName(m.month)}</span>
				<ul>
					{#each m.due as d (d.item.id)}
						<li class="grid grid-cols-[1fr_auto] items-baseline gap-4 py-0.5 text-[0.9375rem]">
							<span class="flex min-w-0 items-center gap-3">
								<span class="swatch" style="background: {color(d.item.categoryId)}"></span>
								<span class="min-w-0">
									<span class="block truncate {isPast(m.month) ? 'text-ink-2' : ''}">{d.item.name}</span>
									{#if !d.reserved || d.mine < d.total}
										<span class="block text-[0.8125rem] text-ink-3">
											{[d.mine < d.total ? `dein Anteil von ${chf(d.total)}` : null, d.reserved ? null : 'nicht in der Rückstellung'].filter(Boolean).join(', ')}
										</span>
									{/if}
								</span>
							</span>
							<span class="num text-right {d.reserved && !isPast(m.month) ? '' : 'text-ink-3'}">{chf(d.mine)}</span>
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ol>
{/if}

{#if plan.undated.length}
	<p class="mt-4 max-w-[64ch] text-[0.8125rem] text-ink-3">
		Ohne Fälligkeitsmonat, deshalb nicht im Kalender:
		{plan.undated.map((u) => u.item.name).join(', ')}.
		<a href="/posten" class="underline decoration-rule-strong underline-offset-2 hover:text-ink">Monat ergänzen</a>
	</p>
{/if}

<style>
	.bar,
	.bar-key {
		fill: color-mix(in oklab, var(--ink) 58%, var(--paper));
		background: color-mix(in oklab, var(--ink) 58%, var(--paper));
		transition: opacity 120ms;
	}
	/* Bills already paid this year step back; the ones still to come carry the weight. */
	.bar.past {
		fill: color-mix(in oklab, var(--ink) 26%, var(--paper));
	}
	.bar.dim {
		opacity: 0.55;
	}
	rect[role='button'] {
		outline: none;
		cursor: default;
	}
	rect[role='button']:focus-visible {
		stroke: var(--accent);
		stroke-width: 2;
	}
</style>
