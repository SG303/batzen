<script lang="ts">
	import { enhance } from '$app/forms';
	import Plus from '@lucide/svelte/icons/plus';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import {
		compareScenario,
		currentMonth,
		goalStatuses,
		monthLabel,
		type Goal,
		type GoalStatus
	} from '#lib/domain.ts';
	import { chf, chfDelta } from '#lib/money.ts';
	import Sheet from '#lib/components/Sheet.svelte';
	import GoalSheet from '#lib/components/GoalSheet.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const budget = $derived(data.data);
	const today = currentMonth();

	const goals = $derived(goalStatuses(budget, today));
	const onTrack = $derived(goals.filter((g) => g.state === 'onTrack' || g.state === 'reached').length);
	const sharedPace = $derived(goals.filter((g) => g.paceFrom === 'budget' && g.state !== 'reached').length > 1);

	const scenarios = $derived(
		budget.scenarios.map((sc) => ({ scenario: sc, c: compareScenario(budget, sc.changes, today) }))
	);

	let sheetOpen = $state(false);
	let sheetDirty = $state(false);
	let editing = $state<Goal | null>(null);
	let sheetKey = $state(0);

	function openGoal(goal: Goal | null) {
		editing = goal;
		sheetDirty = false;
		sheetKey++;
		sheetOpen = true;
	}

	/** Heading over the goals: how many of them the current saving reaches in time. */
	const headline = $derived.by(() => {
		if (!goals.length) return 'Wofür sparst du?';
		if (goals.length === 1) {
			const g = goals[0];
			if (g.state === 'reached') return `Dein Ziel «${g.goal.name}» ist erreicht.`;
			return g.state === 'onTrack' ? `Du bist mit «${g.goal.name}» auf Kurs.` : `Für «${g.goal.name}» reicht das Spartempo noch nicht.`;
		}
		if (onTrack === goals.length) return `Alle ${goals.length} Ziele sind auf Kurs.`;
		if (onTrack === 0) return `Für keines deiner ${goals.length} Ziele reicht das Spartempo.`;
		return `${onTrack} von ${goals.length} Zielen sind auf Kurs.`;
	});

	/** One or two plain sentences on where a goal stands. */
	function status(g: GoalStatus): string {
		const by = monthLabel(g.goal.due);
		if (g.state === 'reached') return `Erreicht: ${chf(g.current)} von ${chf(g.goal.target)} Franken.`;
		if (g.state === 'missed') return `Der ${by} ist vorbei, es fehlen noch ${chf(g.remaining)} Franken.`;
		const need = `Bis ${by} fehlen ${chf(g.remaining)} Franken, also ${chf(g.needed!)} im Monat.`;
		if (g.pace <= 0) return `${need} Im Moment fliesst nichts in dieses Ziel.`;
		const pace = g.paceFrom === 'budget' && sharedPace ? `Dafür bleiben ${chf(g.pace)}` : `Du sparst ${chf(g.pace)}`;
		if (g.state === 'onTrack') {
			return `${need} ${pace}${g.reachedBy && g.reachedBy < g.goal.due ? `, damit ist es schon im ${monthLabel(g.reachedBy)} erreicht` : ''}.`;
		}
		return `${need} ${pace}, damit dauert es bis ${monthLabel(g.reachedBy!)}.`;
	}

	const paceLabel = (g: GoalStatus) =>
		g.paceFrom === 'items'
			? `Sparposten für ${g.asset!.name}`
			: sharedPace
				? 'dein Anteil an dem, was frei bleibt'
				: 'was frei bleibt, plus Sparposten ohne Anlage';
</script>

<svelte:head><title>Planen · Batzen</title></svelte:head>

<div class="pt-10 sm:pt-14">
	<h1 class="text-[2rem] font-medium tracking-[-0.025em] sm:text-[2.5rem]">Planen</h1>
	<p class="mt-1 max-w-[52ch] text-[0.9375rem] text-ink-2">
		Sparziele und «Was wäre wenn». Gerechnet wird mit deinem Budget von {monthLabel(today)}; das Budget selbst bleibt, wie es ist.
	</p>
</div>

<section class="pt-12 pb-16" aria-labelledby="goals">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<h2 id="goals" class="max-w-[24ch] text-[1.75rem] leading-[1.15] font-medium tracking-[-0.025em] text-balance sm:text-[2.25rem]">
			{headline}
		</h2>
		<button type="button" class="btn btn-quiet" onclick={() => openGoal(null)}><Plus size={18} />Neues Ziel</button>
	</div>

	{#if goals.length}
		<ul class="mt-8 border-t border-rule">
			{#each goals as g (g.goal.id)}
				{@const progress = Math.min(g.current / g.goal.target, 1)}
				{@const good = g.state === 'onTrack' || g.state === 'reached'}
				<li>
					<button
						type="button"
						class="grid w-full gap-x-8 gap-y-2 border-b border-rule py-5 text-left transition-colors hover:bg-sunken/60 sm:grid-cols-[1fr_16rem] sm:px-2"
						onclick={() => openGoal(g.goal)}
					>
						<span class="min-w-0">
							<span class="flex items-baseline justify-between gap-4">
								<span class="truncate font-medium">{g.goal.name}</span>
								<span class="text-[0.8125rem] whitespace-nowrap {good ? 'text-accent' : 'text-ink-2'}">
									{g.state === 'reached' ? 'Erreicht' : g.state === 'onTrack' ? 'Auf Kurs' : g.state === 'missed' ? 'Verpasst' : 'Zu langsam'}
								</span>
							</span>
							<span class="mt-1 block max-w-[60ch] text-[0.9375rem] text-ink-2">{status(g)}</span>
							<span class="mt-1 block text-[0.8125rem] text-ink-3">
								{g.asset ? `Stand: Saldo von ${g.asset.name}` : 'Stand von Hand eingetragen'}{g.state === 'reached' || g.state === 'missed' ? '' : `. Spartempo: ${paceLabel(g)}`}
							</span>
						</span>
						<span class="self-center">
							<span class="flex items-baseline justify-between gap-3 text-[0.8125rem]">
								<span class="num">{chf(g.current)}</span>
								<span class="num text-ink-3">von {chf(g.goal.target)}</span>
							</span>
							<span
								class="mt-1.5 block h-2 overflow-hidden rounded-full bg-sunken"
								role="progressbar"
								aria-label="Fortschritt {g.goal.name}"
								aria-valuemin="0"
								aria-valuemax="100"
								aria-valuenow={Math.round(progress * 100)}
							>
								<span class="block h-full rounded-full {good ? 'bg-accent' : 'bg-ink-3'}" style="width: {progress * 100}%"></span>
							</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
		<p class="mt-3 max-w-[64ch] text-[0.8125rem] text-ink-3">
			Marktgewinne sind nicht eingerechnet, nur was du einzahlst.
			{sharedPace ? 'Ziele ohne eigenen Sparposten teilen sich, was frei bleibt; das frühere Ziel geht vor.' : ''}
		</p>
	{:else}
		<p class="mt-4 max-w-[56ch] text-[1.0625rem] text-ink-2">
			Gib einem Betrag ein Datum, zum Beispiel 8’000 Franken für eine Reise bis nächsten Sommer. Batzen rechnet aus,
			ob dein Spartempo reicht und wann du das Ziel erreichst.
		</p>
	{/if}
</section>

<section class="pb-8" aria-labelledby="scenarios">
	<h2 id="scenarios" class="text-[1.375rem] font-medium tracking-[-0.015em]">Was wäre wenn</h2>
	<p class="mt-1 max-w-[56ch] text-[0.9375rem] text-ink-2">
		Spiel Änderungen durch, etwa ein kleineres Pensum oder einen Umzug, und vergleiche sie mit deinem Budget.
	</p>

	{#if scenarios.length}
		<ul class="mt-6 border-t border-rule">
			{#each scenarios as { scenario, c } (scenario.id)}
				{@const delta = c.scenario.free - c.actual.free}
				<li>
					<a
						href="/planen/{scenario.id}"
						class="group grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-4 transition-colors hover:bg-sunken/60 sm:px-2"
					>
						<span class="min-w-0">
							<span class="block truncate font-medium">{scenario.name}</span>
							<span class="block truncate text-[0.8125rem] text-ink-3">
								{scenario.note ?? (scenario.changes.length === 1 ? '1 Änderung' : `${scenario.changes.length} Änderungen`)}
							</span>
						</span>
						<span class="flex items-center gap-3">
							<span class="text-right">
								<span class="num block">{c.scenario.free >= 0 ? `${chf(c.scenario.free)} frei` : `${chf(-c.scenario.free)} fehlen`}</span>
								<span class="num block text-[0.8125rem] text-ink-2">{chfDelta(delta)} im Monat</span>
							</span>
							<ChevronRight size={16} class="text-ink-3 group-hover:text-ink-2" />
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<form method="post" action="?/createScenario" use:enhance class="mt-6 flex flex-wrap items-center gap-3">
		<input name="name" placeholder="z. B. 80 % Pensum" aria-label="Name des neuen Szenarios" class="field max-w-72" autocomplete="off" required />
		<button class="btn btn-quiet"><Plus size={18} />Szenario anlegen</button>
	</form>
	{#if form?.error}<p class="mt-2 text-[0.875rem] text-critical" role="alert">{form.error}</p>{/if}
</section>

<Sheet
	bind:open={sheetOpen}
	canClose={() => !sheetDirty || confirm('Ungespeicherte Änderungen verwerfen?')}
	title={editing?.name ?? 'Neues Ziel'}
>
	{#key sheetKey}
		<GoalSheet goal={editing} assets={budget.assets} onclose={() => (sheetOpen = false)} bind:dirty={sheetDirty} />
	{/key}
</Sheet>
