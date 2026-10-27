<script lang="ts">
	import { monthLabel } from '#lib/domain.ts';
	import { chf, chfDelta, parseChf, toInput } from '#lib/money.ts';
	import { onMount, untrack } from 'svelte';

	/**
	 * Asks how much was paid into an asset since the previous check-in. Prefilled with the budget
	 * estimate, which is often wrong for yearly or irregular payments.
	 */
	let {
		since,
		planned,
		change,
		amount,
		onconfirm
	}: {
		/** Month of the previous check-in */
		since: string;
		/** Contributions according to the budget */
		planned: number;
		/** Balance change since the previous check-in */
		change: number;
		/** Amount confirmed earlier in this check-in, if going back */
		amount?: number;
		onconfirm: (amount: number) => void;
	} = $props();

	let text = $state(untrack(() => toInput(amount ?? planned)));
	let input = $state<HTMLInputElement | null>(null);
	const paid = $derived(parseChf(text));

	onMount(() => input?.select());

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (paid !== null) onconfirm(paid);
	}
</script>

<p class="mt-3 text-[1.0625rem] text-ink-2">
	Wie viel hast du seit dem Check-in im {monthLabel(since)} eingezahlt?
</p>

<form class="mt-8 rounded-2xl bg-surface p-5 ring-1 ring-rule" onsubmit={submit}>
	<label class="label" for="ci-paid">Eingezahlt in CHF</label>
	<input
		id="ci-paid"
		class="field num"
		inputmode="decimal"
		autocomplete="off"
		placeholder="0.00"
		required
		bind:this={input}
		bind:value={text}
	/>
	<p class="mt-2 text-[0.8125rem] text-ink-2">
		Laut Budget wären es ca. {chf(planned)} Franken. Trag ein, was du wirklich eingezahlt hast, auch wenn
		es 0 ist.
	</p>
	{#if paid !== null}
		<p class="num mt-4 border-t border-rule pt-3 text-[0.9375rem]">
			Saldo {chfDelta(change)}, davon Markt <span class="font-medium">{chfDelta(change - paid)}</span>
		</p>
	{/if}
	<div class="mt-5 flex justify-end">
		<button class="btn btn-primary" disabled={paid === null}>Weiter</button>
	</div>
</form>
