<script lang="ts">
	import { dueMonthsOfYear, INTERVALS, MONTH_NAMES, perYear, type Interval } from '#lib/domain.ts';
	import { chf, parseChf, toInput } from '#lib/money.ts';
	import { untrack } from 'svelte';

	/**
	 * Amount, interval and either the own share and due month (costs) or the 13th salary (income).
	 * For assets only the balance is asked; it is posted as `amount` like the other variants.
	 */
	let {
		variant,
		amount = 0,
		interval = 'monthly',
		share = 100,
		thirteenth = false,
		dueMonth = null,
		idPrefix,
		dueMonths = true,
		oninterval
	}: {
		variant: 'item' | 'income' | 'asset';
		amount?: number;
		interval?: Interval;
		share?: number;
		thirteenth?: boolean;
		dueMonth?: number | null;
		idPrefix: string;
		/** Ask for the due month of costs that are not monthly */
		dueMonths?: boolean;
		/** Called with the chosen interval, also initially */
		oninterval?: (interval: Interval) => void;
	} = $props();

	let amountText = $state(untrack(() => (amount ? toInput(amount) : '')));
	let intervalValue = $state<Interval>(untrack(() => interval));
	let shared = $state(untrack(() => share < 100));
	let shareValue = $state(untrack(() => (share < 100 ? share : 50)));
	let thirteenthValue = $state(untrack(() => thirteenth));
	let dueValue = $state(untrack(() => (dueMonth ? String(dueMonth) : '')));

	$effect(() => oninterval?.(intervalValue));

	/** All months the bill falls due, shown when there is more than one */
	const dueHint = $derived.by(() => {
		const months = dueMonthsOfYear({ interval: intervalValue, dueMonth: dueValue ? Number(dueValue) : null });
		if (months.length < 2) return null;
		const names = months.map((m) => MONTH_NAMES[m - 1]);
		return `Also im ${names.slice(0, -1).join(', ')} und ${names.at(-1)}.`;
	});

	const intervals = $derived(
		variant === 'income' ? INTERVALS.filter((i) => i.value === 'monthly' || i.value === 'yearly') : INTERVALS
	);

	const preview = $derived.by(() => {
		const a = parseChf(amountText);
		if (a === null) return null;
		const factor =
			variant === 'income' && intervalValue === 'monthly' && thirteenthValue ? 13 : perYear(intervalValue);
		const monthly = (a * factor) / 12;
		return variant === 'item' && shared ? (monthly * shareValue) / 100 : monthly;
	});
</script>

<div class={variant === 'asset' ? '' : 'grid grid-cols-[1fr_1fr] gap-3'}>
	<div>
		<label class="label" for="{idPrefix}-amount">{variant === 'asset' ? 'Saldo in CHF' : 'Betrag in CHF'}</label>
		<input
			id="{idPrefix}-amount"
			name="amount"
			class="field num"
			inputmode="decimal"
			autocomplete="off"
			placeholder="0.00"
			bind:value={amountText}
			required
		/>
	</div>
	{#if variant !== 'asset'}
		<div>
			<label class="label" for="{idPrefix}-interval">Wie oft</label>
			<select id="{idPrefix}-interval" name="interval" class="field" bind:value={intervalValue}>
				{#each intervals as i (i.value)}<option value={i.value}>{i.label}</option>{/each}
			</select>
		</div>
	{/if}
</div>

{#if variant === 'item' && dueMonths && intervalValue !== 'monthly'}
	<div class="mt-4">
		<label class="label" for="{idPrefix}-due">Fällig im</label>
		<select id="{idPrefix}-due" name="dueMonth" class="field" bind:value={dueValue}>
			<option value="">Keine Angabe</option>
			{#each MONTH_NAMES as name, i (name)}<option value={String(i + 1)}>{name}</option>{/each}
		</select>
		<p class="mt-2 text-[0.8125rem] text-ink-2">
			{dueValue ? (dueHint ?? 'Dann erscheint die Rechnung im Kalender in der Übersicht.') : 'Freiwillig. Mit dem Monat erscheint die Rechnung im Kalender in der Übersicht.'}
		</p>
	</div>
{/if}

{#if variant === 'asset'}
	<!-- Only the balance -->
{:else if variant === 'item'}
	<div class="mt-4">
		<label class="flex items-center gap-3 text-[0.9375rem]">
			<input type="checkbox" bind:checked={shared} class="size-[1.125rem] accent-[var(--accent)]" />
			Geteilte Kosten
		</label>
		<input type="hidden" name="share" value={shared ? shareValue : 100} />
		{#if shared}
			<div class="mt-3 flex items-center gap-4">
				<input
					type="range"
					min="5"
					max="95"
					step="5"
					bind:value={shareValue}
					class="flex-1 accent-[var(--accent)]"
					aria-label="Mein Anteil in Prozent"
				/>
				<span class="num w-24 text-right text-[0.9375rem]">Ich {shareValue} %</span>
			</div>
		{/if}
	</div>
{:else if intervalValue === 'monthly'}
	<label class="mt-4 flex items-center gap-3 text-[0.9375rem]">
		<input type="checkbox" name="thirteenth" bind:checked={thirteenthValue} class="size-[1.125rem] accent-[var(--accent)]" />
		Mit 13. Monatslohn
	</label>
{/if}

{#if variant !== 'asset' && preview !== null}
	<p class="mt-3 text-[0.875rem] text-ink-2">
		Entspricht {chf(preview)} Franken im Monat{variant === 'item' && shared ? ' für dich' : ''}.
	</p>
{/if}
