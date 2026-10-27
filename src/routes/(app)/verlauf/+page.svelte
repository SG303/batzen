<script lang="ts">
	import { savingsRate, summarizeYear, yearRange } from '#lib/domain.ts';
	import { catColor } from '#lib/categories.ts';
	import { chf, chfDelta, decimal } from '#lib/money.ts';
	import { forPeriod, prefs } from '#lib/prefs.svelte.ts';
	import Segmented from '#lib/components/Segmented.svelte';
	import YearChart from '#lib/components/YearChart.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const budget = $derived(data.data);

	const summaries = $derived(yearRange(budget).map((y) => summarizeYear(budget, y)));
	const withData = $derived(summaries.filter((s) => s.income.counted > 0 || s.spending > 0));
	const usedCategories = $derived(
		budget.categories.filter((c) => withData.some((s) => s.categories.some((x) => x.category.id === c.id)))
	);
	const catValue = (s: (typeof summaries)[number], id: number) =>
		s.categories.find((c) => c.category.id === id)?.monthly.mine ?? 0;

	const rows = $derived([
		{ label: 'Einkommen', get: (s: (typeof summaries)[number]) => s.income.counted, strong: true },
		{ label: 'Fixkosten', get: (s: (typeof summaries)[number]) => s.fixed },
		{ label: 'Variable Kosten', get: (s: (typeof summaries)[number]) => s.variable },
		{ label: 'Sparen', get: (s: (typeof summaries)[number]) => s.saving },
		{ label: 'Frei', get: (s: (typeof summaries)[number]) => s.free, strong: true }
	]);

	/** Saving rate, split into saving items ("gezielt") and what is left over */
	const rates = $derived([
		{ label: 'Sparquote', get: (s: (typeof summaries)[number]) => savingsRate(s)?.total, strong: true },
		{ label: 'davon gezielt gespart', get: (s: (typeof summaries)[number]) => savingsRate(s)?.planned },
		{ label: 'davon übrig geblieben', get: (s: (typeof summaries)[number]) => savingsRate(s)?.leftover }
	]);

	/** Growth of spending vs. income, as an index of the first year with data (= 100). */
	const creep = $derived.by(() => {
		const base = withData.find((s) => s.income.counted > 0 && s.spending > 0);
		if (!base) return [];
		return withData
			.filter((s) => s.year >= base.year)
			.map((s) => ({
				year: s.year,
				income: (s.income.counted / base.income.counted) * 100,
				spending: (s.spending / base.spending) * 100
			}));
	});
</script>

<svelte:head><title>Verlauf · Batzen</title></svelte:head>

<div class="pt-10 sm:pt-14">
	<h1 class="text-[2rem] font-medium tracking-[-0.025em] sm:text-[2.5rem]">Verlauf</h1>
	<p class="mt-1 max-w-[52ch] text-[0.9375rem] text-ink-2">
		Wie sich Einkommen und Ausgaben über die Jahre entwickeln. Jedes Jahr zeigt den Durchschnitt,
		Änderungen unter dem Jahr sind anteilig eingerechnet.
	</p>
</div>

{#if withData.length === 0}
	<p class="mt-12 text-ink-2">Noch keine Zahlen erfasst.</p>
{:else}
	<div class="mt-10 flex flex-wrap items-center justify-between gap-4">
		<ul class="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.8125rem] text-ink-2" aria-label="Legende">
			{#each usedCategories as c (c.id)}
				<li class="flex items-center gap-1.5"><span class="swatch" style="background: {catColor(c.color)}"></span>{c.name}</li>
			{/each}
			<li class="flex items-center gap-1.5"><span class="h-[2px] w-3.5 rounded-full bg-ink"></span>Einkommen</li>
		</ul>
		<Segmented
			size="sm"
			label="Zeitraum"
			options={[
				{ value: 'month', label: 'pro Monat' },
				{ value: 'year', label: 'pro Jahr' }
			]}
			bind:value={prefs.period}
		/>
	</div>

	<div class="mt-6">
		<YearChart years={withData} />
	</div>

	{#if creep.length > 1}
		{@const last = creep[creep.length - 1]}
		<section class="mt-16 max-w-[60ch]" aria-labelledby="creep">
			<h2 id="creep" class="text-[1.375rem] font-medium tracking-[-0.015em]">Lifestyle-Check</h2>
			<p class="mt-2 text-[1.0625rem] leading-relaxed text-ink-2">
				Seit {creep[0].year} ist dein Einkommen um {decimal(last.income - 100)} % gewachsen,
				deine Ausgaben um {decimal(last.spending - 100)} %.
				{#if last.spending > last.income + 2}
					Die Ausgaben wachsen schneller. Ein Teil jeder Lohnerhöhung verschwindet so wieder.
				{:else if last.spending < last.income - 2}
					Du hältst die Ausgaben unter dem Einkommenswachstum. Das schafft Spielraum.
				{:else}
					Beides wächst etwa im gleichen Takt.
				{/if}
			</p>
		</section>
	{/if}

	<section class="mt-16" aria-labelledby="reviews">
		<h2 id="reviews" class="text-[1.375rem] font-medium tracking-[-0.015em]">Jahresrückblick</h2>
		<p class="mt-1 mb-4 max-w-[56ch] text-[0.9375rem] text-ink-2">
			Ein Jahr auf einer Seite: Einkommen, Ausgaben, Sparquote, Vermögen und die grössten Veränderungen. Zum Drucken oder als PDF.
		</p>
		<ul class="flex flex-wrap gap-2">
			{#each [...withData].reverse() as s (s.year)}
				<li><a href="/verlauf/{s.year}" class="btn btn-quiet h-9! px-4! text-[0.875rem]">{s.year}</a></li>
			{/each}
		</ul>
	</section>

	<section class="mt-16" aria-labelledby="table">
		<h2 id="table" class="mb-5 text-[1.375rem] font-medium tracking-[-0.015em]">Zahlen pro Jahr</h2>
		<div class="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
			<table class="num w-full min-w-[34rem] text-[0.9375rem]">
				<thead>
					<tr class="border-b border-rule text-[0.8125rem] text-ink-3">
						<th class="py-2.5 pr-4 text-left font-normal">CHF {prefs.period === 'year' ? 'pro Jahr' : 'pro Monat'}</th>
						{#each withData as s (s.year)}<th class="px-2 py-2.5 text-right font-normal">{s.year}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.label)}
						<tr class="border-b border-rule">
							<th scope="row" class="py-3 pr-4 text-left {r.strong ? 'font-medium' : 'font-normal text-ink-2'}">{r.label}</th>
							{#each withData as s, i (s.year)}
								<td class="px-2 py-3 text-right {r.strong ? 'font-medium' : ''}">
									{chf(forPeriod(r.get(s)))}
									{#if i > 0}
										<span class="block text-[0.75rem] font-normal text-ink-3">{chfDelta(forPeriod(r.get(s) - r.get(withData[i - 1])))}</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
					{#each rates as r (r.label)}
						<tr class="border-b border-rule">
							<th scope="row" class="py-3 pr-4 text-left font-normal {r.strong ? 'text-ink-2' : 'pl-4 text-[0.875rem] text-ink-3'}">{r.label}</th>
							{#each withData as s (s.year)}
								{@const v = r.get(s)}
								<td class="px-2 py-3 text-right {r.strong ? '' : 'text-[0.875rem] text-ink-2'}">{v === undefined ? '–' : `${decimal(v)} %`}</td>
							{/each}
						</tr>
					{/each}
					<tr><td colspan={withData.length + 1} class="pt-8 pb-2 text-[0.8125rem] text-ink-3">Nach Kategorie, dein Anteil</td></tr>
					{#each usedCategories as c (c.id)}
						<tr class="border-b border-rule">
							<th scope="row" class="py-3 pr-4 text-left font-normal">
								<span class="flex items-center gap-2.5"><span class="swatch" style="background: {catColor(c.color)}"></span>{c.name}</span>
							</th>
							{#each withData as s (s.year)}<td class="px-2 py-3 text-right">{chf(forPeriod(catValue(s, c.id)))}</td>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}
