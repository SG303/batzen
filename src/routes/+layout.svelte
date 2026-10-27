<script lang="ts">
	import '../app.css';
	import { untrack } from 'svelte';
	import { privacy } from '#lib/privacy.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	// Set before anything renders an amount. Server rendering is synchronous, so a request never sees
	// the setting of another one; in the browser the toggle changes it from then on.
	privacy.on = untrack(() => data.privacy);
</script>

<svelte:head>
	<title>Batzen</title>
</svelte:head>

{@render children()}
