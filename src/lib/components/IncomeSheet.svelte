<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { countedByDefault, currentMonth, INCOME_TYPES, type IncomeSource, type IncomeType } from '#lib/domain.ts';
	import { untrack } from 'svelte';
	import AmountFields from './AmountFields.svelte';
	import MonthField from './MonthField.svelte';
	import VersionEditor from './VersionEditor.svelte';

	let {
		source,
		onclose,
		dirty = $bindable(false)
	}: { source: IncomeSource | null; onclose: () => void; dirty?: boolean } = $props();

	let from = $state(currentMonth());
	let type = $state<IncomeType>(untrack(() => source?.type ?? 'salary'));
	let counted = $state(untrack(() => source?.counted ?? true));
	// New sources follow the type's default until the checkbox is touched.
	let countedTouched = $state(untrack(() => !!source));
	$effect(() => {
		const t = type;
		if (!untrack(() => countedTouched)) counted = countedByDefault(t);
	});
	let error = $state('');

	const submit =
		(closeAfter: boolean): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			if (result.type === 'failure') {
				error = String(result.data?.error ?? 'Speichern fehlgeschlagen.');
				return;
			}
			error = '';
			dirty = false;
			await update({ reset: false });
			if (closeAfter) onclose();
		};
</script>

<form
	method="post"
	action={source ? '?/updateIncome' : '?/createIncome'}
	use:enhance={submit(!source)}
	oninput={() => (dirty = true)}
	class="space-y-4"
>
	{#if source}<input type="hidden" name="id" value={source.id} />{/if}

	<div>
		<label class="label" for="income-name">Name</label>
		<input id="income-name" name="name" class="field" value={source?.name ?? ''} required autocomplete="off" placeholder="z. B. Lohn" />
	</div>

	<div>
		<label class="label" for="income-type">Art</label>
		<select id="income-type" name="type" class="field" bind:value={type}>
			{#each INCOME_TYPES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
		</select>
	</div>

	<div>
		<label class="flex items-center gap-3 text-[0.9375rem]">
			<input
				type="checkbox"
				name="counted"
				bind:checked={counted}
				onchange={() => (countedTouched = true)}
				class="size-[1.125rem] accent-[var(--accent)]"
			/>
			Ins Budget einrechnen
		</label>
		<p class="mt-1.5 ml-[1.875rem] text-[0.8125rem] text-ink-2">
			{counted
				? 'Zählt zum Einkommen, von dem deine Ausgaben abgehen.'
				: 'Wird separat gezeigt, zum Beispiel ein Bonus, der nicht fest eingeplant ist.'}
		</p>
	</div>

	{#if !source}
		<div class="border-t border-rule pt-4">
			<AmountFields variant="income" idPrefix="new-income" thirteenth />
		</div>
		<MonthField name="from" id="income-from" label="Seit wann" bind:value={from} />
	{/if}

	{#if error}<p class="text-[0.875rem] text-critical" role="alert">{error}</p>{/if}

	<div class="flex justify-end gap-2 pt-1">
		{#if !source}<button type="button" class="btn btn-ghost" onclick={onclose}>Abbrechen</button>{/if}
		<button class="btn btn-primary" disabled={!!source && !dirty}>{source ? 'Änderungen speichern' : 'Einkommen erfassen'}</button>
	</div>
</form>

{#if source}
	<div class="mt-8">
		<VersionEditor variant="income" ownerId={source.id} versions={source.versions} />
	</div>

	<form
		method="post"
		action="?/deleteIncome"
		class="mt-10 border-t border-rule pt-4"
		use:enhance={({ cancel }) => {
			if (!confirm(`«${source.name}» mit dem ganzen Verlauf löschen?`)) cancel();
			return async ({ update }) => {
				await update();
				onclose();
			};
		}}
	>
		<input type="hidden" name="id" value={source.id} />
		<button class="btn btn-danger -ml-3">Einkommen löschen</button>
	</form>
{/if}
