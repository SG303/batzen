<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Printer from '@lucide/svelte/icons/printer';
	import {
		assetTypeInfo,
		compareYears,
		currentMonth,
		monthLabel,
		savingsRate,
		summarizeAssets,
		summarizeYear,
		yearPerformance,
		yearRange
	} from '#lib/domain.ts';
	import { catColor } from '#lib/categories.ts';
	import { chf, chfDelta, decimal, percent } from '#lib/money.ts';
	import { incomeVerdict } from '#lib/verdict.ts';
	import type { PageProps } from './$types';

	/** A year on one page, made to be printed or saved as PDF. All amounts are per year. */
	let { data }: PageProps = $props();
	const budget = $derived(data.data);
	const year = $derived(data.year);
	const today = currentMonth();
	const running = $derived(year === Number(today.slice(0, 4)));

	const s = $derived(summarizeYear(budget, year));
	const prev = $derived(yearRange(budget, today).includes(year - 1) ? summarizeYear(budget, year - 1) : null);
	const rate = $derived(savingsRate(s));
	const prevRate = $derived(prev ? savingsRate(prev) : null);
	const changes = $derived(prev ? compareYears(prev, s).slice(0, 8) : []);
	const verdict = $derived(prev && prev.income.counted > 0 ? incomeVerdict(prev, s) : null);

	const y = (monthly: number) => monthly * 12;

	const figures = $derived([
		{ label: 'Einkommen', value: s.income.counted, before: prev?.income.counted },
		{ label: 'Fixkosten', value: s.fixed, before: prev?.fixed },
		{ label: 'Variable Kosten', value: s.variable, before: prev?.variable },
		{ label: 'Sparen', value: s.saving, before: prev?.saving },
		{ label: 'Frei', value: s.free, before: prev?.free }
	]);

	const categories = $derived(
		s.categories.map((c) => ({
			...c,
			before: prev?.categories.find((p) => p.category.id === c.category.id)?.monthly.mine ?? 0
		}))
	);

	/** Assets at the end of the year, today for the running year */
	const assetMonth = $derived(running ? today : `${year}-12`);
	const assets = $derived(summarizeAssets(budget.assets, assetMonth));
	const prevAssets = $derived(summarizeAssets(budget.assets, `${year - 1}-12`));
	const performance = $derived(yearPerformance(budget, year));
	const checkIns = $derived(
		budget.checkIns.filter((c) => c.asOf.startsWith(`${year}-`)).sort((a, b) => a.asOf.localeCompare(b.asOf))
	);

	const headline = $derived.by(() => {
		if (s.income.counted <= 0) return `Für ${year} ist kein Einkommen erfasst.`;
		const head = `${running ? `${year} kommen` : `${year} sind`} ${chf(y(s.income.counted))} Franken ${running ? 'rein' : 'reingekommen'}.`;
		if (s.free < 0) return `${head} Du gibst ${chf(y(-s.free))} Franken mehr aus, als reinkommt.`;
		return `${head} ${decimal(rate!.total)} % davon ${running ? 'sparst du' : 'hast du gespart'}.`;
	});
</script>

<svelte:head><title>Jahresrückblick {year} · Batzen</title></svelte:head>

<div class="flex items-center justify-between gap-4 pt-8 sm:pt-12 print:hidden">
	<a href="/verlauf" class="inline-flex items-center gap-1.5 text-[0.9375rem] text-ink-2 hover:text-ink"><ArrowLeft size={16} />Verlauf</a>
	<button type="button" class="btn btn-quiet" onclick={() => print()}><Printer size={17} strokeWidth={1.75} />Drucken</button>
</div>

<article class="review">
	<header class="pt-8 sm:pt-10 print:pt-0">
		<p class="text-[0.9375rem] text-ink-2">Jahresrückblick {year}</p>
		<h1 class="mt-2 max-w-[24ch] text-[2rem] leading-[1.1] font-medium tracking-[-0.03em] text-balance sm:text-[2.75rem] print:text-[1.75rem]">
			{headline}
		</h1>
		<p class="mt-3 max-w-[60ch] text-[0.875rem] text-ink-3">
			{running
				? `Stand ${monthLabel(today)}. Die restlichen Monate sind mit dem heutigen Budget gerechnet.`
				: 'Alle Beträge pro Jahr und dein Anteil. Änderungen unter dem Jahr sind anteilig eingerechnet.'}
		</p>
	</header>

	<section class="mt-10" aria-labelledby="figures">
		<h2 id="figures" class="sr-only">Zahlen des Jahres</h2>
		<dl class="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-rule py-5 sm:grid-cols-3 print:grid-cols-3">
			{#each figures as f (f.label)}
				<div>
					<dt class="text-[0.8125rem] text-ink-2">{f.label}</dt>
					<dd class="num mt-0.5 text-[1.25rem] {f.label === 'Frei' ? 'font-medium text-accent' : ''}">{chf(y(f.value))}</dd>
					{#if f.before !== undefined}
						<dd class="num text-[0.8125rem] text-ink-3">{chfDelta(y(f.value - f.before))} gegenüber {year - 1}</dd>
					{/if}
				</div>
			{/each}
			<div>
				<dt class="text-[0.8125rem] text-ink-2">Sparquote</dt>
				<dd class="num mt-0.5 text-[1.25rem]">{rate ? `${decimal(rate.total)} %` : '–'}</dd>
				{#if rate}
					<dd class="num text-[0.8125rem] text-ink-3">{decimal(rate.planned)} % gezielt, {decimal(rate.leftover)} % übrig</dd>
				{/if}
				{#if rate && prevRate}
					<dd class="num text-[0.8125rem] text-ink-3">
						{rate.total >= prevRate.total ? '+' : '−'}{decimal(Math.abs(rate.total - prevRate.total))} Pkt. gegenüber {year - 1}
					</dd>
				{/if}
			</div>
		</dl>
		{#if verdict}<p class="mt-4 max-w-[60ch] text-[0.9375rem] text-ink-2">{verdict}</p>{/if}
		{#if s.excluded.length}
			<p class="mt-2 text-[0.8125rem] text-ink-3">
				Nicht eingerechnet: {s.excluded.map((x) => `${x.name} ${chf(x.monthly * 12)}`).join(', ')}.
			</p>
		{/if}
	</section>

	<div class="mt-12 grid gap-12 md:grid-cols-2 print:grid-cols-2 print:gap-8">
		<section aria-labelledby="categories">
			<h2 id="categories" class="mb-3 text-[1.25rem] font-medium tracking-[-0.015em]">Nach Kategorie</h2>
			<table class="num w-full text-[0.875rem]">
				<thead>
					<tr class="border-b border-rule text-[0.75rem] text-ink-3">
						<th class="py-2 pr-2 text-left font-normal">CHF pro Jahr</th>
						<th class="px-2 py-2 text-right font-normal">Betrag</th>
						<th class="px-2 py-2 text-right font-normal">vom Lohn</th>
						{#if prev}<th class="py-2 pl-2 text-right font-normal">zu {year - 1}</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each categories as c (c.category.id)}
						<tr class="border-b border-rule">
							<th scope="row" class="py-2 pr-2 text-left font-normal">
								<span class="flex items-center gap-2"><span class="swatch" style="background: {catColor(c.category.color)}"></span>{c.category.name}</span>
							</th>
							<td class="px-2 py-2 text-right">{chf(y(c.monthly.mine))}</td>
							<td class="px-2 py-2 text-right text-ink-2">{percent(c.monthly.mine, s.income.counted)}</td>
							{#if prev}<td class="py-2 pl-2 text-right text-ink-2">{chfDelta(y(c.monthly.mine - c.before))}</td>{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section aria-labelledby="changes">
			<h2 id="changes" class="mb-3 text-[1.25rem] font-medium tracking-[-0.015em]">Grösste Veränderungen</h2>
			{#if !prev}
				<p class="text-[0.9375rem] text-ink-2">Für {year - 1} gibt es keine Zahlen zum Vergleichen.</p>
			{:else if changes.length}
				<ul class="border-t border-rule">
					{#each changes as c (c.item.id)}
						<li class="flex items-baseline justify-between gap-4 border-b border-rule py-2 text-[0.875rem]">
							<span class="truncate">{c.item.name}</span>
							<span class="num whitespace-nowrap text-ink-2">
								{#if c.kind === 'new'}
									neu, {chf(y(c.after))}
								{:else if c.kind === 'ended'}
									weggefallen, {chfDelta(y(-c.before))}
								{:else}
									{chf(y(c.before))} auf {chf(y(c.after))}
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-[0.9375rem] text-ink-2">Gegenüber {year - 1} hat sich kein Posten um mehr als 24 Franken im Jahr verändert.</p>
			{/if}
		</section>
	</div>

	{#if assets.total > 0}
		<section class="mt-12" aria-labelledby="assets">
			<h2 id="assets" class="text-[1.25rem] font-medium tracking-[-0.015em]">Vermögen</h2>
			<p class="mt-1 text-[0.875rem] text-ink-2">{running ? `Stand ${monthLabel(today)}.` : `Stand am 31. Dezember ${year}.`}</p>
			<dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-rule py-5 sm:grid-cols-4 print:grid-cols-4">
				<div>
					<dt class="text-[0.8125rem] text-ink-2">Total</dt>
					<dd class="num mt-0.5 text-[1.25rem] font-medium">{chf(assets.total)}</dd>
					{#if prevAssets.total > 0}
						<dd class="num text-[0.8125rem] text-ink-3">{chfDelta(assets.total - prevAssets.total)} seit Ende {year - 1}</dd>
					{/if}
				</div>
				<div>
					<dt class="text-[0.8125rem] text-ink-2">Frei verfügbar</dt>
					<dd class="num mt-0.5 text-[1.25rem]">{chf(assets.free)}</dd>
				</div>
				<div>
					<dt class="text-[0.8125rem] text-ink-2">Gebunden</dt>
					<dd class="num mt-0.5 text-[1.25rem]">{chf(assets.tied)}</dd>
				</div>
				{#if performance}
					<div>
						<dt class="text-[0.8125rem] text-ink-2">Markt</dt>
						<dd class="num mt-0.5 text-[1.25rem]">{chfDelta(performance.market)}</dd>
						<dd class="num text-[0.8125rem] text-ink-3">bei {chf(performance.paidIn)} eingezahlt, seit {monthLabel(performance.since, true)}</dd>
					</div>
				{/if}
			</dl>
			<ul class="mt-3 grid gap-x-8 text-[0.875rem] sm:grid-cols-2 print:grid-cols-2">
				{#each assets.byType as t (t.type)}
					<li class="flex items-baseline justify-between gap-4 border-b border-rule py-2">
						<span>{assetTypeInfo(t.type).label}</span>
						<span class="num text-ink-2">{chf(t.total)}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if checkIns.length}
		<section class="mt-12" aria-labelledby="notes">
			<h2 id="notes" class="mb-3 text-[1.25rem] font-medium tracking-[-0.015em]">Check-ins</h2>
			<ol class="border-t border-rule">
				{#each checkIns as c (c.id)}
					<li class="grid gap-x-6 border-b border-rule py-2.5 text-[0.875rem] sm:grid-cols-[9rem_1fr] print:grid-cols-[9rem_1fr]">
						<span class="font-medium">{monthLabel(c.asOf)}</span>
						<span class={c.note ? 'text-ink-2' : 'text-ink-3'}>{c.note ?? 'Keine Notiz'}</span>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<p class="mt-12 hidden text-[0.75rem] text-ink-3 print:block">Batzen, gedruckt am {new Date().toLocaleDateString('de-CH')}</p>
</article>

<style>
	/* Keep tables and lists of one section on the same sheet where possible */
	.review section {
		break-inside: avoid;
	}
</style>
