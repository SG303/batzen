<script lang="ts">
	import type { AssetPerformance } from '#lib/domain.ts';
	import { chf, chfDelta } from '#lib/money.ts';

	/** Balance changes split into own contributions and the market, one row per asset. */
	let { rows }: { rows: AssetPerformance[] } = $props();

	const total = $derived(
		rows.reduce(
			(a, r) => ({ change: a.change + r.after - r.before, paidIn: a.paidIn + r.paidIn, market: a.market + r.market }),
			{ change: 0, paidIn: 0, market: 0 }
		)
	);
</script>

{#snippet row(name: string, change: number, paidIn: number, market: number, strong = false)}
	<li class="grid grid-cols-[1fr_auto] items-baseline gap-4 border-b border-rule py-3">
		<span class="min-w-0">
			<span class="block truncate {strong ? 'font-medium' : ''}">{name}</span>
			<span class="num block text-[0.8125rem] text-ink-3">Saldo {chfDelta(change)}, eingezahlt {chf(paidIn)}</span>
		</span>
		<span class="num text-right whitespace-nowrap {strong ? 'font-medium' : ''}">
			{chfDelta(market)} <span class="text-[0.8125rem] font-normal text-ink-3">Markt</span>
		</span>
	</li>
{/snippet}

<ul class="border-t border-rule">
	{#each rows as r (r.id)}
		{@render row(r.name, r.after - r.before, r.paidIn, r.market)}
	{/each}
	{#if rows.length > 1}
		{@render row('Zusammen', total.change, total.paidIn, total.market, true)}
	{/if}
</ul>
<p class="mt-2 max-w-[60ch] text-[0.8125rem] text-ink-3">
	Markt ist die Veränderung des Saldos ohne deine Einzahlungen: Zinsen, Dividenden, Kursgewinne und
	-verluste, abzüglich Gebühren.
</p>
