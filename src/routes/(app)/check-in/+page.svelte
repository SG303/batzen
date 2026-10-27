<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import {
		ASSET_TYPES,
		assetPerformance,
		checkInReminder,
		contributionPrompts,
		currentMonth,
		dueLabel,
		intervalLabel,
		lastVersionUpTo,
		monthLabel,
		monthsAgoLabel,
		normalizeDueMonth,
		perYear,
		versionAt,
		type Interval
	} from '#lib/domain.ts';
	import { catColor } from '#lib/categories.ts';
	import { chf, chfExact, parseChf } from '#lib/money.ts';
	import AmountFields from '#lib/components/AmountFields.svelte';
	import ContributionStep from '#lib/components/ContributionStep.svelte';
	import MonthField from '#lib/components/MonthField.svelte';
	import PerformanceList from '#lib/components/PerformanceList.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const budget = $derived(data.data);
	const reminder = $derived(checkInReminder(budget.checkIns, currentMonth()));

	type Decision =
		| { action: 'keep' }
		| { action: 'skip' }
		| { action: 'end' }
		| { action: 'update'; amount: number; interval: Interval; share: number; thirteenth: boolean; dueMonth: number | null }
		| { action: 'paid'; amount: number };

	type Entry = {
		key: string;
		/** `contribution`: money paid into the asset `id` since the previous check-in */
		target: 'item' | 'income' | 'asset' | 'contribution';
		id: number;
		name: string;
		group: string;
		color: string | null;
		current: { amount: number; interval: Interval; share: number; thirteenth: boolean; dueMonth: number | null } | null;
		variable: boolean;
		/** Assets: month of the balance shown, and where the money is */
		since?: string;
		detail?: string | null;
		/** Contributions: previous check-in month, balance then and planned amount */
		prompt?: { since: string; before: number; planned: number };
	};

	let step = $state<'start' | 'run' | 'done'>('start');
	let asOf = $state(currentMonth());
	let index = $state(0);
	let decisions = $state<Record<string, Decision>>({});
	let editing = $state(false);
	let note = $state('');
	let primary = $state<HTMLButtonElement | null>(null);

	const entries = $derived.by((): Entry[] => {
		const cats = [...budget.categories].sort((a, b) => a.sort - b.sort);
		const items = cats.flatMap((c) =>
			budget.items
				.filter((i) => i.categoryId === c.id)
				.sort((a, b) => a.name.localeCompare(b.name, 'de'))
				.map((i): Entry => {
					const v = versionAt(i.versions, asOf);
					return {
						key: `item-${i.id}`,
						target: 'item',
						id: i.id,
						name: i.name,
						group: c.name,
						color: catColor(c.color),
						variable: i.kind === 'variable',
						current: v
							? { amount: v.amount, interval: v.interval, share: v.share, thirteenth: false, dueMonth: v.dueMonth }
							: null
					};
				})
		);
		const incomes = budget.incomes.map((s): Entry => {
			const v = versionAt(s.versions, asOf);
			return {
				key: `income-${s.id}`,
				target: 'income',
				id: s.id,
				name: s.name,
				group: 'Einkommen',
				color: null,
				variable: false,
				current: v ? { amount: v.amount, interval: v.interval, share: 100, thirteenth: v.thirteenth, dueMonth: null } : null
			};
		});
		// The "Vermögen" step comes last. Closed assets are left out. Assets fed by a saving item
		// are followed by the question how much was paid in.
		const prompts = contributionPrompts(budget, asOf);
		const assets = ASSET_TYPES.flatMap((t) =>
			budget.assets
				.filter((a) => a.type === t.value && !lastVersionUpTo(a.versions, asOf)?.ended)
				.sort((a, b) => a.name.localeCompare(b.name, 'de'))
				.flatMap((a): Entry[] => {
					const v = versionAt(a.versions, asOf);
					const entry: Entry = {
						key: `asset-${a.id}`,
						target: 'asset',
						id: a.id,
						name: a.name,
						group: `Vermögen, ${t.label}`,
						color: null,
						variable: false,
						current: v ? { amount: v.balance, interval: 'monthly', share: 100, thirteenth: false, dueMonth: null } : null,
						since: v?.from,
						detail: a.provider
					};
					const prompt = prompts.find((p) => p.assetId === a.id);
					if (!prompt) return [entry];
					return [entry, { ...entry, key: `contribution-${a.id}`, target: 'contribution', prompt }];
				})
		);
		return [...incomes, ...items, ...assets];
	});

	const entry = $derived(entries[index]);
	const history = $derived(
		[...budget.checkIns].sort((a, b) => b.asOf.localeCompare(a.asOf) || b.id - a.id)
	);
	const isPast = $derived(asOf < currentMonth());

	async function focusPrimary() {
		await tick();
		primary?.focus();
	}

	/** No contributions are asked for an asset closed in this check-in. */
	const skipped = (e: Entry) => e.target === 'contribution' && decisions[`asset-${e.id}`]?.action === 'end';

	function decide(d: Decision) {
		decisions[entry.key] = d;
		editing = false;
		let next = index + 1;
		while (next < entries.length && skipped(entries[next])) next++;
		if (next < entries.length) {
			index = next;
			focusPrimary();
		} else step = 'done';
	}

	function back() {
		editing = false;
		if (step === 'done') {
			step = 'run';
			return;
		}
		let prev = index - 1;
		while (prev >= 0 && skipped(entries[prev])) prev--;
		if (prev >= 0) index = prev;
		else step = 'start';
	}

	/** The balance of an asset after this check-in. */
	function balanceAfter(e: Entry): number {
		const d = decisions[`asset-${e.id}`];
		return d?.action === 'update' ? d.amount : (e.current?.amount ?? 0);
	}

	function applyEdit(e: SubmitEvent) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget as HTMLFormElement);
		const amount = parseChf(String(fd.get('amount') ?? ''));
		if (amount === null) return;
		const interval = String(fd.get('interval')) as Interval;
		decide({
			action: 'update',
			amount,
			interval,
			share: Number(fd.get('share') ?? 100),
			thirteenth: fd.get('thirteenth') === 'on',
			dueMonth: normalizeDueMonth(interval, fd.get('dueMonth'))
		});
	}

	function describe(c: NonNullable<Entry['current']>, target: Entry['target']) {
		if (target === 'asset') return `Saldo ${chfExact(c.amount)}`;
		let text = `${chfExact(c.amount)} ${intervalLabel(c.interval)}`;
		const due = target === 'item' ? dueLabel(c) : null;
		if (due) text += `, ${due}`;
		if (target === 'item' && c.share < 100) text += `, dein Anteil ${c.share} %`;
		if (target === 'income' && c.thirteenth) text += ', 13 Mal';
		return text;
	}

	const changes = $derived(
		entries
			.map((e) => ({ e, d: decisions[e.key] }))
			.filter(({ d }) => d && (d.action === 'update' || d.action === 'end'))
	);
	const paidIn = $derived(
		entries.flatMap((e) => {
			const d = decisions[e.key];
			return d?.action === 'paid' && !skipped(e) ? [{ e, amount: d.amount }] : [];
		})
	);
	const performance = $derived(
		paidIn.map(({ e, amount }) => assetPerformance(e, e.prompt!.before, balanceAfter(e), amount))
	);
	const contributionsPayload = $derived(JSON.stringify(paidIn.map(({ e, amount }) => ({ id: e.id, amount }))));
	const payload = $derived(
		JSON.stringify(
			changes.map(({ e, d }) =>
				d!.action === 'end'
					? { target: e.target, id: e.id, action: 'end' }
					: { target: e.target, id: e.id, ...d }
			)
		)
	);

	const endedLabel = { item: 'gekündigt', income: 'beendet', asset: 'aufgelöst', contribution: '' };

	/** Change per month for costs and incomes, change of the balance for assets. */
	const delta = (e: Entry, d: Decision) => {
		if (e.target === 'asset') {
			const after = d.action === 'end' ? 0 : d.action === 'update' ? d.amount : (e.current?.amount ?? 0);
			return after - (e.current?.amount ?? 0);
		}
		return monthlyDelta(e, d);
	};

	const monthlyDelta = (e: Entry, d: Decision) => {
		const m = (c: NonNullable<Entry['current']> | null) => {
			if (!c) return 0;
			const factor = e.target === 'income' && c.interval === 'monthly' && c.thirteenth ? 13 : perYear(c.interval);
			return ((c.amount * factor) / 12) * (e.target === 'item' ? c.share / 100 : 1);
		};
		const after = d.action === 'end' ? 0 : d.action === 'update' ? m(d) : m(e.current);
		return after - m(e.current);
	};
</script>

<svelte:head><title>Check-in · Batzen</title></svelte:head>

{#if step === 'start'}
	<section class="max-w-[38rem] pt-12 sm:pt-20">
		<h1 class="text-[2.25rem] leading-[1.1] font-medium tracking-[-0.03em] sm:text-[3rem]">Check-in</h1>
		{#if reminder.last}
			<p class="mt-3 text-[0.9375rem] {reminder.due ? 'text-accent' : 'text-ink-3'}">
				Dein letzter Check-in war {monthsAgoLabel(reminder.monthsAgo!)}, im {monthLabel(reminder.last.asOf)}.
			</p>
		{/if}
		<p class="mt-4 text-[1.0625rem] text-ink-2">
			Geh deine Posten und Konten einmal durch und bestätige oder korrigiere die Beträge und Salden.
			Das dauert ein paar Minuten. Alles, was du änderst, gilt ab dem gewählten Monat.
		</p>
		<div class="mt-10 max-w-sm">
			<MonthField name="asOf" id="asof" label="Stand per" bind:value={asOf} />
			<p class="mt-2 text-[0.8125rem] text-ink-3">
				Wähle einen früheren Monat, um vergangene Jahre nachzuerfassen, zum Beispiel Januar 2021.
			</p>
		</div>
		<button
			class="btn btn-primary mt-8"
			onclick={() => {
				step = 'run';
				index = 0;
				decisions = {};
				focusPrimary();
			}}
			disabled={entries.length === 0}
		>
			{entries.length} Einträge durchgehen
		</button>
		{#if entries.length === 0}
			<p class="mt-4 text-ink-2">Erfasse zuerst ein paar <a href="/posten" class="underline">Posten</a>.</p>
		{/if}
	</section>

	{#if history.length}
		<section class="mt-20 max-w-[44rem]" aria-labelledby="history">
			<h2 id="history" class="text-[1.375rem] font-medium tracking-[-0.015em]">Bisherige Check-ins</h2>
			<ol class="mt-5 border-t border-rule">
				{#each history as c (c.id)}
					<li>
						<a
							href="/?jahr={c.asOf.slice(0, 4)}&stand={c.id}"
							class="grid gap-x-6 gap-y-0.5 border-b border-rule py-3.5 transition-colors hover:bg-sunken/60 sm:grid-cols-[10rem_1fr] sm:px-2"
						>
							<span class="font-medium">{monthLabel(c.asOf)}</span>
							<span class="text-[0.9375rem] {c.note ? 'text-ink-2' : 'text-ink-3'}">{c.note ?? 'Keine Notiz'}</span>
						</a>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
{:else if step === 'run' && entry}
	<section class="mx-auto max-w-[36rem] pt-8 sm:pt-14" aria-live="polite">
		<div class="flex items-center gap-3">
			<button class="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink" onclick={back} aria-label="Zurück">
				<ArrowLeft size={18} />
			</button>
			<div class="h-[3px] flex-1 overflow-hidden rounded-full bg-sunken">
				<div class="h-full rounded-full bg-accent transition-[width] duration-300" style="width: {((index + 1) / entries.length) * 100}%"></div>
			</div>
			<span class="num text-[0.8125rem] text-ink-2">{index + 1} von {entries.length}</span>
		</div>

		<p class="mt-12 flex items-center gap-2 text-[0.875rem] text-ink-2">
			{#if entry.color}<span class="swatch" style="background: {entry.color}"></span>{/if}
			{entry.group}, Stand {monthLabel(asOf)}
		</p>
		<h1 class="mt-2 text-[2rem] leading-[1.15] font-medium tracking-[-0.025em] sm:text-[2.5rem]">{entry.name}</h1>
		{#if entry.target === 'contribution'}
			{@const d = decisions[entry.key]}
			{@const prompt = entry.prompt!}
			{#key entry.key}
				<ContributionStep
					since={prompt.since}
					planned={prompt.planned}
					change={balanceAfter(entry) - prompt.before}
					amount={d?.action === 'paid' ? d.amount : undefined}
					onconfirm={(amount) => decide({ action: 'paid', amount })}
				/>
			{/key}
		{:else}
			<p class="num mt-3 text-[1.0625rem] text-ink-2">
				{#if entry.current}
					{entry.variable ? 'Geschätzt ' : ''}{describe(entry.current, entry.target)}
					{#if entry.target === 'asset' && entry.since}
						<span class="text-ink-3">{entry.since === asOf ? 'diesen Monat erfasst' : `von ${monthLabel(entry.since)}`}</span>
					{/if}
				{:else}
					Für diesen Monat ist {entry.target === 'asset' ? 'kein Saldo' : 'kein Betrag'} erfasst.
				{/if}
			</p>
			{#if entry.detail}<p class="mt-1 text-[0.9375rem] text-ink-3">{entry.detail}</p>{/if}

			{#if editing}
				{#key entry.key}
					<form class="mt-8 rounded-2xl bg-surface p-5 ring-1 ring-rule" onsubmit={applyEdit}>
						<AmountFields
							variant={entry.target}
							idPrefix="ci"
							amount={entry.current?.amount ?? 0}
							interval={entry.current?.interval}
							share={entry.current?.share ?? 100}
							thirteenth={entry.current?.thirteenth ?? false}
							dueMonth={entry.current?.dueMonth ?? null}
						/>
						<div class="mt-5 flex justify-end gap-2">
							<button type="button" class="btn btn-ghost" onclick={() => (editing = false)}>Abbrechen</button>
							<button class="btn btn-primary">Übernehmen</button>
						</div>
					</form>
				{/key}
			{:else}
				<div class="mt-10 flex flex-wrap gap-3">
					{#if entry.current}
						<button bind:this={primary} class="btn btn-primary" onclick={() => decide({ action: 'keep' })}>Stimmt so</button>
						<button class="btn btn-quiet" onclick={() => (editing = true)}>
							{entry.target === 'asset' ? 'Neuer Saldo' : 'Anderer Betrag'}
						</button>
						<button class="btn btn-ghost" onclick={() => decide({ action: 'end' })}>
							{{ item: 'Gekündigt', income: 'Beendet', asset: 'Aufgelöst' }[entry.target]}
						</button>
					{:else}
						<button bind:this={primary} class="btn btn-quiet" onclick={() => (editing = true)}>
							{entry.target === 'asset' ? 'Saldo eintragen' : 'Betrag eintragen'}
						</button>
						<button class="btn btn-ghost" onclick={() => decide({ action: 'skip' })}>
							{isPast ? 'Gab es damals nicht' : 'Überspringen'}
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	</section>
{:else if step === 'done'}
	<section class="mx-auto max-w-[36rem] pt-12 sm:pt-20">
		<button class="btn btn-ghost -ml-3" onclick={back}><ArrowLeft size={16} /> Zurück</button>
		<h1 class="mt-6 text-[2rem] leading-[1.15] font-medium tracking-[-0.025em] sm:text-[2.5rem]">
			{changes.length === 0 ? 'Alles stimmt.' : `${changes.length} ${changes.length === 1 ? 'Änderung' : 'Änderungen'} ab ${monthLabel(asOf)}`}
		</h1>
		{#if changes.length}
			<ul class="mt-8 border-t border-rule">
				{#each changes as { e, d } (e.key)}
					{@const change = delta(e, d!)}
					<li class="flex items-baseline justify-between gap-4 border-b border-rule py-3">
						<span class="min-w-0">
							<span class="block truncate">{e.name}</span>
							<span class="block text-[0.8125rem] text-ink-3">
								{d!.action === 'end' ? endedLabel[e.target] : describe(d as Extract<Decision, { action: 'update' }>, e.target)}
							</span>
						</span>
						<span class="num whitespace-nowrap text-ink-2">
							{change >= 0 ? '+' : '−'}{chf(Math.abs(change))}{e.target === 'asset' ? '' : ' im Monat'}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if performance.length}
			<h2 class="mt-12 mb-3 text-[1.125rem] font-medium tracking-[-0.01em]">
				Seit dem Check-in im {monthLabel(paidIn[0].e.prompt!.since)}
			</h2>
			<PerformanceList rows={performance} />
		{/if}
		<p class="mt-6 text-[0.9375rem] text-ink-2">
			Fehlt ein Posten? Neue Posten erfasst du unter <a href="/posten" class="underline">Posten</a>.
		</p>
		{#if form?.error}<p class="mt-4 text-critical" role="alert">{form.error}</p>{/if}
		<form method="post" action="?/apply" use:enhance class="mt-8">
			<input type="hidden" name="asOf" value={asOf} />
			<input type="hidden" name="changes" value={payload} />
			<input type="hidden" name="contributions" value={contributionsPayload} />
			<label class="label" for="note">Notiz zu diesem Check-in</label>
			<textarea
				id="note"
				name="note"
				rows="3"
				maxlength="2000"
				class="field h-auto! py-2.5 leading-relaxed"
				placeholder="Zum Beispiel: Franchise Krankenkasse auf 300 gesenkt, deshalb höhere Prämie."
				bind:value={note}
			></textarea>
			<p class="mt-1.5 mb-6 text-[0.8125rem] text-ink-3">
				Mit dem Check-in wird ein Snapshot gespeichert. Du findest ihn in der Übersicht beim Jahr {asOf.slice(0, 4)}.
			</p>
			<button class="btn btn-primary">Check-in abschliessen</button>
		</form>
	</section>
{/if}
