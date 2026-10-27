<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Printer from '@lucide/svelte/icons/printer';
	import {
		budgetFlow,
		checkInData,
		checkInPerformance,
		checkInReminder,
		monthsAgoLabel,
		compareYears,
		currentMonth,
		emergencyMonths,
		monthLabel,
		reservePlan,
		reserveTarget,
		savingsRate,
		summarizeAssets,
		summarizeMonth,
		summarizeYear,
		WORKDAYS_PER_YEAR,
		yearRange,
		type CheckIn
	} from '#lib/domain.ts';
	import BillCalendar from '#lib/components/BillCalendar.svelte';
	import CheckInNote from '#lib/components/CheckInNote.svelte';
	import PerformanceList from '#lib/components/PerformanceList.svelte';
	import { catColor } from '#lib/categories.ts';
	import { incomeVerdict } from '#lib/verdict.ts';
	import { chf, chfDelta, decimal } from '#lib/money.ts';
	import { forPeriod, periodSuffix, prefs } from '#lib/prefs.svelte.ts';
	import Lohnband from '#lib/components/Lohnband.svelte';
	import CategoryList from '#lib/components/CategoryList.svelte';
	import FlowChart from '#lib/components/FlowChart.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import YearSwitch from '#lib/components/YearSwitch.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const budget = $derived(data.data);

	const today = currentMonth();
	const years = $derived(yearRange(budget, today));
	const year = $derived.by(() => {
		const y = Number(page.url.searchParams.get('jahr'));
		return years.includes(y) ? y : Number(today.slice(0, 4));
	});

	const empty = $derived(budget.items.length === 0 && budget.incomes.length === 0);

	/** All check-ins in time order; a selected one shows its frozen snapshot instead of the year. */
	const checkIns = $derived(
		[...budget.checkIns].sort((a, b) => a.asOf.localeCompare(b.asOf) || a.id - b.id)
	);
	const yearCheckIns = $derived(checkIns.filter((c) => c.asOf.startsWith(`${year}-`)));
	const selected = $derived.by(() => {
		const id = Number(page.url.searchParams.get('stand'));
		return yearCheckIns.find((c) => c.id === id) ?? null;
	});
	const previousCheckIn = $derived.by((): CheckIn | null => {
		if (!selected) return null;
		const i = checkIns.findIndex((c) => c.id === selected.id);
		return i > 0 ? checkIns[i - 1] : null;
	});

	const s = $derived(
		selected ? summarizeMonth(checkInData(selected, budget), selected.asOf) : summarizeYear(budget, year)
	);
	const prev = $derived.by(() => {
		if (selected) {
			return previousCheckIn
				? summarizeMonth(checkInData(previousCheckIn, budget), previousCheckIn.asOf)
				: null;
		}
		return years.includes(year - 1) ? summarizeYear(budget, year - 1) : null;
	});
	const compareLabel = $derived(
		selected
			? previousCheckIn
				? `Gegenüber Check-in ${monthLabel(previousCheckIn.asOf)}`
				: 'Gegenüber dem vorherigen Check-in'
			: prev
				? `Gegenüber ${year - 1}`
				: 'Gegenüber dem Vorjahr'
	);
	const changes = $derived(prev ? compareYears(prev, s).slice(0, 5) : []);

	function selectStand(value: string) {
		goto(value ? `/?jahr=${year}&stand=${value}` : `/?jahr=${year}`, { reset: false });
	}

	/**
	 * Assets at the shown moment: the check-in month of a snapshot, otherwise the end of the year
	 * (today for the running year). Compared with the previous check-in or year end.
	 */
	const assetMonth = (y: number) => (y === Number(today.slice(0, 4)) ? today : `${y}-12`);
	const assets = $derived(
		selected
			? summarizeAssets(checkInData(selected, budget).assets, selected.asOf)
			: summarizeAssets(budget.assets, assetMonth(year))
	);
	const prevAssets = $derived(
		selected
			? previousCheckIn
				? summarizeAssets(checkInData(previousCheckIn, budget).assets, previousCheckIn.asOf)
				: null
			: summarizeAssets(budget.assets, `${year - 1}-12`)
	);
	const assetDelta = $derived(prevAssets && prevAssets.total > 0 ? assets.total - prevAssets.total : null);
	const reserve = $derived(emergencyMonths(assets.cash, s.spending));
	const performance = $derived(selected ? checkInPerformance(selected, previousCheckIn, budget) : []);

	/** Bills that are not monthly; a planning view, so only for the year and not for a snapshot */
	const bills = $derived(reservePlan(budget, year));
	const billTarget = $derived(year === Number(today.slice(0, 4)) ? reserveTarget(budget, today) : null);
	const showBills = $derived(!selected && bills.months.some((m) => m.setAside > 0 || m.due.length));

	const income = $derived(s.income.counted);
	const rate = $derived(savingsRate(s));
	const flow = $derived(budgetFlow(s));
	const out = $derived(s.spending + s.saving);
	const dayValue = $derived((income * 12) / WORKDAYS_PER_YEAR);
	const topItems = $derived(
		[...s.items]
			.filter((i) => i.item.kind !== 'saving' && i.monthly.mine > 0)
			.sort((a, b) => b.monthly.mine - a.monthly.mine)
			.slice(0, 6)
	);
	const catOf = (id: number) => budget.categories.find((c) => c.id === id);

	const reminder = $derived(checkInReminder(budget.checkIns, today));

	const verdict = $derived(prev ? incomeVerdict(prev, s) : null);

	const deltas = $derived(
		prev
			? [
					{ label: 'Einkommen', value: s.income.counted - prev.income.counted },
					{ label: 'Ausgaben', value: s.spending - prev.spending },
					{ label: 'Sparen', value: s.saving - prev.saving },
					{ label: 'Frei', value: s.free - prev.free }
				]
			: []
	);
</script>

{#if empty}
	<section class="pt-16 pb-10 sm:pt-28">
		<h1 class="max-w-[18ch] text-[2.5rem] leading-[1.08] font-medium tracking-[-0.03em] sm:text-[3.75rem]">
			Wohin geht dein Geld?
		</h1>
		<p class="mt-5 max-w-[52ch] text-[1.0625rem] text-ink-2">
			Erfasse deine wiederkehrenden Kosten und dein Einkommen einmal. Danach reicht ein kurzer
			Check-in ein paar Mal im Jahr.
		</p>
		<div class="mt-8 flex flex-wrap gap-3">
			<a href="/posten?neu=1" class="btn btn-primary">Ersten Posten erfassen</a>
			<form method="post" action="/einstellungen?/sample" use:enhance>
				<button class="btn btn-quiet">Mit Beispieldaten ausprobieren</button>
			</form>
		</div>
	</section>
{:else}
	{#if reminder.due}
		<a
			href="/check-in"
			class="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-accent-soft px-5 py-3.5 text-[0.9375rem] transition-colors hover:bg-[color-mix(in_oklab,var(--accent-soft)_85%,var(--accent))]"
		>
			<span>
				{reminder.last
					? `Dein letzter Check-in war ${monthsAgoLabel(reminder.monthsAgo!)}, im ${monthLabel(reminder.last.asOf)}. Zeit, die Zahlen kurz zu prüfen.`
					: 'Noch kein Check-in gemacht. Prüfe deine Zahlen in ein paar Minuten.'}
			</span>
			<span class="font-medium whitespace-nowrap text-accent">Check-in starten</span>
		</a>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-3 pt-8 sm:pt-12">
		<div class="flex items-center gap-2">
			<YearSwitch {year} {years} href={(y) => `/?jahr=${y}`} />
			{#if yearCheckIns.length}
				<select
					class="field h-9! w-auto! rounded-full! py-0 pr-9! pl-3.5! text-[0.875rem]"
					aria-label="Stand"
					value={selected ? String(selected.id) : ''}
					onchange={(e) => selectStand(e.currentTarget.value)}
				>
					<option value="">Ganzes Jahr</option>
					{#each yearCheckIns as c (c.id)}
						<option value={String(c.id)}>Check-in {monthLabel(c.asOf)}</option>
					{/each}
				</select>
			{/if}
			{#if !selected}
				<a href="/verlauf/{year}" class="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink" aria-label="Jahresrückblick {year}" title="Jahresrückblick {year}">
					<Printer size={17} strokeWidth={1.75} />
				</a>
			{/if}
		</div>
		<Segmented
			label="Zeitraum"
			options={[
				{ value: 'month', label: 'pro Monat' },
				{ value: 'year', label: 'pro Jahr' }
			]}
			bind:value={prefs.period}
		/>
	</div>

	<section class="pt-8 pb-14 sm:pt-12 sm:pb-20" aria-labelledby="hero">
		{#if selected}
			<p class="mb-3 text-[0.9375rem] text-ink-2">
				So sah es beim Check-in im {monthLabel(selected.asOf)} aus.
			</p>
		{/if}
		<h1
			id="hero"
			class="max-w-[22ch] text-[2.125rem] leading-[1.1] font-medium tracking-[-0.03em] text-balance sm:text-[3.5rem] sm:leading-[1.05]"
		>
			{#if income <= 0}
				{selected ? 'Zu diesem Zeitpunkt war kein Einkommen erfasst.' : `Für ${year} ist noch kein Einkommen erfasst.`}
			{:else if s.free >= 0}
				Von {chf(forPeriod(income))} Franken {periodSuffix()} bleiben {chf(forPeriod(s.free))} frei.
			{:else}
				Du gibst {periodSuffix()} {chf(forPeriod(-s.free))} Franken mehr aus, als reinkommt.
			{/if}
		</h1>

		{#if income > 0 || out > 0}
			<div class="mt-10 sm:mt-14">
				<Lohnband income={income} categories={s.categories} />
			</div>

			<dl class="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-[0.9375rem]">
				<div class="flex gap-2"><dt class="text-ink-2">Fixkosten</dt><dd class="num">{chf(forPeriod(s.fixed))}</dd></div>
				<div class="flex gap-2"><dt class="text-ink-2">Variabel</dt><dd class="num">{chf(forPeriod(s.variable))}</dd></div>
				<div class="flex gap-2"><dt class="text-ink-2">Sparen</dt><dd class="num">{chf(forPeriod(s.saving))}</dd></div>
				{#if rate}
					<div class="flex flex-wrap gap-x-2">
						<dt class="text-ink-2">Sparquote</dt>
						<dd class="num">{decimal(rate.total)} %</dd>
						{#if rate.planned > 0 && rate.leftover > 0}
							<dd class="num text-ink-3">{decimal(rate.planned)} % gezielt gespart, {decimal(rate.leftover)} % übrig</dd>
						{/if}
					</div>
				{/if}
			</dl>
			{#if s.excluded.length}
				<p class="mt-3 text-[0.8125rem] text-ink-3">
					Nicht eingerechnet:
					{s.excluded.map((x) => `${x.name} ${chf(x.monthly * 12)}`).join(', ')} im Jahr.
					<a href="/posten?tab=einkommen" class="underline decoration-rule-strong underline-offset-2 hover:text-ink">Ändern</a>
				</p>
			{/if}
		{/if}

		{#if selected}
			<div class="mt-8">
				<CheckInNote checkIn={selected} back={`/?jahr=${year}`} />
			</div>
		{/if}
	</section>

	<section class="pb-16" aria-labelledby="flow">
		<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
			<h2 id="flow" class="text-[1.375rem] font-medium tracking-[-0.015em]">Wohin es fliesst</h2>
			<Segmented
				size="sm"
				label="Darstellung"
				options={[
					{ value: 'chart', label: 'Fluss' },
					{ value: 'list', label: 'Liste' }
				]}
				bind:value={prefs.flow}
			/>
		</div>
		{#if prefs.flow === 'chart' && income > 0}
			<FlowChart {flow} {income} />
		{:else}
			<CategoryList categories={s.categories} {income} />
		{/if}
	</section>

	{#if showBills}
		<section class="pb-16" aria-labelledby="bills">
			<h2 id="bills" class="text-[1.375rem] font-medium tracking-[-0.015em]">Rechnungen übers Jahr</h2>
			<BillCalendar plan={bills} target={billTarget} {today} categories={budget.categories} />
		</section>
	{/if}

	{#if assets.total > 0}
		<section class="pb-16" aria-labelledby="assets">
			<div class="flex items-baseline justify-between gap-4">
				<h2 id="assets" class="text-[1.375rem] font-medium tracking-[-0.015em]">Vermögen</h2>
				<a href="/vermoegen" class="text-[0.9375rem] text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink">Alle Konten</a>
			</div>
			<p class="mt-1 text-[0.9375rem] text-ink-2">
				{selected ? `Stand beim Check-in im ${monthLabel(selected.asOf)}.` : assetMonth(year) === today ? `Stand ${monthLabel(today)}.` : `Stand am 31. Dezember ${year}.`}
			</p>
			<dl class="mt-5 grid grid-cols-2 gap-y-5 border-y border-rule py-4 sm:grid-cols-4">
				<div>
					<dt class="text-[0.8125rem] text-ink-2">Total</dt>
					<dd class="num mt-0.5 text-[1.25rem] font-medium">{chf(assets.total)}</dd>
					{#if assetDelta !== null}
						<dd class="num text-[0.8125rem] text-ink-3">{chfDelta(assetDelta)} {selected ? 'seit letztem Check-in' : `seit Ende ${year - 1}`}</dd>
					{/if}
				</div>
				<div>
					<dt class="text-[0.8125rem] text-ink-2">Frei verfügbar</dt>
					<dd class="num mt-0.5 text-[1.25rem] font-medium text-accent">{chf(assets.free)}</dd>
				</div>
				<div>
					<dt class="text-[0.8125rem] text-ink-2">Gebunden</dt>
					<dd class="num mt-0.5 text-[1.25rem]">{chf(assets.tied)}</dd>
					<dd class="text-[0.8125rem] text-ink-3">3a und Pensionskasse</dd>
				</div>
				<div>
					<dt class="text-[0.8125rem] text-ink-2">Notgroschen</dt>
					<dd class="num mt-0.5 text-[1.25rem]">{reserve === null ? '–' : `${decimal(reserve)} Monate`}</dd>
					<dd class="text-[0.8125rem] text-ink-3">Konten geteilt durch Ausgaben</dd>
				</div>
			</dl>
			{#if performance.length && previousCheckIn}
				<h3 class="mt-8 mb-3 font-medium">Einzahlungen und Markt seit dem Check-in im {monthLabel(previousCheckIn.asOf)}</h3>
				<PerformanceList rows={performance} />
			{/if}
		</section>
	{/if}

	<div class="grid gap-16 pb-8 md:grid-cols-2 md:gap-12">
		<section aria-labelledby="top">
			<h2 id="top" class="text-[1.375rem] font-medium tracking-[-0.015em]">Die grössten Posten</h2>
			<p class="mt-1 mb-5 text-[0.9375rem] text-ink-2">
				Und wie lange du dafür arbeitest.
			</p>
			<ol class="border-t border-rule">
				{#each topItems as t (t.item.id)}
					{@const cat = catOf(t.item.categoryId)}
					<li class="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 border-b border-rule py-3">
						<span class="flex min-w-0 items-center gap-3">
							<span class="swatch" style="background: {catColor(cat?.color ?? 1)}"></span>
							<span class="truncate">{t.item.name}</span>
						</span>
						<span class="num text-right">{chf(forPeriod(t.monthly.mine))}</span>
						<span class="num w-[5.5rem] text-right text-[0.875rem] text-ink-2">
							{dayValue > 0 ? `${decimal(t.yearly.mine / dayValue)} Tage` : '–'}
						</span>
					</li>
				{/each}
			</ol>
			{#if dayValue > 0}
				<p class="mt-3 text-[0.8125rem] text-ink-3">
					Arbeitstage pro Jahr, gerechnet mit {WORKDAYS_PER_YEAR} Arbeitstagen und deinem Nettolohn.
				</p>
			{/if}
		</section>

		<section aria-labelledby="compare">
			<h2 id="compare" class="text-[1.375rem] font-medium tracking-[-0.015em]">{compareLabel}</h2>
			{#if prev && verdict}
				<p class="mt-1 mb-5 max-w-[46ch] text-[0.9375rem] text-ink-2">{verdict}</p>
				<dl class="grid grid-cols-4 border-y border-rule py-3">
					{#each deltas as d (d.label)}
						<div>
							<dt class="text-[0.8125rem] text-ink-2">{d.label}</dt>
							<dd class="num mt-0.5 text-[1.0625rem]">{chfDelta(forPeriod(d.value))}</dd>
						</div>
					{/each}
				</dl>
				{#if changes.length}
					<h3 class="mt-6 mb-1 text-[0.875rem] text-ink-2">Grösste Veränderungen</h3>
					<ul>
						{#each changes as c (c.item.id)}
							<li class="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 text-[0.9375rem]">
								<span class="truncate">{c.item.name}</span>
								<span class="num whitespace-nowrap text-ink-2">
									{#if c.kind === 'new'}
										neu, {chf(forPeriod(c.after))}
									{:else if c.kind === 'ended'}
										weggefallen, {chfDelta(forPeriod(-c.before))}
									{:else}
										{chf(forPeriod(c.before))} auf {chf(forPeriod(c.after))}
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if selected}
				<p class="mt-1 text-[0.9375rem] text-ink-2">
					Das ist der erste Check-in. Ab dem nächsten siehst du hier, was sich dazwischen verändert hat.
				</p>
			{:else}
				<p class="mt-1 text-[0.9375rem] text-ink-2">
					Sobald es Zahlen für {year - 1} gibt, siehst du hier, ob deine Ausgaben schneller wachsen
					als dein Einkommen. Ältere Jahre kannst du im Check-in nacherfassen.
				</p>
			{/if}
		</section>
	</div>

	{#if !selected && yearCheckIns.length}
		<section class="pt-16" aria-labelledby="checkins">
			<h2 id="checkins" class="text-[1.375rem] font-medium tracking-[-0.015em]">Check-ins {year}</h2>
			<p class="mt-1 mb-5 text-[0.9375rem] text-ink-2">Öffne einen Check-in, um den damaligen Stand zu sehen.</p>
			<ol class="border-t border-rule">
				{#each yearCheckIns as c (c.id)}
					<li>
						<a
							href="/?jahr={year}&stand={c.id}"
							class="grid gap-x-6 gap-y-0.5 border-b border-rule py-3.5 transition-colors hover:bg-sunken/60 sm:grid-cols-[10rem_1fr] sm:px-2"
						>
							<span class="font-medium">{monthLabel(c.asOf)}</span>
							<span class="text-[0.9375rem] {c.note ? 'text-ink-2' : 'text-ink-3'}">{c.note ?? 'Keine Notiz'}</span>
						</a>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
{/if}
