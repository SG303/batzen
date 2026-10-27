<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash-2';
	import {
		compareScenario,
		currentMonth,
		intervalLabel,
		monthLabel,
		savingsRate,
		type ScenarioChange,
		type ScenarioEffect
	} from '#lib/domain.ts';
	import { chf, chfDelta, chfExact, decimal } from '#lib/money.ts';
	import { forPeriod, periodSuffix, prefs } from '#lib/prefs.svelte.ts';
	import Lohnband from '#lib/components/Lohnband.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import ScenarioChangeSheet from '#lib/components/ScenarioChangeSheet.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const budget = $derived(data.data);
	const today = currentMonth();

	// Falls back to an empty scenario while leaving the page after deleting it
	const scenario = $derived(
		budget.scenarios.find((s) => s.id === data.id) ?? { id: data.id, name: '', note: null, changes: [] }
	);
	const c = $derived(compareScenario(budget, scenario.changes, today));
	const scale = $derived(
		Math.max(c.actual.income.counted, c.actual.spending + c.actual.saving, c.scenario.income.counted, c.scenario.spending + c.scenario.saving)
	);
	const rate = $derived({ actual: savingsRate(c.actual), scenario: savingsRate(c.scenario) });

	const rows = $derived([
		{ label: 'Einkommen', actual: c.actual.income.counted, scenario: c.scenario.income.counted },
		{ label: 'Fixkosten', actual: c.actual.fixed, scenario: c.scenario.fixed },
		{ label: 'Variable Kosten', actual: c.actual.variable, scenario: c.scenario.variable },
		{ label: 'Sparen', actual: c.actual.saving, scenario: c.scenario.saving },
		{ label: 'Frei', actual: c.actual.free, scenario: c.scenario.free, strong: true }
	]);

	/** One sentence on what is left with the scenario, against today. */
	const headline = $derived.by(() => {
		const before = c.actual.free;
		const after = c.scenario.free;
		if (!scenario.changes.length) return 'Noch keine Änderungen. Füge unten die erste hinzu.';
		if (after < 0) return `Damit gibst du ${periodSuffix()} ${chf(forPeriod(-after))} Franken mehr aus, als reinkommt.`;
		if (Math.abs(after - before) < 100) return `Damit bleiben dir gleich viel, ${chf(forPeriod(after))} Franken ${periodSuffix()}, frei.`;
		return `Damit bleiben dir ${chf(forPeriod(after))} statt ${chf(forPeriod(before))} Franken ${periodSuffix()} frei.`;
	});

	// Change sheet
	let changeOpen = $state(false);
	let changeDirty = $state(false);
	let editIndex = $state<number | null>(null);
	let changeKey = $state(0);
	function openChange(index: number | null) {
		editIndex = index;
		changeDirty = false;
		changeKey++;
		changeOpen = true;
	}

	let renameOpen = $state(false);
	let renameError = $state('');

	/** What a change does, in words: "80 % des heutigen Betrags", "fällt weg", "neu, 3’995.– jährlich" */
	function describe(e: ScenarioEffect): string {
		const ch = e.change;
		if (ch.type === 'remove') return 'fällt weg';
		if (ch.type === 'addItem' || ch.type === 'addIncome') return `neu, ${chfExact(ch.amount)} ${intervalLabel(ch.interval)}`;
		return ch.mode === 'percent' ? `${ch.value} % des heutigen Betrags` : `neuer Betrag ${chfExact(ch.value)}`;
	}

	/** Effect on what is left: more income adds, more cost takes away. */
	const onFree = (e: ScenarioEffect) => (e.target === 'income' ? e.after - e.before : e.before - e.after);

	const label = (ch: ScenarioChange) => (ch.type === 'addIncome' || ('target' in ch && ch.target === 'income') ? 'Einkommen' : 'Posten');
</script>

<svelte:head><title>{scenario.name} · Planen · Batzen</title></svelte:head>

<div class="pt-8 sm:pt-12">
	<a href="/planen" class="inline-flex items-center gap-1.5 text-[0.9375rem] text-ink-2 hover:text-ink"><ArrowLeft size={16} />Planen</a>
</div>

<div class="mt-4 flex flex-wrap items-start justify-between gap-4">
	<div class="min-w-0">
		<h1 class="text-[2rem] font-medium tracking-[-0.025em] break-words sm:text-[2.5rem]">{scenario.name}</h1>
		{#if scenario.note}<p class="mt-1 max-w-[56ch] text-[0.9375rem] text-ink-2">{scenario.note}</p>{/if}
	</div>
	<button type="button" class="btn btn-quiet" onclick={() => { renameError = ''; renameOpen = true; }}>Umbenennen</button>
</div>

<div class="mt-8 flex justify-end">
	<Segmented
		label="Zeitraum"
		options={[
			{ value: 'month', label: 'pro Monat' },
			{ value: 'year', label: 'pro Jahr' }
		]}
		bind:value={prefs.period}
	/>
</div>

<section class="pt-6 pb-14 sm:pb-16" aria-labelledby="hero">
	<h2 id="hero" class="max-w-[24ch] text-[1.875rem] leading-[1.1] font-medium tracking-[-0.03em] text-balance sm:text-[2.75rem] sm:leading-[1.05]">
		{headline}
	</h2>

	{#if scale > 0}
		<div class="mt-10 space-y-8 sm:mt-12">
			<div>
				<p class="mb-3 text-[0.875rem] text-ink-2">Heute, {monthLabel(today)}</p>
				<Lohnband income={c.actual.income.counted} categories={c.actual.categories} {scale} />
			</div>
			<div>
				<p class="mb-3 text-[0.875rem] font-medium">Mit diesem Szenario</p>
				<Lohnband income={c.scenario.income.counted} categories={c.scenario.categories} {scale} />
			</div>
		</div>
	{/if}
</section>

<div class="grid gap-14 pb-8 md:grid-cols-[1fr_1fr] md:gap-12">
	<section aria-labelledby="compare">
		<h2 id="compare" class="mb-4 text-[1.375rem] font-medium tracking-[-0.015em]">Im Vergleich</h2>
		<table class="num w-full text-[0.9375rem]">
			<thead>
				<tr class="border-b border-rule text-[0.8125rem] text-ink-3">
					<th class="py-2.5 pr-3 text-left font-normal">CHF {prefs.period === 'year' ? 'pro Jahr' : 'pro Monat'}</th>
					<th class="px-2 py-2.5 text-right font-normal">Heute</th>
					<th class="px-2 py-2.5 text-right font-normal">Szenario</th>
					<th class="py-2.5 pl-2 text-right font-normal">Differenz</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as r (r.label)}
					<tr class="border-b border-rule">
						<th scope="row" class="py-3 pr-3 text-left {r.strong ? 'font-medium' : 'font-normal text-ink-2'}">{r.label}</th>
						<td class="px-2 py-3 text-right">{chf(forPeriod(r.actual))}</td>
						<td class="px-2 py-3 text-right {r.strong ? 'font-medium' : ''}">{chf(forPeriod(r.scenario))}</td>
						<td class="py-3 pl-2 text-right text-ink-2">{chfDelta(forPeriod(r.scenario - r.actual))}</td>
					</tr>
				{/each}
				<tr class="border-b border-rule">
					<th scope="row" class="py-3 pr-3 text-left font-normal text-ink-2">Sparquote</th>
					<td class="px-2 py-3 text-right">{rate.actual ? `${decimal(rate.actual.total)} %` : '–'}</td>
					<td class="px-2 py-3 text-right">{rate.scenario ? `${decimal(rate.scenario.total)} %` : '–'}</td>
					<td class="py-3 pl-2 text-right text-ink-2">
						{rate.actual && rate.scenario ? `${rate.scenario.total >= rate.actual.total ? '+' : '−'}${decimal(Math.abs(rate.scenario.total - rate.actual.total))} Pkt.` : ''}
					</td>
				</tr>
				<tr class="border-b border-rule">
					<th scope="row" class="py-3 pr-3 text-left font-normal text-ink-2">Notgroschen</th>
					<td class="px-2 py-3 text-right">{c.emergency.actual === null ? '–' : `${decimal(c.emergency.actual)} Mt.`}</td>
					<td class="px-2 py-3 text-right">{c.emergency.scenario === null ? '–' : `${decimal(c.emergency.scenario)} Mt.`}</td>
					<td></td>
				</tr>
			</tbody>
		</table>
		<p class="mt-3 text-[0.8125rem] text-ink-3">Notgroschen: heutiges Geld auf Konten geteilt durch die Ausgaben.</p>
	</section>

	<section aria-labelledby="changes">
		<div class="mb-4 flex items-baseline justify-between gap-4">
			<h2 id="changes" class="text-[1.375rem] font-medium tracking-[-0.015em]">Änderungen</h2>
			<span class="text-[0.8125rem] text-ink-3">Wirkung auf «frei»</span>
		</div>
		<ul class="border-t border-rule">
			{#each c.effects as e, i (i)}
				<li class="flex items-center border-b border-rule">
					<button type="button" class="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-4 py-3 text-left transition-colors hover:bg-sunken/60 sm:px-2" onclick={() => openChange(i)} disabled={e.name === null}>
						<span class="min-w-0">
							<span class="block truncate">{e.name ?? 'Gelöschter Eintrag'}</span>
							<span class="block truncate text-[0.8125rem] text-ink-3">
								{label(e.change)}, {e.active ? describe(e) : e.name === null ? 'gibt es nicht mehr' : 'im Moment nicht aktiv, ohne Wirkung'}
							</span>
						</span>
						<span class="num text-right {e.active ? '' : 'text-ink-3'}">{chfDelta(forPeriod(onFree(e)))}</span>
					</button>
					<form method="post" action="?/deleteChange" use:enhance={() => async ({ update }) => update({ reset: false })}>
						<input type="hidden" name="index" value={i} />
						<button class="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-critical" aria-label="Änderung an {e.name ?? 'gelöschtem Eintrag'} entfernen"><Trash size={15} /></button>
					</form>
				</li>
			{/each}
		</ul>
		<button type="button" class="btn btn-quiet mt-4" onclick={() => openChange(null)}><Plus size={18} />Änderung hinzufügen</button>
	</section>
</div>

<div class="mt-16 flex flex-wrap gap-3 border-t border-rule pt-6">
	<form method="post" action="?/copyScenario" use:enhance>
		<button class="btn btn-quiet">Als Kopie weiterführen</button>
	</form>
	<form
		method="post"
		action="?/deleteScenario"
		use:enhance={({ cancel }) => {
			if (!confirm(`Szenario «${scenario.name}» löschen? Dein Budget bleibt, wie es ist.`)) cancel();
		}}
	>
		<button class="btn btn-danger">Szenario löschen</button>
	</form>
</div>

<Sheet
	bind:open={changeOpen}
	canClose={() => !changeDirty || confirm('Ungespeicherte Änderungen verwerfen?')}
	title={editIndex === null ? 'Neue Änderung' : 'Änderung bearbeiten'}
>
	{#key changeKey}
		<ScenarioChangeSheet
			change={editIndex === null ? null : scenario.changes[editIndex]}
			index={editIndex}
			{budget}
			month={today}
			onclose={() => (changeOpen = false)}
			bind:dirty={changeDirty}
		/>
	{/key}
</Sheet>

<Sheet bind:open={renameOpen} title="Szenario umbenennen">
	<form
		method="post"
		action="?/saveScenario"
		class="space-y-4"
		use:enhance={() => async ({ result, update }) => {
			if (result.type === 'failure') {
				renameError = String(result.data?.error ?? 'Speichern fehlgeschlagen.');
				return;
			}
			await update({ reset: false });
			renameOpen = false;
		}}
	>
		<div>
			<label class="label" for="scenario-name">Name</label>
			<input id="scenario-name" name="name" class="field" value={scenario.name} required autocomplete="off" />
		</div>
		<div>
			<label class="label" for="scenario-note">Notiz</label>
			<textarea id="scenario-note" name="note" rows="3" class="field h-auto! py-2.5" maxlength="500">{scenario.note ?? ''}</textarea>
		</div>
		{#if renameError}<p class="text-[0.875rem] text-critical" role="alert">{renameError}</p>{/if}
		<div class="flex justify-end gap-2 pt-1">
			<button type="button" class="btn btn-ghost" onclick={() => (renameOpen = false)}>Abbrechen</button>
			<button class="btn btn-primary">Speichern</button>
		</div>
	</form>
</Sheet>
