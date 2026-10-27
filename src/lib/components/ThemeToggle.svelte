<script lang="ts">
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import { applyTheme, effectiveTheme, type Theme } from '#lib/theme.ts';
	import { onMount } from 'svelte';

	let { theme }: { theme: Theme } = $props();

	// Server only knows the cookie; resolve "system" once mounted.
	let override = $state<boolean | null>(null);
	const dark = $derived(override ?? theme === 'dark');
	onMount(() => (override = effectiveTheme(theme) === 'dark'));

	function toggle() {
		override = !dark;
		applyTheme(override ? 'dark' : 'light');
	}
</script>

<button
	type="button"
	onclick={toggle}
	class="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
	aria-label={dark ? 'Helles Design verwenden' : 'Dunkles Design verwenden'}
	title={dark ? 'Hell' : 'Dunkel'}
>
	{#if dark}<Sun size={19} strokeWidth={1.75} />{:else}<Moon size={19} strokeWidth={1.75} />{/if}
</button>
