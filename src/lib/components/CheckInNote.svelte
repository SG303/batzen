<script lang="ts">
	import { enhance } from '$app/forms';
	import Pencil from '@lucide/svelte/icons/pencil';
	import type { CheckIn } from '#lib/domain.ts';

	/** The general note of a check-in, editable in place. */
	let { checkIn, back }: { checkIn: CheckIn; back: string } = $props();

	let editing = $state(false);
	const completed = $derived(
		new Date(checkIn.completedAt).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })
	);
</script>

<div class="rounded-2xl bg-sunken px-5 py-4">
	<div class="flex items-baseline justify-between gap-4">
		<h2 class="text-[0.875rem] text-ink-2">Notiz, erfasst am {completed}</h2>
		{#if !editing}
			<button
				type="button"
				class="-my-1 grid size-8 flex-none place-items-center rounded-full text-ink-3 hover:bg-surface hover:text-ink"
				aria-label="Notiz bearbeiten"
				onclick={() => (editing = true)}
			>
				<Pencil size={15} />
			</button>
		{/if}
	</div>

	{#if editing}
		<form
			method="post"
			action="/check-in?/updateNote"
			class="mt-2"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					editing = false;
				}}
		>
			<input type="hidden" name="id" value={checkIn.id} />
			<textarea
				name="note"
				rows="3"
				maxlength="2000"
				class="field h-auto! py-2.5 leading-relaxed"
				placeholder="Zum Beispiel: Franchise Krankenkasse auf 300 gesenkt."
				value={checkIn.note ?? ''}
			></textarea>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
				<button
					formaction="/check-in?/delete"
					class="btn btn-danger -ml-3"
					onclick={(e) => {
						if (!confirm('Check-in mit Snapshot und Notiz löschen? Die erfassten Beträge bleiben erhalten.')) e.preventDefault();
					}}
				>
					Check-in löschen
				</button>
				<input type="hidden" name="back" value={back} />
				<div class="flex gap-2">
					<button type="button" class="btn btn-ghost" onclick={() => (editing = false)}>Abbrechen</button>
					<button class="btn btn-primary">Speichern</button>
				</div>
			</div>
		</form>
	{:else}
		<p class="mt-1 max-w-[65ch] whitespace-pre-line {checkIn.note ? '' : 'text-ink-3'}">
			{checkIn.note ?? 'Keine Notiz.'}
		</p>
	{/if}
</div>
