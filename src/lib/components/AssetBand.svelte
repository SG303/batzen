<script lang="ts">
	import type { AssetSummary } from '#lib/domain.ts';
	import { chf, percent } from '#lib/money.ts';

	/**
	 * Total assets as one band: money on accounts (the emergency fund), other freely available
	 * assets, and on the right what is tied up in pillar 3a and the pension fund.
	 */
	let { summary }: { summary: AssetSummary } = $props();

	const segments = $derived(
		[
			{ key: 'cash', label: 'Auf Konten', value: summary.cash },
			{ key: 'free', label: 'Übrige frei verfügbar', value: summary.free - summary.cash },
			{ key: 'tied', label: 'Gebunden', value: summary.tied }
		].filter((s) => s.value > 0)
	);
</script>

<div
	class="flex h-12 gap-[2px] overflow-hidden rounded-[10px] bg-sunken sm:h-16"
	role="img"
	aria-label={segments.map((s) => `${s.label} CHF ${chf(s.value)}`).join(', ')}
>
	{#each segments as s (s.key)}
		<div
			class="band-{s.key} h-full min-w-[3px] rounded-[3px] first:rounded-l-[10px] last:rounded-r-[10px]"
			style="width: {(s.value / Math.max(summary.total, 1)) * 100}%"
		></div>
	{/each}
</div>

<ul class="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-[0.875rem]" aria-hidden="true">
	{#each segments as s (s.key)}
		<li class="flex items-start gap-2.5">
			<span class="band-{s.key} mt-[0.3rem] size-2.5 flex-none rounded-[3px]"></span>
			<span>
				<span class="block text-ink-2">{s.label}, {percent(s.value, summary.total)}</span>
				<span class="num block {s.key === 'tied' ? 'text-ink' : 'font-semibold text-accent'}">{chf(s.value)}</span>
			</span>
		</li>
	{/each}
</ul>

<style>
	.band-cash {
		background: var(--accent);
	}
	.band-free {
		background: color-mix(in oklab, var(--accent) 45%, var(--paper));
	}
	/* Tied money is still there, just out of reach: drawn as a hatch instead of a solid fill. */
	.band-tied {
		background: repeating-linear-gradient(-45deg, var(--ink-3) 0 1.5px, transparent 1.5px 6px);
	}
</style>
