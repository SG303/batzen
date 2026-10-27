<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Anmelden · Batzen</title></svelte:head>

<AuthShell theme={data.theme} title="Batzen" intro="Melde dich an, um deine Zahlen zu sehen.">
	<form
		method="post"
		class="space-y-5"
		use:enhance={() => {
			pending = true;
			return async ({ result, update }) => {
				await update();
				pending = false;
				if (result.type === 'failure') {
					// A wrong password is retyped from scratch.
					const field = document.getElementById('password') as HTMLInputElement;
					field.value = '';
					field.focus();
				}
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
				autofocus={!form?.username}
			/>
		</div>
		<div>
			<label class="label" for="password">Passwort</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="password"
				name="password"
				type="password"
				class="field"
				autocomplete="current-password"
				required
				autofocus={!!form?.username}
			/>
		</div>

		{#if form?.error}
			<p class="text-[0.9375rem] text-critical" role="alert">{form.error}</p>
		{/if}

		<button class="btn btn-primary w-full" disabled={pending}>Anmelden</button>
	</form>
</AuthShell>
