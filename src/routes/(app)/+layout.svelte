<script lang="ts">
	import { page } from '$app/state';
	import House from '@lucide/svelte/icons/house';
	import List from '@lucide/svelte/icons/list';
	import Landmark from '@lucide/svelte/icons/landmark';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Compass from '@lucide/svelte/icons/compass';
	import Settings from '@lucide/svelte/icons/settings-2';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import PrivacyToggle from '#lib/components/PrivacyToggle.svelte';
	import { COMMIT, VERSION } from '#lib/version.ts';
	import { checkInReminder, currentMonth } from '#lib/domain.ts';
	import { loadPrefs, prefs, savePrefs } from '#lib/prefs.svelte.ts';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	let prefsReady = false;
	onMount(() => {
		loadPrefs();
		prefsReady = true;
	});
	$effect(() => {
		JSON.stringify(prefs);
		if (prefsReady) savePrefs();
	});

	const nav = [
		{ href: '/', label: 'Übersicht', icon: House },
		{ href: '/posten', label: 'Posten', icon: List },
		{ href: '/vermoegen', label: 'Vermögen', icon: Landmark },
		{ href: '/verlauf', label: 'Verlauf', icon: ChartColumn },
		{ href: '/planen', label: 'Planen', icon: Compass },
		{ href: '/check-in', label: 'Check-in', icon: CircleCheck }
	];

	/** A dot on "Check-in" once the last one is a while ago, on every page */
	const checkInDue = $derived(
		data.data.items.length + data.data.incomes.length > 0 && checkInReminder(data.data.checkIns, currentMonth(), data.startedMonth).due
	);
	const due = (href: string) => href === '/check-in' && checkInDue;

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="flex min-h-dvh flex-col print:block">
	<header class="sticky top-0 z-30 bg-paper/85 backdrop-blur-md print:hidden">
		<div class="mx-auto flex h-16 max-w-5xl items-center gap-8 px-5 sm:px-8">
			<a href="/" class="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="Batzen, zur Übersicht">
				<img src="/icon.svg" alt="" class="size-7" />
				<span class="text-[1.0625rem]">Batzen</span>
			</a>

			<nav class="hidden flex-1 items-center gap-1 md:flex" aria-label="Hauptnavigation">
				{#each nav as item (item.href)}
					<a
						href={item.href}
						class="rounded-full px-3.5 py-1.5 text-[0.9375rem] transition-colors {isActive(item.href)
							? 'bg-sunken text-ink'
							: 'text-ink-2 hover:text-ink'}"
						aria-current={isActive(item.href) ? 'page' : undefined}
						>{item.label}{#if due(item.href)}<span class="ml-1.5 inline-block size-1.5 -translate-y-0.5 rounded-full bg-accent" aria-hidden="true"></span><span class="sr-only">, fällig</span>{/if}</a
					>
				{/each}
			</nav>

			<div class="ml-auto flex items-center gap-1 md:ml-0">
				<PrivacyToggle />
				<ThemeToggle theme={data.theme} />
				<a
					href="/einstellungen"
					class="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-sunken hover:text-ink {isActive('/einstellungen') ? 'bg-sunken text-ink' : ''}"
					aria-label="Einstellungen"
					title="Einstellungen"
				>
					<Settings size={19} strokeWidth={1.75} />
				</a>
			</div>
		</div>
	</header>

	<main class="mx-auto w-full max-w-5xl flex-1 px-5 pb-12 sm:px-8 print:max-w-none print:p-0">
		{@render children()}
	</main>

	<footer class="mx-auto max-w-5xl px-5 pb-28 text-center text-xs text-ink-3 sm:px-8 md:pb-10 print:hidden">
		Batzen v{VERSION}{#if COMMIT}<span class="opacity-70">+{COMMIT}</span>{/if}
	</footer>
</div>

<nav
	class="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden print:hidden"
	aria-label="Hauptnavigation"
>
	<div class="mx-auto grid max-w-lg grid-cols-6">
		{#each nav as item (item.href)}
			{@const Icon = item.icon}
			<a
				href={item.href}
				class="flex flex-col items-center gap-1 pt-2.5 pb-2 text-[0.6875rem] {isActive(item.href)
					? 'text-ink'
					: 'text-ink-3'}"
				aria-current={isActive(item.href) ? 'page' : undefined}
			>
				<span class="relative">
					<Icon size={21} strokeWidth={isActive(item.href) ? 2.1 : 1.6} />
					{#if due(item.href)}<span class="absolute -top-0.5 -right-1 size-2 rounded-full bg-accent ring-2 ring-paper" aria-hidden="true"></span>{/if}
				</span>
				{item.label}{#if due(item.href)}<span class="sr-only">, fällig</span>{/if}
			</a>
		{/each}
	</div>
</nav>
