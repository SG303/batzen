<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import {
		incomeMonthly,
		intervalLabel,
		KINDS,
		versionAt,
		versionMonthly,
		type BudgetData,
		type IncomeVersion,
		type ItemKind,
		type ItemVersion,
		type Month,
		type ScenarioChange
	} from '#lib/domain.ts';
	import { chf, chfExact, parseChf, toInput } from '#lib/money.ts';
	import { untrack } from 'svelte';
	import AmountFields from './AmountFields.svelte';
	import Segmented from './Segmented.svelte';

	/**
	 * Add a change to a scenario (change = null) or edit the one at `index`. Existing items and incomes
	 * can be scaled, set to a new amount or dropped; new ones are entered like on the items page.
	 */
	let {
		change,
		index,
		budget,
		month,
		onclose,
		dirty = $bindable(false)
	}: {
		change: ScenarioChange | null;
		index: number | null;
		budget: BudgetData;
		month: Month;
		onclose: () => void;
		dirty?: boolean;
	} = $props();

	type Mode = 'percent' | 'amount' | 'remove';

	const initialWhat = untrack(() => {
		if (!change) return '';
		if (change.type === 'addItem') return 'newItem';
		if (change.type === 'addIncome') return 'newIncome';
		return `${change.target}:${change.id}`;
	});
	let what = $state(initialWhat);
	let mode = $state<Mode>(
		untrack(() => (change?.type === 'remove' ? 'remove' : change?.type === 'change' ? change.mode : 'percent'))
	);
	let value = $state(
		untrack(() =>
			change?.type === 'change' ? (change.mode === 'percent' ? String(change.value) : toInput(change.value)) : ''
		)
	);
	let kind = $state<ItemKind>(untrack(() => (change?.type === 'addItem' ? change.kind : 'fixed')));
	let error = $state('');

	// Switching mode or kind is a change, even without typing. A percentage is no amount, so the
	// value starts empty in the other mode.
	const initialKind = untrack(() => kind);
	let shownMode = untrack(() => mode);
	$effect(() => {
		if (mode !== shownMode) {
			shownMode = mode;
			untrack(() => (value = ''));
			dirty = true;
		}
		if (kind !== initialKind) dirty = true;
	});

	/** Everything active in the month that counts towards the budget, incomes first, items by category */
	const incomes = $derived(
		budget.incomes.flatMap((s) => {
			const v = s.counted ? versionAt(s.versions, month) : null;
			return v ? [{ id: s.id, name: s.name, version: v }] : [];
		})
	);
	const groups = $derived(
		budget.categories
			.map((c) => ({
				category: c,
				items: budget.items.flatMap((i) => {
					const v = i.categoryId === c.id ? versionAt(i.versions, month) : null;
					return v ? [{ id: i.id, name: i.name, version: v }] : [];
				})
			}))
			.filter((g) => g.items.length)
	);

	const selected = $derived.by(() => {
		const m = /^(item|income):(\d+)$/.exec(what);
		if (!m) return null;
		const id = Number(m[2]);
		if (m[1] === 'income') {
			const s = incomes.find((x) => x.id === id);
			return s ? { target: 'income' as const, ...s, monthly: (amount: number) => incomeMonthly({ ...s.version, amount }) } : null;
		}
		const i = groups.flatMap((g) => g.items).find((x) => x.id === id);
		return i ? { target: 'item' as const, ...i, monthly: (amount: number) => versionMonthly({ ...i.version, amount }).mine } : null;
	});

	/** Incomes are usually scaled (workload), costs usually get a new amount */
	function picked() {
		mode = what.startsWith('income:') ? 'percent' : 'amount';
		value = '';
	}

	const modes = $derived<{ value: Mode; label: string }[]>(
		selected?.target === 'income'
			? [
					{ value: 'percent', label: 'In Prozent' },
					{ value: 'amount', label: 'Neuer Betrag' },
					{ value: 'remove', label: 'Fällt weg' }
				]
			: [
					{ value: 'amount', label: 'Neuer Betrag' },
					{ value: 'percent', label: 'In Prozent' },
					{ value: 'remove', label: 'Fällt weg' }
				]
	);

	/** "Entspricht 5'320 statt 6'650 Franken im Monat" */
	const preview = $derived.by(() => {
		if (!selected) return null;
		const before = selected.monthly(selected.version.amount);
		if (mode === 'remove') return { before, after: 0 };
		if (mode === 'percent') {
			const p = Number(value.replace(',', '.'));
			return value && Number.isFinite(p) ? { before, after: selected.monthly(Math.round((selected.version.amount * p) / 100)) } : null;
		}
		const a = parseChf(value);
		return a === null ? null : { before, after: selected.monthly(a) };
	});

	const currentLabel = $derived.by(() => {
		if (!selected) return '';
		const v = selected.version;
		const base = `Heute ${chfExact(v.amount)} ${intervalLabel(v.interval)}`;
		if (selected.target === 'income') return (v as IncomeVersion).thirteenth ? `${base}, 13 Mal im Jahr` : base;
		const share = (v as ItemVersion).share;
		return share < 100 ? `${base}, dein Anteil ${share} %` : base;
	});

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

	const added = $derived(change?.type === 'addItem' || change?.type === 'addIncome' ? change : null);
</script>

<form method="post" action="?/saveChange" use:enhance={submit} oninput={() => (dirty = true)} class="space-y-4">
	{#if index !== null}<input type="hidden" name="index" value={index} />{/if}

	<div>
		<label class="label" for="change-what">Was ändert sich</label>
		<select id="change-what" name="what" class="field" bind:value={what} onchange={picked} required>
			<option value="" disabled>Bitte wählen</option>
			<optgroup label="Neu dazu">
				<option value="newItem">Neuer Posten</option>
				<option value="newIncome">Neues Einkommen</option>
			</optgroup>
			{#if incomes.length}
				<optgroup label="Einkommen">
					{#each incomes as s (s.id)}<option value="income:{s.id}">{s.name}</option>{/each}
				</optgroup>
			{/if}
			{#each groups as g (g.category.id)}
				<optgroup label={g.category.name}>
					{#each g.items as i (i.id)}<option value="item:{i.id}">{i.name}</option>{/each}
				</optgroup>
			{/each}
		</select>
	</div>

	{#if selected}
		<input type="hidden" name="mode" value={mode} />
		<p class="text-[0.875rem] text-ink-2">{currentLabel}</p>
		<Segmented label="Art der Änderung" options={modes} bind:value={mode} />
		{#if mode !== 'remove'}
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="label" for="change-value">{mode === 'percent' ? 'Prozent vom heutigen Betrag' : `Neuer Betrag in CHF, ${intervalLabel(selected.version.interval)}`}</label>
					<input
						id="change-value"
						name="value"
						class="field num"
						inputmode="decimal"
						autocomplete="off"
						placeholder={mode === 'percent' ? '80' : toInput(selected.version.amount)}
						bind:value
						required
					/>
				</div>
			</div>
		{/if}
		{#if preview}
			<p class="text-[0.875rem] text-ink-2">
				{mode === 'remove'
					? `Fällt weg: ${chf(preview.before)} Franken im Monat.`
					: `Entspricht ${chf(preview.after)} statt ${chf(preview.before)} Franken im Monat${selected.target === 'item' ? ' für dich' : ''}.`}
			</p>
		{/if}
	{:else if what === 'newItem'}
		<div>
			<label class="label" for="change-name">Name</label>
			<input id="change-name" name="name" class="field" value={added?.name ?? ''} required autocomplete="off" placeholder="z. B. GA 2. Klasse" />
		</div>
		<div>
			<label class="label" for="change-category">Kategorie</label>
			<select id="change-category" name="categoryId" class="field" value={added?.type === 'addItem' ? added.categoryId : budget.categories[0]?.id}>
				{#each budget.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</div>
		<div>
			<span class="label">Art</span>
			<input type="hidden" name="kind" value={kind} />
			<Segmented label="Art" options={KINDS} bind:value={kind} />
		</div>
		<AmountFields
			variant="item"
			idPrefix="change"
			amount={added?.amount}
			interval={added?.type === 'addItem' ? added.interval : undefined}
			share={added?.type === 'addItem' ? added.share : undefined}
			dueMonths={false}
		/>
	{:else if what === 'newIncome'}
		<div>
			<label class="label" for="change-name">Name</label>
			<input id="change-name" name="name" class="field" value={added?.name ?? ''} required autocomplete="off" placeholder="z. B. Nebenjob" />
		</div>
		<AmountFields
			variant="income"
			idPrefix="change"
			amount={added?.amount}
			interval={added?.type === 'addIncome' ? added.interval : undefined}
			thirteenth={added?.type === 'addIncome' ? added.thirteenth : undefined}
		/>
	{/if}

	{#if error}<p class="text-[0.875rem] text-critical" role="alert">{error}</p>{/if}

	<div class="flex justify-end gap-2 pt-1">
		<button type="button" class="btn btn-ghost" onclick={onclose}>Abbrechen</button>
		<button class="btn btn-primary" disabled={!what || (!!change && !dirty)}>{change ? 'Änderungen speichern' : 'Änderung hinzufügen'}</button>
	</div>
</form>
