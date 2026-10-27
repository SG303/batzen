<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import {
		ASSET_TYPES,
		assetTypeInfo,
		currentMonth,
		linkedItems,
		versionAt,
		versionMonthly,
		type Asset,
		type AssetType,
		type Item
	} from '#lib/domain.ts';
	import { chf } from '#lib/money.ts';
	import { untrack } from 'svelte';
	import AmountFields from './AmountFields.svelte';
	import MonthField from './MonthField.svelte';
	import VersionEditor from './VersionEditor.svelte';

	/** Create an asset (asset = null) or edit an existing one. */
	let {
		asset,
		providers,
		items,
		onclose,
		dirty = $bindable(false)
	}: { asset: Asset | null; providers: string[]; items: Item[]; onclose: () => void; dirty?: boolean } = $props();

	let type = $state<AssetType>(untrack(() => asset?.type ?? 'account'));
	let from = $state(currentMonth());
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

	/** Saving items paying into this asset, with their current monthly amount. */
	const feeds = $derived(
		asset
			? linkedItems(items, asset.id).map((item) => {
					const v = versionAt(item.versions, currentMonth());
					return { item, monthly: v ? versionMonthly(v).mine : 0 };
				})
			: []
	);

	const typeHint = $derived(
		assetTypeInfo(type).tied
			? 'Gebunden: zählt zum Vermögen, ist aber nicht frei verfügbar.'
			: type === 'account'
				? 'Zählt für den Notgroschen.'
				: 'Frei verfügbar, zählt aber nicht zum Notgroschen.'
	);
</script>

<form
	method="post"
	action={asset ? '?/updateAsset' : '?/createAsset'}
	use:enhance={submit(!asset)}
	oninput={() => (dirty = true)}
	class="space-y-4"
>
	{#if asset}<input type="hidden" name="id" value={asset.id} />{/if}

	<div>
		<label class="label" for="asset-name">Name</label>
		<input id="asset-name" name="name" class="field" value={asset?.name ?? ''} required autocomplete="off" placeholder="z. B. Sparkonto" />
	</div>

	<div>
		<label class="label" for="asset-type">Art</label>
		<select id="asset-type" name="type" class="field" bind:value={type}>
			{#each ASSET_TYPES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
		</select>
		<p class="mt-2 text-[0.8125rem] text-ink-2">{typeHint}</p>
	</div>

	<div>
		<label class="label" for="asset-provider">Wo liegt das Geld?</label>
		<input
			id="asset-provider"
			name="provider"
			class="field"
			list="asset-providers"
			value={asset?.provider ?? ''}
			autocomplete="off"
			placeholder="z. B. Kantonalbank, VIAC, Swissquote"
		/>
		<datalist id="asset-providers">
			{#each providers as p (p)}<option value={p}></option>{/each}
		</datalist>
	</div>

	<div>
		<label class="label" for="asset-note">Notiz zu den Positionen</label>
		<input id="asset-note" name="note" class="field" value={asset?.note ?? ''} maxlength="500" autocomplete="off" placeholder="z. B. Global ETF, Gold ETF" />
	</div>

	{#if !asset}
		<div class="border-t border-rule pt-4">
			<AmountFields variant="asset" idPrefix="new-asset" />
		</div>
		<MonthField name="from" id="asset-from" label="Saldo per" bind:value={from} />
	{/if}

	{#if error}<p class="text-[0.875rem] text-critical" role="alert">{error}</p>{/if}

	<div class="flex justify-end gap-2 pt-1">
		{#if !asset}<button type="button" class="btn btn-ghost" onclick={onclose}>Abbrechen</button>{/if}
		<button class="btn btn-primary" disabled={!!asset && !dirty}>{asset ? 'Änderungen speichern' : 'Anlage erfassen'}</button>
	</div>
</form>

{#if asset}
	{#if feeds.length}
		<p class="mt-6 text-[0.875rem] text-ink-2">
			Gespeist von
			{#each feeds as f, i (f.item.id)}{i > 0 ? (i === feeds.length - 1 ? ' und ' : ', ') : ''}{f.item.name}
				<span class="num">({f.monthly > 0 ? `${chf(f.monthly)} Franken im Monat` : 'zurzeit nichts'})</span>{/each}.
			Beim Check-in bestätigst du, wie viel wirklich eingezahlt wurde.
		</p>
	{:else if asset.type !== 'account' && asset.type !== 'pension'}
		<p class="mt-6 text-[0.875rem] text-ink-3">
			Zahlst du regelmässig ein? Wähle beim Sparposten unter <a href="/posten" class="underline">Posten</a> diese
			Anlage aus. Dann zeigt der Check-in, wie viel der Markt dazu beigetragen hat.
		</p>
	{/if}

	<div class="mt-8">
		<VersionEditor variant="asset" ownerId={asset.id} versions={asset.versions} />
	</div>

	<form
		method="post"
		action="?/deleteAsset"
		class="mt-10 border-t border-rule pt-4"
		use:enhance={({ cancel }) => {
			if (!confirm(`«${asset.name}» mit dem ganzen Verlauf löschen? Wenn du das Konto nur aufgelöst hast, löse es stattdessen auf.`)) cancel();
			return async ({ update }) => {
				await update();
				onclose();
			};
		}}
	>
		<input type="hidden" name="id" value={asset.id} />
		<button class="btn btn-danger -ml-3">Anlage löschen</button>
	</form>
{/if}
