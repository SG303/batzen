<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import {
		ASSET_TYPES,
		assetTypeInfo,
		checkInPerformance,
		currentMonth,
		emergencyMonths,
		lastVersionUpTo,
		monthLabel,
		summarizeAssets,
		summarizeMonth,
		versionAt,
		yearEndAssets,
		type Asset
	} from '#lib/domain.ts';
	import { chf, chfDelta, chfExact, decimal, percent } from '#lib/money.ts';
	import Sheet from '#lib/components/Sheet.svelte';
	import AssetSheet from '#lib/components/AssetSheet.svelte';
	import AssetBand from '#lib/components/AssetBand.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const budget = $derived(data.data);
	const today = currentMonth();

	let sheet = $state<{ id: number | null } | null>(null);
	let sheetOpen = $state(false);
	let sheetDirty = $state(false);

	function openSheet(id: number | null) {
		sheetDirty = false;
		sheet = { id };
		sheetOpen = true;
	}

	const s = $derived(summarizeAssets(budget.assets, today));
	const spending = $derived(summarizeMonth(budget, today).spending);
	const months = $derived(emergencyMonths(s.cash, spending));
	const history = $derived(yearEndAssets(budget.assets, today).reverse());

	/** Market performance per asset between the last two check-ins. */
	const lastTwo = $derived(
		[...budget.checkIns].sort((a, b) => a.asOf.localeCompare(b.asOf) || a.id - b.id).slice(-2)
	);
	const performance = $derived(
		lastTwo.length === 2
			? new Map(checkInPerformance(lastTwo[1], lastTwo[0], budget).map((p) => [p.id, p]))
			: new Map()
	);
	const period = $derived(
		lastTwo.length === 2 ? `${monthLabel(lastTwo[0].asOf, true)} bis ${monthLabel(lastTwo[1].asOf, true)}` : ''
	);

	const groups = $derived(
		ASSET_TYPES.map((t) => {
			const rows = s.assets.filter((r) => r.asset.type === t.value);
			return { type: t, rows, sum: rows.reduce((a, r) => a + r.balance, 0) };
		}).filter((g) => g.rows.length)
	);
	const inactive = $derived(budget.assets.filter((a) => !versionAt(a.versions, today)));

	const providers = $derived([
		...new Set(budget.assets.map((a) => a.provider?.trim()).filter((p): p is string => !!p))
	]);
	const editing = $derived<Asset | null>(
		sheet?.id ? (budget.assets.find((a) => a.id === sheet!.id) ?? null) : null
	);

	const upcoming = (a: Asset) =>
		a.versions.filter((v) => v.from > today).sort((x, y) => x.from.localeCompare(y.from))[0];

	/** Provider, note and when the balance was last entered. */
	function detail(a: Asset): string {
		const last = lastVersionUpTo(a.versions, today);
		const next = upcoming(a);
		const parts = [a.provider, a.note].filter(Boolean);
		if (last) parts.push(`Saldo von ${monthLabel(last.from, true)}`);
		if (next) parts.push(`neuer Saldo ab ${monthLabel(next.from, true)}`);
		return parts.join(', ');
	}
</script>

<svelte:head><title>Vermögen · Batzen</title></svelte:head>

<div class="flex flex-wrap items-end justify-between gap-4 pt-10 sm:pt-14">
	<div>
		<h1 class="text-[2rem] font-medium tracking-[-0.025em] sm:text-[2.5rem]">Vermögen</h1>
		<p class="mt-1 text-[0.9375rem] text-ink-2">Stand {monthLabel(today)}</p>
	</div>
	<button type="button" class="btn btn-primary" onclick={() => openSheet(null)}>
		<Plus size={18} />
		Neue Anlage
	</button>
</div>

{#if budget.assets.length === 0}
	<section class="max-w-[38rem] pt-12 pb-10">
		<p class="text-[1.375rem] leading-snug font-medium tracking-[-0.015em] sm:text-[1.75rem]">
			Wo liegt dein Geld, und wie viel ist es?
		</p>
		<p class="mt-4 text-[1.0625rem] text-ink-2">
			Erfasse deine Konten, die 3. Säule, die Pensionskasse und dein Depot mit dem aktuellen Saldo.
			Beim Check-in bestätigst du die Salden, so entsteht mit der Zeit ein Verlauf.
		</p>
		<button type="button" class="btn btn-quiet mt-8" onclick={() => openSheet(null)}>Erste Anlage erfassen</button>
	</section>
{:else}
	<section class="pt-8 pb-14 sm:pt-12 sm:pb-16" aria-labelledby="hero">
		<h2
			id="hero"
			class="max-w-[24ch] text-[2rem] leading-[1.1] font-medium tracking-[-0.03em] text-balance sm:text-[3rem] sm:leading-[1.05]"
		>
			{#if s.total <= 0}
				Für {monthLabel(today)} ist kein Saldo erfasst.
			{:else if s.tied > 0}
				Du hast {chf(s.total)} Franken. Frei verfügbar sind davon {chf(s.free)}.
			{:else}
				Du hast {chf(s.total)} Franken, alles frei verfügbar.
			{/if}
		</h2>

		{#if s.total > 0}
			<div class="mt-10 sm:mt-12">
				<AssetBand summary={s} />
			</div>
		{/if}

		<p class="mt-8 max-w-[52ch] text-[1.0625rem] text-ink-2">
			{#if months === null}
				Sobald du Ausgaben erfasst hast, siehst du hier, wie lange dein Geld auf Konten reichen würde.
			{:else if s.cash <= 0}
				Auf Konten liegt nichts. Für den Notgroschen zählt nur Geld auf Konten und Sparkonten.
			{:else}
				Dein Geld auf Konten deckt <span class="num font-medium text-ink">{decimal(months)} Monate</span> deiner
				Ausgaben von {chf(spending)} Franken im Monat.
			{/if}
		</p>
		<p class="mt-1.5 text-[0.8125rem] text-ink-3">
			Notgroschen: Konten und Sparkonten geteilt durch Fixkosten und variable Kosten, ohne Sparen.
		</p>
	</section>

	<div class="grid gap-14 pb-16 md:grid-cols-2 md:gap-12">
		<section aria-labelledby="by-type">
			<h2 id="by-type" class="mb-4 text-[1.375rem] font-medium tracking-[-0.015em]">Nach Art</h2>
			<ul class="border-t border-rule">
				{#each s.byType as t (t.type)}
					{@const info = assetTypeInfo(t.type)}
					<li class="grid grid-cols-[1fr_auto_3.75rem] items-baseline gap-4 border-b border-rule py-3">
						<span class="min-w-0">
							<span class="block truncate">{info.label}</span>
							{#if info.tied}<span class="block text-[0.8125rem] text-ink-3">gebunden</span>{/if}
						</span>
						<span class="num text-right">{chf(t.total)}</span>
						<span class="num text-right text-[0.875rem] text-ink-2">{percent(t.total, s.total)}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section aria-labelledby="by-provider">
			<h2 id="by-provider" class="mb-4 text-[1.375rem] font-medium tracking-[-0.015em]">Nach Anbieter</h2>
			<ul class="border-t border-rule">
				{#each s.byProvider as p (p.provider)}
					<li class="grid grid-cols-[1fr_auto_3.75rem] items-baseline gap-4 border-b border-rule py-3">
						<span class="truncate">{p.provider}</span>
						<span class="num text-right">{chf(p.total)}</span>
						<span class="num text-right text-[0.875rem] text-ink-2">{percent(p.total, s.total)}</span>
					</li>
				{/each}
			</ul>
		</section>
	</div>

	<section class="pb-4" aria-labelledby="list">
		<h2 id="list" class="text-[1.375rem] font-medium tracking-[-0.015em]">Konten und Anlagen</h2>
		<p class="mt-1 text-[0.9375rem] text-ink-2">Tippe auf eine Anlage, um den Saldo nachzutragen oder den Verlauf zu sehen.</p>

		{#each groups as g (g.type.value)}
			<div class="mt-8">
				<div class="flex items-baseline gap-3 pb-2">
					<h3 class="flex-1 font-medium">{g.type.label}</h3>
					<span class="num text-ink-2">{chf(g.sum)}</span>
				</div>
				<ul class="border-t border-rule">
					{#each g.rows as r (r.asset.id)}
						{@const perf = performance.get(r.asset.id)}
						<li>
							<button
								type="button"
								class="grid w-full grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3 text-left transition-colors hover:bg-sunken/60 sm:px-2"
								onclick={() => openSheet(r.asset.id)}
							>
								<span class="min-w-0">
									<span class="block truncate">{r.asset.name}</span>
									<span class="block truncate text-[0.8125rem] text-ink-3">{detail(r.asset)}</span>
									{#if perf}
										<span class="num block text-[0.8125rem] text-ink-2">
											Markt {chfDelta(perf.market)}, eingezahlt {chf(perf.paidIn)} ({period})
										</span>
									{/if}
								</span>
								<span class="num text-right">{chfExact(r.balance)}</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/each}

		{#if inactive.length}
			<details class="mt-12">
				<summary class="cursor-pointer list-none text-[0.9375rem] text-ink-2 hover:text-ink">
					Aufgelöst oder noch nicht eröffnet ({inactive.length})
				</summary>
				<ul class="mt-3 border-t border-rule">
					{#each inactive as a (a.id)}
						{@const next = upcoming(a)}
						{@const last = lastVersionUpTo(a.versions, today)}
						<li>
							<button
								type="button"
								class="flex w-full items-center justify-between gap-4 border-b border-rule py-3 text-left text-ink-2 hover:bg-sunken/60 sm:px-2"
								onclick={() => openSheet(a.id)}
							>
								<span class="truncate">{a.name}</span>
								<span class="text-[0.8125rem] text-ink-3">
									{next ? `ab ${monthLabel(next.from)}` : last ? `aufgelöst ${monthLabel(last.from)}` : ''}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>

	{#if history.length}
		<section class="pt-16" aria-labelledby="year-end">
			<h2 id="year-end" class="text-[1.375rem] font-medium tracking-[-0.015em]">Vermögen per Jahresende</h2>
			<p class="mt-1 mb-5 max-w-[56ch] text-[0.9375rem] text-ink-2">
				Stand am 31. Dezember, zum Beispiel für die Steuererklärung. Das laufende Jahr zeigt den
				heutigen Stand. Fehlt ein Saldo, zählt der letzte davor.
			</p>
			<div class="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
				<table class="num w-full min-w-[30rem] text-[0.9375rem]">
					<thead>
						<tr class="border-b border-rule text-[0.8125rem] text-ink-3">
							<th class="py-2.5 pr-4 text-left font-normal">Stand</th>
							<th class="px-2 py-2.5 text-right font-normal">Total</th>
							<th class="px-2 py-2.5 text-right font-normal">Frei</th>
							<th class="px-2 py-2.5 text-right font-normal">Gebunden</th>
							<th class="py-2.5 pl-2 text-right font-normal">Veränderung</th>
						</tr>
					</thead>
					<tbody>
						{#each history as y, i (y.year)}
							{@const before = history[i + 1]}
							<tr class="border-b border-rule">
								<th scope="row" class="py-3 pr-4 text-left font-normal">
									{y.month.endsWith('-12') ? `31.12.${y.year}` : monthLabel(y.month)}
								</th>
								<td class="px-2 py-3 text-right font-medium">{chf(y.total)}</td>
								<td class="px-2 py-3 text-right">{chf(y.free)}</td>
								<td class="px-2 py-3 text-right text-ink-2">{chf(y.tied)}</td>
								<td class="py-3 pl-2 text-right text-ink-2">{before ? chfDelta(y.total - before.total) : '–'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
{/if}

<Sheet
	bind:open={sheetOpen}
	canClose={() => !sheetDirty || confirm('Ungespeicherte Änderungen verwerfen?')}
	title={editing?.name ?? 'Neue Anlage'}
>
	{#if sheet}
		{#key sheet.id}
			<AssetSheet asset={editing} {providers} items={budget.items} onclose={() => (sheetOpen = false)} bind:dirty={sheetDirty} />
		{/key}
	{/if}
</Sheet>
