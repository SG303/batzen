<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { year, years, href }: { year: number; years: number[]; href: (year: number) => string } =
		$props();

	const prev = $derived(years.includes(year - 1) ? year - 1 : null);
	const next = $derived(years.includes(year + 1) ? year + 1 : null);
</script>

<div class="inline-flex items-center gap-0.5" aria-label="Jahr wählen" role="group">
	{#if prev}
		<a href={href(prev)} class="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink" aria-label="Jahr {prev}" data-sveltekit-reset="false">
			<ChevronLeft size={18} />
		</a>
	{:else}
		<span class="grid size-9 place-items-center text-rule-strong" aria-hidden="true"><ChevronLeft size={18} /></span>
	{/if}
	<span class="min-w-[3.5rem] text-center text-[1.0625rem] font-semibold num" aria-live="polite">{year}</span>
	{#if next}
		<a href={href(next)} class="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink" aria-label="Jahr {next}" data-sveltekit-reset="false">
			<ChevronRight size={18} />
		</a>
	{:else}
		<span class="grid size-9 place-items-center text-rule-strong" aria-hidden="true"><ChevronRight size={18} /></span>
	{/if}
</div>
