<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Konto einrichten · Batzen</title></svelte:head>

<AuthShell
	theme={data.theme}
	title="Konto einrichten"
	intro="Damit meldest du dich künftig an. Deine bisherigen Einträge bleiben erhalten."
>
	<form
		method="post"
		class="space-y-5"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				await update();
				pending = false;
			};
		}}
	>
		<div>
			<label class="label" for="username">Benutzername</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="username"
				name="username"
				class="field"
				value={form?.username ?? ''}
				autocomplete="username"
				autocapitalize="none"
				spellcheck="false"
				required
				autofocus
			/>
		</div>
		<div>
			<label class="label" for="password">Passwort</label>
			<input
				id="password"
				name="password"
				type="password"
				class="field"
				autocomplete="new-password"
				minlength="10"
				aria-describedby="password-hint"
				required
			/>
			<p id="password-hint" class="mt-1.5 text-[0.8125rem] text-ink-3">Mindestens 10 Zeichen.</p>
		</div>
		<div>
			<label class="label" for="repeat">Passwort wiederholen</label>
			<input id="repeat" name="repeat" type="password" class="field" autocomplete="new-password" required />
		</div>

		{#if form?.error}
			<p class="text-[0.9375rem] text-critical" role="alert">{form.error}</p>
		{/if}

		<button class="btn btn-primary w-full" disabled={pending}>Konto erstellen</button>
	</form>
</AuthShell>
