<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import {
		currentMonth,
		KINDS,
		lastVersionUpTo,
		type Asset,
		type Category,
		type Interval,
		type Item,
		type ItemKind
	} from '#lib/domain.ts';
	import { untrack } from 'svelte';
	import AmountFields from './AmountFields.svelte';
	import MonthField from './MonthField.svelte';
	import Segmented from './Segmented.svelte';
	import VersionEditor from './VersionEditor.svelte';

	/** Create a cost (item = null) or edit an existing one. */
	let {
		item,
		categories,
		assets,
		defaultCategory,
		onclose,
		dirty = $bindable(false)
	}: {
		item: Item | null;
		categories: Category[];
		assets: Asset[];
		defaultCategory?: number;
		onclose: () => void;
		dirty?: boolean;
	} = $props();

	let kind = $state<ItemKind>(untrack(() => item?.kind ?? 'fixed'));
	let from = $state(currentMonth());
	let error = $state('');
	let reserve = $state(untrack(() => item?.reserve ?? true));
	/** Interval picked for a new item; the reserve only matters for bills that are not monthly */
	let newInterval = $state<Interval>('monthly');
	const showReserve = $derived(
		item ? item.versions.some((v) => !v.ended && v.interval !== 'monthly') : newInterval !== 'monthly'
	);
	// Unsaved changes: any typed or selected field, or a different kind than saved.
	let touched = $state(false);
	let savedKind = $state<ItemKind>(untrack(() => item?.kind ?? 'fixed'));
	$effect(() => {
		dirty = touched || (!!item && kind !== savedKind);
	});

	const submit =
		(closeAfter: boolean): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			if (result.type === 'failure') {
				error = String(result.data?.error ?? 'Speichern fehlgeschlagen.');
				return;
			}
			error = '';
			touched = false;
			savedKind = kind;
			await update({ reset: false });
			if (closeAfter) onclose();
		};

	// Open assets, plus the linked one even if it was closed since
	const assetOptions = $derived(
		assets.filter((a) => !lastVersionUpTo(a.versions, currentMonth())?.ended || a.id === item?.assetId)
	);

	const kindHint: Record<ItemKind, string> = {
		fixed: 'Feste Beträge wie Miete, Abos oder Versicherungen.',
		variable: 'Schätzungen wie Lebensmittel oder Ausgang. Ein ungefährer Wert reicht.',
		saving: 'Geld, das du zur Seite legst: 3. Säule, ETF, Sparkonto.'
	};
</script>

<form
	method="post"
	action={item ? '?/updateItem' : '?/createItem'}
	use:enhance={submit(!item)}
	oninput={() => (touched = true)}
	class="space-y-4"
>
	{#if item}<input type="hidden" name="id" value={item.id} />{/if}
	<input type="hidden" name="kind" value={kind} />
	<input type="hidden" name="reserve" value={reserve ? '1' : '0'} />

	<div>
		<label class="label" for="item-name">Name</label>
		<input id="item-name" name="name" class="field" value={item?.name ?? ''} required autocomplete="off" placeholder="z. B. Krankenkasse" />
	</div>

	<div>
		<label class="label" for="item-category">Kategorie</label>
		<select id="item-category" name="categoryId" class="field" value={item?.categoryId ?? defaultCategory ?? categories[0]?.id}>
			{#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
		</select>
	</div>

	<div>
		<span class="label">Art</span>
		<Segmented label="Art" options={KINDS} bind:value={kind} />
		<p class="mt-2 text-[0.8125rem] text-ink-2">{kindHint[kind]}</p>
	</div>

	{#if kind === 'saving' && assetOptions.length}
		<div>
			<label class="label" for="item-asset">Fliesst in</label>
			<select id="item-asset" name="assetId" class="field" value={item?.assetId ?? ''}>
				<option value="">Keine Anlage</option>
				{#each assetOptions as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
			</select>
			<p class="mt-2 text-[0.8125rem] text-ink-2">
				Der Check-in fragt dann, wie viel du eingezahlt hast, und zeigt, wie viel der Markt dazu beigetragen hat.
			</p>
		</div>
	{/if}

	{#if !item}
		<div class="border-t border-rule pt-4">
			<AmountFields variant="item" idPrefix="new" notes oninterval={(i) => (newInterval = i)} />
		</div>
		<MonthField name="from" id="item-from" label="Seit wann" bind:value={from} />
	{/if}

	{#if showReserve}
		<div>
			<label class="flex items-center gap-3 text-[0.9375rem]">
				<input type="checkbox" bind:checked={reserve} class="size-[1.125rem] accent-[var(--accent)]" />
				In die Rückstellung einrechnen
			</label>
			<p class="mt-2 ml-[1.875rem] text-[0.8125rem] text-ink-2">
				Die Übersicht zeigt, wie viel du jeden Monat dafür zur Seite legst. Ausschalten, wenn du es anders bezahlst, zum Beispiel mit dem Bonus.
			</p>
		</div>
	{/if}

	{#if error}<p class="text-[0.875rem] text-critical" role="alert">{error}</p>{/if}

	<div class="flex justify-end gap-2 pt-1">
		{#if !item}<button type="button" class="btn btn-ghost" onclick={onclose}>Abbrechen</button>{/if}
		<button class="btn btn-primary" disabled={!!item && !dirty}>{item ? 'Änderungen speichern' : 'Posten erfassen'}</button>
	</div>
</form>

{#if item}
	<div class="mt-8">
		<VersionEditor variant="item" ownerId={item.id} versions={item.versions} />
	</div>

	<form
		method="post"
		action="?/deleteItem"
		class="mt-10 border-t border-rule pt-4"
		use:enhance={({ cancel }) => {
			if (!confirm(`«${item.name}» mit dem ganzen Verlauf löschen? Wenn du den Posten nur nicht mehr hast, kündige ihn stattdessen.`)) cancel();
			return async ({ update }) => {
				await update();
				onclose();
			};
		}}
	>
		<input type="hidden" name="id" value={item.id} />
		<button class="btn btn-danger -ml-3">Posten löschen</button>
	</form>
{/if}
