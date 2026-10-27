<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { addMonths, currentMonth, lastVersionUpTo, type Asset, type Goal } from '#lib/domain.ts';
	import { toInput } from '#lib/money.ts';
	import { untrack } from 'svelte';
	import MonthField from './MonthField.svelte';

	/** Create a savings goal (goal = null) or edit one. */
	let {
		goal,
		assets,
		onclose,
		dirty = $bindable(false)
	}: { goal: Goal | null; assets: Asset[]; onclose: () => void; dirty?: boolean } = $props();

	const today = currentMonth();
	let due = $state(untrack(() => goal?.due ?? addMonths(today, 12)));
	let assetId = $state(untrack(() => (goal?.assetId ? String(goal.assetId) : '')));
	let error = $state('');

	// Open assets, plus the linked one even if it was closed since
	const assetOptions = $derived(
		assets.filter((a) => !lastVersionUpTo(a.versions, today)?.ended || a.id === goal?.assetId)
	);

	const submit: SubmitFunction = () => async ({ result, update }) => {
		if (result.type === 'failure') {
			error = String(result.data?.error ?? 'Speichern fehlgeschlagen.');
			return;
		}
		error = '';
		dirty = false;
		await update({ reset: false });
		onclose();
	};
</script>

<form method="post" action="/planen?/saveGoal" use:enhance={submit} oninput={() => (dirty = true)} class="space-y-4">
	{#if goal}<input type="hidden" name="id" value={goal.id} />{/if}

	<div>
		<label class="label" for="goal-name">Wofür</label>
		<input id="goal-name" name="name" class="field" value={goal?.name ?? ''} required autocomplete="off" placeholder="z. B. Reise nach Japan" />
	</div>

	<div class="grid grid-cols-2 gap-3">
		<div>
			<label class="label" for="goal-target">Zielbetrag in CHF</label>
			<input id="goal-target" name="target" class="field num" inputmode="decimal" autocomplete="off" placeholder="8000" value={goal ? toInput(goal.target) : ''} required />
		</div>
	</div>

	<MonthField name="due" id="goal-due" label="Bis wann" bind:value={due} yearsAhead={40} />

	<div>
		<label class="label" for="goal-asset">Fortschritt</label>
		<select id="goal-asset" name="assetId" class="field" bind:value={assetId} onchange={() => (dirty = true)}>
			<option value="">Von Hand eintragen</option>
			{#each assetOptions as a (a.id)}<option value={String(a.id)}>Saldo von {a.name}</option>{/each}
		</select>
		<p class="mt-2 text-[0.8125rem] text-ink-2">
			{assetId
				? 'Der Saldo zählt als Stand. Fliesst ein Sparposten in diese Anlage, ist er das Spartempo, sonst das, was jeden Monat frei bleibt.'
				: 'Verglichen wird mit dem, was jeden Monat frei bleibt, plus Sparposten, die in keine Anlage fliessen.'}
		</p>
	</div>

	{#if !assetId}
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="label" for="goal-saved">Bereits gespart in CHF</label>
				<input id="goal-saved" name="saved" class="field num" inputmode="decimal" autocomplete="off" placeholder="0" value={goal?.saved ? toInput(goal.saved) : ''} />
			</div>
		</div>
	{/if}

	{#if error}<p class="text-[0.875rem] text-critical" role="alert">{error}</p>{/if}

	<div class="flex justify-end gap-2 pt-1">
		<button type="button" class="btn btn-ghost" onclick={onclose}>Abbrechen</button>
		<button class="btn btn-primary" disabled={!!goal && !dirty}>{goal ? 'Änderungen speichern' : 'Ziel erfassen'}</button>
	</div>
</form>

{#if goal}
	<form
		method="post"
		action="/planen?/deleteGoal"
		class="mt-10 border-t border-rule pt-4"
		use:enhance={({ cancel }) => {
			if (!confirm(`Ziel «${goal.name}» löschen?`)) cancel();
			return async ({ update }) => {
				await update();
				onclose();
			};
		}}
	>
		<input type="hidden" name="id" value={goal.id} />
		<button class="btn btn-danger -ml-3">Ziel löschen</button>
	</form>
{/if}
