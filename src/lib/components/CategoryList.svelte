<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { slide } from 'svelte/transition';
	import { intervalLabel, type CategorySummary } from '#lib/domain.ts';
	import { catColor } from '#lib/categories.ts';
	import { chf, chfExact, percent } from '#lib/money.ts';
	import { forPeriod } from '#lib/prefs.svelte.ts';

	let { categories, income }: { categories: CategorySummary[]; income: number } = $props();

	let open = $state<number | null>(null);

	type SortKey = 'name' | 'amount';
	let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

	/** First click: A to Z, or largest first for numbers. Clicking again reverses. */
	function sortBy(key: SortKey) {
		if (sort?.key === key) sort = { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
		else sort = { key, dir: key === 'name' ? 'asc' : 'desc' };
	}

	function sorted<T>(list: T[], name: (x: T) => string, amount: (x: T) => number): T[] {
		if (!sort) return list;
		const f = sort.dir === 'asc' ? 1 : -1;
		const cmp =
			sort.key === 'name'
				? (a: T, b: T) => name(a).localeCompare(name(b), 'de-CH')
				: (a: T, b: T) => amount(a) - amount(b);
		return [...list].sort((a, b) => f * cmp(a, b));
	}

	const rows = $derived(
		sorted(
			categories,
			(c) => c.category.name,
			(c) => c.monthly.mine
		)
	);
</script>

{#snippet head(key: SortKey, label: string, align: string)}
	{@const active = sort?.key === key}
	<span class={align} aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
		<button
			type="button"
			class="inline-flex items-center gap-1 transition-colors hover:text-ink {active ? 'text-ink' : ''}"
			onclick={() => sortBy(key)}
		>
			{label}
			{#if active && sort?.dir === 'asc'}
				<ArrowUp size={13} />
			{:else if active}
				<ArrowDown size={13} />
			{:else}
				<ArrowUpDown size={13} class="opacity-60" />
			{/if}
		</button>
	</span>
{/snippet}

<div class="border-t border-rule">
	<div class="grid grid-cols-[1fr_auto_4.5rem] gap-4 py-2.5 text-[0.8125rem] text-ink-3 sm:grid-cols-[1fr_auto_6rem]">
		{@render head('name', 'Kategorie', '')}
		{@render head('amount', 'CHF', 'text-right')}
		{@render head('amount', 'vom Lohn', 'text-right')}
	</div>
	{#each rows as c (c.category.id)}
		{@const expanded = open === c.category.id}
		<div class="border-t border-rule">
			<button
				type="button"
				class="group grid w-full grid-cols-[1fr_auto_4.5rem] items-center gap-4 py-3.5 text-left sm:grid-cols-[1fr_auto_6rem]"
				aria-expanded={expanded}
				onclick={() => (open = expanded ? null : c.category.id)}
			>
				<span class="flex min-w-0 items-center gap-3">
					<span class="swatch" style="background: {catColor(c.category.color)}"></span>
					<span class="truncate font-medium">{c.category.name}</span>
					<span class="text-[0.8125rem] text-ink-3">{c.items.length}</span>
					<ChevronRight
						size={15}
						class="text-ink-3 transition-transform group-hover:text-ink-2 {expanded ? 'rotate-90' : ''}"
					/>
				</span>
				<span class="num text-right">{chf(forPeriod(c.monthly.mine))}</span>
				<span class="num text-right text-ink-2">{percent(c.monthly.mine, income)}</span>
			</button>

			{#if expanded}
				<ul class="mb-3 ml-[1.375rem] border-l border-rule pl-4" transition:slide={{ duration: 180 }}>
					{#each sorted(c.items, (x) => x.item.name, (x) => x.monthly.mine) as s (s.item.id)}
						{@const shared = s.current && s.current.share < 100}
						<li class="grid grid-cols-[1fr_auto_4.5rem] items-baseline gap-4 py-2 text-[0.9375rem] sm:grid-cols-[1fr_auto_6rem]">
							<span class="min-w-0">
								<span class="block truncate">{s.item.name}</span>
								<span class="block text-[0.8125rem] text-ink-3">
									{#if s.current}
										{s.item.kind === 'variable' ? 'ca. ' : ''}{chfExact(s.current.amount)} {intervalLabel(s.current.interval)}{shared
											? `, dein Anteil ${s.current.share} %`
											: ''}
									{:else}
										nicht mehr aktiv
									{/if}
								</span>
							</span>
							<span class="num text-right">{chf(forPeriod(s.monthly.mine))}</span>
							<span class="num text-right text-[0.8125rem] text-ink-3">{percent(s.monthly.mine, income)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/each}
</div>
