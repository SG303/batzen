<script lang="ts">
	import type { Snippet } from 'svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import type { Theme } from '#lib/theme.ts';

	/** Frame for the pages shown before logging in: no navigation, one narrow column. */
	let { theme, title, intro, children }: { theme: Theme; title: string; intro: string; children: Snippet } =
		$props();

	// The band from the app icon: income split into parts, the outlined rest is what is left.
	const parts = [
		{ w: 44, o: 1 },
		{ w: 25, o: 0.62 },
		{ w: 14, o: 0.36 }
	];
</script>

<div class="flex min-h-dvh flex-col">
	<div class="flex justify-end p-3">
		<ThemeToggle {theme} />
	</div>

	<main class="mx-auto w-full max-w-[23rem] flex-1 px-6 pt-[8vh] pb-16 sm:pt-[14vh]">
		<div class="flex h-3 gap-[3px]" aria-hidden="true">
			{#each parts as p, i (i)}
				<span class="part rounded-[3px] bg-accent" style="width: {p.w}%; opacity: {p.o}; animation-delay: {i * 90}ms"></span>
			{/each}
			<span class="part flex-1 rounded-[3px] border border-dashed border-rule-strong" style="animation-delay: 270ms"></span>
		</div>

		<h1 class="mt-8 text-[2rem] leading-tight font-medium tracking-[-0.025em] sm:text-[2.5rem]">{title}</h1>
		<p class="mt-2 text-[0.9375rem] text-ink-2">{intro}</p>

		<div class="mt-9">
			{@render children()}
		</div>
	</main>
</div>

<style>
	.part {
		transform-origin: left center;
		animation: grow 520ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
			opacity: 0;
		}
	}
</style>
