<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash-2';
	import {
		currentMonth,
		dueLabel,
		intervalLabel,
		monthLabel,
		versionAt,
		type AssetVersion,
		type IncomeVersion,
		type ItemVersion
	} from '#lib/domain.ts';
	import { chfExact } from '#lib/money.ts';
	import AmountFields from './AmountFields.svelte';
	import MonthField from './MonthField.svelte';

	/**
	 * The amount history of a cost, income or asset balance. Every row applies from its month
	 * until the next row, so adding a row in the past fills in earlier years.
	 */
	let {
		variant,
		ownerId,
		versions
	}: {
		variant: 'item' | 'income' | 'asset';
		ownerId: number;
		versions: (ItemVersion | IncomeVersion | AssetVersion)[];
	} = $props();

	type Mode = { kind: 'new' } | { kind: 'end' } | { kind: 'edit'; version: ItemVersion | IncomeVersion | AssetVersion };
	let mode = $state<Mode | null>(null);
	let from = $state(currentMonth());
	let error = $state('');

	const sorted = $derived([...versions].sort((a, b) => b.from.localeCompare(a.from)));
	const active = $derived(versionAt(versions, currentMonth()));
	const saveAction = $derived(variant === 'income' ? '?/saveIncomeVersion' : '?/saveVersion');
	const deleteAction = $derived(variant === 'income' ? '?/deleteIncomeVersion' : '?/deleteVersion');
	const ownerField = $derived({ item: 'itemId', income: 'sourceId', asset: 'assetId' }[variant]);
	const endWord = $derived({ item: 'Kündigen', income: 'Beenden', asset: 'Auflösen' }[variant]);
	const endedWord = $derived({ item: 'gekündigt', income: 'beendet', asset: 'aufgelöst' }[variant]);
	const endFrom = $derived({ item: 'Gekündigt ab', income: 'Beendet ab', asset: 'Aufgelöst ab' }[variant]);

	function open(next: Mode) {
		mode = next;
		error = '';
		from = next.kind === 'edit' ? next.version.from : currentMonth();
	}

	function describe(v: ItemVersion | IncomeVersion | AssetVersion): string {
		if (v.ended) return endedWord;
		if ('balance' in v) return chfExact(v.balance);
		let text = `${chfExact(v.amount)} ${intervalLabel(v.interval)}`;
		const due = 'dueMonth' in v ? dueLabel(v) : null;
		if (due) text += `, ${due}`;
		if ('share' in v && v.share < 100) text += `, dein Anteil ${v.share} %`;
		if ('thirteenth' in v && v.thirteenth) text += ', 13 Mal';
		return text;
	}

	const submit: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				error = String(result.data?.error ?? 'Speichern fehlgeschlagen.');
				return;
			}
			mode = null;
			await update({ reset: false });
		};
	};
</script>

<h3 class="text-[0.9375rem] font-medium">Verlauf</h3>
<p class="mt-0.5 text-[0.8125rem] text-ink-2">
	Jeder Eintrag gilt ab seinem Monat bis zum nächsten. Ältere Einträge kannst du jederzeit nachtragen.
</p>

<ol class="mt-3 border-t border-rule">
	{#each sorted as v (v.id)}
		<li class="flex items-center gap-3 border-b border-rule py-2.5">
			<span class="h-2 w-2 flex-none rounded-full {v === active ? 'bg-accent' : 'border border-ink-3'}" aria-hidden="true"></span>
			<div class="min-w-0 flex-1">
				<div class="text-[0.9375rem]">ab {monthLabel(v.from)}</div>
				<div class="num text-[0.8125rem] text-ink-2">{describe(v)}</div>
			</div>
			<button
				type="button"
				class="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-ink"
				aria-label="Eintrag ab {monthLabel(v.from)} bearbeiten"
				onclick={() => open({ kind: 'edit', version: v })}
			>
				<Pencil size={15} />
			</button>
			<form method="post" action={deleteAction} use:enhance={submit}>
				<input type="hidden" name="id" value={v.id} />
				<button
					class="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-critical disabled:opacity-30"
					aria-label="Eintrag ab {monthLabel(v.from)} löschen"
					disabled={versions.length === 1}
					title={versions.length === 1 ? 'Der letzte Eintrag kann nicht gelöscht werden' : undefined}
				>
					<Trash size={15} />
				</button>
			</form>
		</li>
	{/each}
</ol>

{#if mode}
	<form method="post" action={saveAction} use:enhance={submit} class="mt-4 rounded-2xl bg-sunken p-4">
		<input type="hidden" name={ownerField} value={ownerId} />
		{#if mode.kind === 'edit'}<input type="hidden" name="versionId" value={mode.version.id} />{/if}
		{#if mode.kind === 'end' || (mode.kind === 'edit' && mode.version.ended)}
			<input type="hidden" name="ended" value="1" />
		{/if}

		<MonthField
			name="from"
			id="version-from"
			label={mode.kind === 'end' ? endFrom : 'Gilt ab'}
			bind:value={from}
		/>

		{#if mode.kind === 'new' || (mode.kind === 'edit' && !mode.version.ended)}
			{@const base = mode.kind === 'edit' ? mode.version : (active ?? sorted[0])}
			<div class="mt-4">
				<AmountFields
					{variant}
					idPrefix="version"
					amount={base && !base.ended ? ('balance' in base ? base.balance : base.amount) : 0}
					interval={base && 'interval' in base ? base.interval : undefined}
					share={base && 'share' in base ? base.share : 100}
					thirteenth={base && 'thirteenth' in base ? base.thirteenth : false}
					dueMonth={base && 'dueMonth' in base ? base.dueMonth : null}
				/>
			</div>
		{/if}

		{#if error}<p class="mt-3 text-[0.875rem] text-critical" role="alert">{error}</p>{/if}

		<div class="mt-4 flex justify-end gap-2">
			<button type="button" class="btn btn-ghost" onclick={() => (mode = null)}>Abbrechen</button>
			<button class="btn btn-primary">
				{mode.kind === 'end' ? endWord : 'Speichern'}
			</button>
		</div>
	</form>
{:else}
	<div class="mt-4 flex flex-wrap gap-2">
		<button type="button" class="btn btn-quiet" onclick={() => open({ kind: 'new' })}>
			{variant === 'asset' ? 'Neuer Saldo' : 'Neuer Betrag'}
		</button>
		{#if active}
			<button type="button" class="btn btn-ghost" onclick={() => open({ kind: 'end' })}>{endWord}</button>
		{/if}
	</div>
{/if}
