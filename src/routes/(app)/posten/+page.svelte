<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import {
		currentMonth,
		INCOME_TYPES,
		incomeMonthly,
		dueLabel,
		intervalLabel,
		monthLabel,
		stateAt,
		versionMonthly,
		type IncomeSource,
		type Item
	} from '#lib/domain.ts';
	import { catColor } from '#lib/categories.ts';
	import { chf, chfExact } from '#lib/money.ts';
	import { forPeriod, prefs } from '#lib/prefs.svelte.ts';
	import Segmented from '#lib/components/Segmented.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import ItemSheet from '#lib/components/ItemSheet.svelte';
	import IncomeSheet from '#lib/components/IncomeSheet.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const budget = $derived(data.data);
	const today = currentMonth();

	let tab = $state<'costs' | 'income'>('costs');
	let sheet = $state<{ type: 'item' | 'income'; id: number | null; category?: number } | null>(null);
	let sheetOpen = $state(false);
	let sheetDirty = $state(false);

	onMount(() => {
		if (page.url.searchParams.get('tab') === 'einkommen') tab = 'income';
		if (page.url.searchParams.has('neu')) openSheet({ type: 'item', id: null });
	});

	function openSheet(s: NonNullable<typeof sheet>) {
		sheetDirty = false;
		sheet = s;
		sheetOpen = true;
	}

	const snapshot = $derived(stateAt(budget, today));

	const groups = $derived(
		budget.categories.map((category) => {
			const rows = snapshot.items
				.filter((r) => r.item.categoryId === category.id && r.version)
				.map((r) => {
					const m = versionMonthly(r.version!);
					return { ...r, value: prefs.share === 'mine' ? m.mine : m.total };
				})
				.sort((a, b) => b.value - a.value);
			return { category, rows, sum: rows.reduce((a, r) => a + r.value, 0) };
		})
	);
	const inactive = $derived(snapshot.items.filter((r) => !r.version));
	const total = $derived(groups.reduce((a, g) => a + g.sum, 0));

	const incomeGroups = $derived(
		INCOME_TYPES.map((t) => ({
			type: t,
			rows: snapshot.incomes
				.filter((r) => r.source.type === t.value && r.version)
				.map((r) => ({ ...r, value: incomeMonthly(r.version!) }))
		})).filter((g) => g.rows.length)
	);
	const inactiveIncome = $derived(snapshot.incomes.filter((r) => !r.version));

	const editingItem = $derived<Item | null>(
		sheet?.type === 'item' && sheet.id ? (budget.items.find((i) => i.id === sheet!.id) ?? null) : null
	);
	const editingIncome = $derived<IncomeSource | null>(
		sheet?.type === 'income' && sheet.id ? (budget.incomes.find((i) => i.id === sheet!.id) ?? null) : null
	);

	/** ", Sparen", with the asset it goes into if linked. */
	function savingLabel(item: Item): string {
		const asset = budget.assets.find((a) => a.id === item.assetId);
		return asset ? `, Sparen in ${asset.name}` : ', Sparen';
	}

	const nextVersion = (versions: { from: string }[]) =>
		versions.filter((v) => v.from > today).sort((a, b) => a.from.localeCompare(b.from))[0];
</script>

<svelte:head><title>Posten · Batzen</title></svelte:head>

<div class="flex flex-wrap items-end justify-between gap-4 pt-10 sm:pt-14">
	<div>
		<h1 class="text-[2rem] font-medium tracking-[-0.025em] sm:text-[2.5rem]">Posten</h1>
		<p class="mt-1 text-[0.9375rem] text-ink-2">Stand {monthLabel(today)}</p>
	</div>
	<button
		type="button"
		class="btn btn-primary"
		onclick={() => openSheet({ type: tab === 'costs' ? 'item' : 'income', id: null })}
	>
		<Plus size={18} />
		{tab === 'costs' ? 'Neuer Posten' : 'Neues Einkommen'}
	</button>
</div>

<div class="mt-8 flex flex-wrap items-center gap-3">
	<Segmented
		label="Ansicht"
		options={[
			{ value: 'costs', label: 'Ausgaben' },
			{ value: 'income', label: 'Einkommen' }
		]}
		bind:value={tab}
	/>
	<span class="flex-1"></span>
	{#if tab === 'costs'}
		<Segmented
			size="sm"
			label="Anteil"
			options={[
				{ value: 'mine', label: 'Mein Anteil' },
				{ value: 'total', label: 'Gesamt' }
			]}
			bind:value={prefs.share}
		/>
	{/if}
	<Segmented
		size="sm"
		label="Zeitraum"
		options={[
			{ value: 'month', label: 'Monat' },
			{ value: 'year', label: 'Jahr' }
		]}
		bind:value={prefs.period}
	/>
</div>

{#if tab === 'costs'}
	<p class="mt-8 flex items-baseline justify-between border-b border-ink pb-3">
		<span class="font-medium">Total {prefs.share === 'mine' ? 'dein Anteil' : 'gesamt'}</span>
		<span class="num text-[1.25rem] font-medium">{chf(forPeriod(total))}</span>
	</p>

	{#each groups as g (g.category.id)}
		<section class="mt-10" aria-labelledby="cat-{g.category.id}">
			<div class="flex items-center gap-3 pb-2">
				<span class="swatch" style="background: {catColor(g.category.color)}"></span>
				<h2 id="cat-{g.category.id}" class="flex-1 font-medium">{g.category.name}</h2>
				<span class="num text-ink-2">{chf(forPeriod(g.sum))}</span>
			</div>
			<ul class="border-t border-rule">
				{#each g.rows as r (r.item.id)}
					{@const shared = r.version!.share < 100}
					{@const upcoming = nextVersion(r.item.versions)}
					<li>
						<button
							type="button"
							class="grid w-full grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3 text-left transition-colors hover:bg-sunken/60 sm:px-2"
							onclick={() => openSheet({ type: 'item', id: r.item.id })}
						>
							<span class="min-w-0">
								<span class="block truncate">{r.item.name}</span>
								<span class="block text-[0.8125rem] text-ink-3">
									{r.item.kind === 'variable' ? 'ca. ' : ''}{chfExact(r.version!.amount)}
									{intervalLabel(r.version!.interval)}{dueLabel(r.version!) ? `, ${dueLabel(r.version!)}` : ''}{shared ? `, geteilt, du ${r.version!.share} %` : ''}{r.item.kind ===
									'saving'
										? savingLabel(r.item)
										: ''}{upcoming ? `, ändert ab ${monthLabel(upcoming.from, true)}` : ''}
								</span>
							</span>
							<span class="num text-right">{chf(forPeriod(r.value))}</span>
						</button>
					</li>
				{:else}
					<li class="border-b border-rule py-3 text-[0.9375rem] text-ink-3">
						<button type="button" class="hover:text-ink" onclick={() => openSheet({ type: 'item', id: null, category: g.category.id })}>
							Noch keine Posten. Posten hinzufügen
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	{#if inactive.length}
		<details class="group mt-12">
			<summary class="cursor-pointer list-none text-[0.9375rem] text-ink-2 hover:text-ink">
				Nicht mehr aktiv ({inactive.length})
			</summary>
			<ul class="mt-3 border-t border-rule">
				{#each inactive as r (r.item.id)}
					{@const upcoming = nextVersion(r.item.versions)}
					<li>
						<button type="button" class="flex w-full items-center justify-between gap-4 border-b border-rule py-3 text-left text-ink-2 hover:bg-sunken/60 sm:px-2" onclick={() => openSheet({ type: 'item', id: r.item.id })}>
							<span class="truncate">{r.item.name}</span>
							<span class="text-[0.8125rem] text-ink-3">
								{upcoming ? `startet ${monthLabel(upcoming.from)}` : r.last ? `seit ${monthLabel(r.last.from)}` : 'ohne Betrag'}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
{:else}
	{#each incomeGroups as g (g.type.value)}
		<section class="mt-10">
			<div class="flex items-baseline gap-3 pb-2">
				<h2 class="flex-1 font-medium">{g.type.label}</h2>
			</div>
			<ul class="border-t border-rule">
				{#each g.rows as r (r.source.id)}
					<li>
						<button type="button" class="grid w-full grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3 text-left hover:bg-sunken/60 sm:px-2" onclick={() => openSheet({ type: 'income', id: r.source.id })}>
							<span class="min-w-0">
								<span class="block truncate">{r.source.name}</span>
								<span class="block text-[0.8125rem] text-ink-3">
									{chfExact(r.version!.amount)} {intervalLabel(r.version!.interval)}{r.version!.thirteenth ? ', 13 Mal im Jahr' : ''}{r.source.counted ? '' : ', nicht im Budget'}
								</span>
							</span>
							<span class="num text-right">{chf(forPeriod(r.value))}</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<p class="mt-10 text-ink-2">Noch kein Einkommen erfasst.</p>
	{/each}

	{#if inactiveIncome.length}
		<details class="mt-12">
			<summary class="cursor-pointer list-none text-[0.9375rem] text-ink-2 hover:text-ink">Nicht mehr aktiv ({inactiveIncome.length})</summary>
			<ul class="mt-3 border-t border-rule">
				{#each inactiveIncome as r (r.source.id)}
					<li>
						<button type="button" class="flex w-full justify-between border-b border-rule py-3 text-left text-ink-2 hover:bg-sunken/60 sm:px-2" onclick={() => openSheet({ type: 'income', id: r.source.id })}>
							{r.source.name}
						</button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
{/if}

<Sheet
	bind:open={sheetOpen}
	canClose={() => !sheetDirty || confirm('Ungespeicherte Änderungen verwerfen?')}
	title={sheet?.type === 'income'
		? (editingIncome?.name ?? 'Neues Einkommen')
		: (editingItem?.name ?? 'Neuer Posten')}
>
	{#if sheet?.type === 'item'}
		{#key sheet.id}
			<ItemSheet
				item={editingItem}
				categories={budget.categories}
				assets={budget.assets}
				defaultCategory={sheet.category}
				onclose={() => (sheetOpen = false)}
				bind:dirty={sheetDirty}
			/>
		{/key}
	{:else if sheet?.type === 'income'}
		{#key sheet.id}
			<IncomeSheet source={editingIncome} onclose={() => (sheetOpen = false)} bind:dirty={sheetDirty} />
		{/key}
	{/if}
</Sheet>
