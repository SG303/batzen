<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import ArrowUp from '@lucide/svelte/icons/chevron-up';
	import ArrowDown from '@lucide/svelte/icons/chevron-down';
	import Trash from '@lucide/svelte/icons/trash-2';
	import LogOut from '@lucide/svelte/icons/log-out';
	import FileUp from '@lucide/svelte/icons/file-up';
	import Segmented from '#lib/components/Segmented.svelte';
	import { applyTheme, type Theme } from '#lib/theme.ts';
	import { catColor, PALETTE_SIZE } from '#lib/categories.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let theme = $state<Theme>(untrack(() => data.theme));
	$effect(() => applyTheme(theme));

	const categories = $derived(data.data.categories);
	const itemCount = (id: number) => data.data.items.filter((i) => i.categoryId === id).length;

	let newColor = $state(1);
	let confirmReset = $state('');
	let restoreFile = $state<File | null>(null);
	/** User whose deletion is being confirmed with the own password; stays open after a wrong one. */
	let deleting = $state<number | null>(null);
	/** User whose deletion failed with the last post */
	const failedDelete = $derived(form && 'deleting' in form ? Number(form.deleting) : null);
	$effect(() => {
		if (failedDelete) deleting = failedDelete;
	});

	/** Focuses the password field of the delete confirmation once it is shown. */
	const autofocus = (node: HTMLInputElement) => node.focus();

	const date = (iso: string) =>
		new Date(iso).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });
	const time = (iso: string) => new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

	const backup = $derived(data.backup);
	/** A nightly backup older than two days means something stopped working. */
	const backupStale = $derived(
		backup.latest !== null && Date.now() - new Date(backup.latest.at).getTime() > 2 * 24 * 60 * 60 * 1000
	);
</script>

<svelte:head><title>Einstellungen · Batzen</title></svelte:head>

<h1 class="pt-10 text-[2rem] font-medium tracking-[-0.025em] sm:pt-14 sm:text-[2.5rem]">Einstellungen</h1>

<section class="mt-12 grid gap-4 border-t border-rule pt-6 md:grid-cols-[14rem_1fr]">
	<div>
		<h2 class="font-medium">Darstellung</h2>
		<p class="mt-1 text-[0.875rem] text-ink-2">System folgt der Einstellung deines Geräts.</p>
	</div>
	<div>
		<Segmented
			label="Design"
			options={[
				{ value: 'light', label: 'Hell' },
				{ value: 'dark', label: 'Dunkel' },
				{ value: 'system', label: 'System' }
			]}
			bind:value={theme}
		/>
	</div>
</section>

<section class="mt-12 grid gap-4 border-t border-rule pt-6 md:grid-cols-[14rem_1fr]">
	<div>
		<h2 class="font-medium">Kategorien</h2>
		<p class="mt-1 text-[0.875rem] text-ink-2">
			Die Reihenfolge bestimmt die Anordnung im Einkommensband.
		</p>
	</div>
	<div>
		{#if form?.category}
			<p class="mb-4 text-[0.9375rem] text-critical" role="alert">{form.category}</p>
		{/if}
		<ul class="border-t border-rule">
			{#each categories as c, i (c.id)}
				<li class="flex flex-wrap items-center gap-2 border-b border-rule py-2.5">
					<form method="post" action="?/saveCategory" use:enhance={() => ({ update }) => update({ reset: false })} class="flex min-w-0 flex-1 items-center gap-3">
						<input type="hidden" name="id" value={c.id} />
						<details class="relative">
							<summary class="grid size-8 list-none place-items-center rounded-full hover:bg-sunken" aria-label="Farbe wählen">
								<span class="swatch size-3.5!" style="background: {catColor(c.color)}"></span>
							</summary>
							<div class="absolute top-full left-0 z-10 mt-1 grid grid-cols-4 gap-1 rounded-xl border border-rule bg-surface p-2 shadow-lg">
								{#each Array.from({ length: PALETTE_SIZE }, (_, k) => k + 1) as slot (slot)}
									<button name="color" value={slot} class="grid size-8 place-items-center rounded-full hover:bg-sunken {slot === c.color ? 'bg-sunken' : ''}" aria-label="Farbe {slot}">
										<span class="swatch size-4!" style="background: {catColor(slot)}"></span>
									</button>
								{/each}
							</div>
						</details>
						<input type="hidden" name="color" value={c.color} />
						<input
							name="name"
							value={c.name}
							class="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 hover:bg-sunken focus:bg-surface focus:outline-2 focus:outline-accent"
							aria-label="Name der Kategorie"
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						/>
					</form>
					<span class="text-[0.8125rem] text-ink-3">{itemCount(c.id)} Posten</span>
					<form method="post" action="?/moveCategory" use:enhance class="flex">
						<input type="hidden" name="id" value={c.id} />
						<button name="direction" value="up" class="btn-ghost grid size-8 place-items-center rounded-full" disabled={i === 0} aria-label="Nach oben"><ArrowUp size={16} /></button>
						<button name="direction" value="down" class="btn-ghost grid size-8 place-items-center rounded-full" disabled={i === categories.length - 1} aria-label="Nach unten"><ArrowDown size={16} /></button>
					</form>
					<form method="post" action="?/deleteCategory" use:enhance>
						<input type="hidden" name="id" value={c.id} />
						<button class="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-critical" aria-label="Kategorie löschen"><Trash size={15} /></button>
					</form>
				</li>
			{/each}
		</ul>
		<form method="post" action="?/saveCategory" use:enhance class="mt-4 flex flex-wrap items-center gap-3">
			<input type="hidden" name="color" value={newColor} />
			<div class="flex gap-1" role="radiogroup" aria-label="Farbe">
				{#each Array.from({ length: PALETTE_SIZE }, (_, k) => k + 1) as slot (slot)}
					<button type="button" role="radio" aria-checked={newColor === slot} aria-label="Farbe {slot}" onclick={() => (newColor = slot)} class="grid size-7 place-items-center rounded-full {newColor === slot ? 'ring-2 ring-ink-3' : ''}">
						<span class="swatch size-3.5!" style="background: {catColor(slot)}"></span>
					</button>
				{/each}
			</div>
			<input name="name" placeholder="Neue Kategorie" class="field max-w-64" required />
			<button class="btn btn-quiet">Hinzufügen</button>
		</form>
	</div>
</section>

<section class="mt-12 grid gap-4 border-t border-rule pt-6 md:grid-cols-[14rem_1fr]">
	<div>
		<h2 class="font-medium">Daten</h2>
		<p class="mt-1 text-[0.875rem] text-ink-2">
			Alles liegt in einer Datei auf deinem Server. Der Export ist eine Sicherung zum Mitnehmen, die du hier wiederherstellen kannst.
		</p>
	</div>
	<div class="min-w-0 space-y-8">
		<div>
			{#if backup.enabled}
				<p class="max-w-[52ch] text-[0.9375rem] text-ink-2">
					Jede Nacht ab {backup.hour}:00 Uhr entsteht eine Sicherung der Datenbank. Die letzten {backup.keep} bleiben erhalten.
				</p>
				<p class="mt-3 max-w-[52ch] text-[0.9375rem]" role="status">
					{#if backup.latest}
						Letzte Sicherung am {date(backup.latest.at)} um {time(backup.latest.at)} Uhr, {backup.count === 1 ? 'eine Sicherung' : `${backup.count} Sicherungen`} vorhanden.
					{:else}
						Noch keine Sicherung vorhanden.
					{/if}
				</p>
				{#if form?.backupError ?? backup.error}
					<p class="mt-2 max-w-[52ch] text-[0.875rem] text-critical" role="alert">
						Die letzte Sicherung ist fehlgeschlagen ({form?.backupError ?? backup.error}). Prüfe, ob der Sicherungsordner erreichbar ist.
					</p>
				{:else if backupStale}
					<p class="mt-2 max-w-[52ch] text-[0.875rem] text-critical" role="alert">
						Die letzte Sicherung ist älter als zwei Tage. Läuft der Server und ist der Sicherungsordner erreichbar?
					</p>
				{/if}
				<form method="post" action="?/backup" use:enhance class="mt-3">
					<button class="btn btn-quiet">Jetzt sichern</button>
				</form>
				{#if form?.backupDone}<p class="mt-2 text-[0.875rem] text-good">{form.backupDone}</p>{/if}
			{:else}
				<p class="max-w-[52ch] text-[0.9375rem] text-ink-2">
					Automatische Sicherungen sind nicht eingerichtet. Sie werden auf dem Server mit der Einstellung BACKUP_DIR eingeschaltet.
				</p>
			{/if}
		</div>
		<div>
			<a href="/export" class="btn btn-quiet" download>Als JSON exportieren</a>
		</div>
		<div>
			<p class="max-w-[52ch] text-[0.9375rem] text-ink-2">
				Wiederherstellen ersetzt alle Kategorien, Posten, Einkommen, Anlagen, Check-ins, Ziele und Szenarien durch den Stand einer
				Exportdatei. Benutzer und Passwörter bleiben, wie sie sind.
			</p>
			<form
				method="post"
				action="?/restore"
				enctype="multipart/form-data"
				use:enhance={({ formElement }) => async ({ update }) => {
					await update();
					// The form is reset after a successful restore but keeps the file after an error
					restoreFile = (formElement.elements.namedItem('file') as HTMLInputElement).files?.[0] ?? null;
				}}
				class="mt-3 flex flex-wrap items-center gap-3"
			>
				<label class="btn btn-quiet min-w-0 max-w-full cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
					<FileUp size={17} strokeWidth={1.75} class="shrink-0" />
					<span class="truncate">{restoreFile?.name ?? 'Exportdatei wählen'}</span>
					<input
						type="file"
						name="file"
						accept=".json,application/json"
						class="sr-only"
						required
						onchange={(e) => (restoreFile = e.currentTarget.files?.[0] ?? null)}
					/>
				</label>
				<button
					class="btn btn-quiet"
					disabled={!restoreFile}
					onclick={(e) => { if (!confirm(`Alle Einträge durch den Stand aus «${restoreFile?.name}» ersetzen?`)) e.preventDefault(); }}
				>Wiederherstellen</button>
			</form>
			{#if form?.restore}<p class="mt-2 text-[0.875rem] text-critical" role="alert">{form.restore}</p>{/if}
			{#if form?.restoreDone}<p class="mt-2 text-[0.875rem] text-good" role="status">{form.restoreDone}</p>{/if}
		</div>
		<div>
			<p class="max-w-[52ch] text-[0.9375rem] text-ink-2">
				Beispieldaten ersetzen alle deine Einträge durch erfundene Zahlen von 2023 bis 2026.
			</p>
			<form method="post" action="?/sample" use:enhance class="mt-3">
				<button class="btn btn-quiet" onclick={(e) => { if (!confirm('Alle Einträge durch Beispieldaten ersetzen?')) e.preventDefault(); }}>Beispieldaten laden</button>
			</form>
		</div>
		<form method="post" action="?/reset" use:enhance>
			<label class="label" for="confirm">Alle Daten löschen. Tippe LÖSCHEN ein, um zu bestätigen.</label>
			<div class="flex flex-wrap gap-3">
				<input id="confirm" name="confirm" bind:value={confirmReset} class="field max-w-48" autocomplete="off" />
				<button class="btn btn-danger border border-rule-strong" disabled={confirmReset !== 'LÖSCHEN'}>Alle Daten löschen</button>
			</div>
			{#if form?.reset}<p class="mt-2 text-[0.875rem] text-critical">{form.reset}</p>{/if}
		</form>
	</div>
</section>

<section class="mt-12 grid gap-4 border-t border-rule pt-6 md:grid-cols-[14rem_1fr]">
	<div>
		<h2 class="font-medium">Konto</h2>
		<p class="mt-1 text-[0.875rem] text-ink-2">Angemeldet als {data.user.username}.</p>
	</div>
	<div class="space-y-8">
		<form method="post" action="?/changePassword" use:enhance class="max-w-sm space-y-4">
			<div>
				<label class="label" for="current">Aktuelles Passwort</label>
				<input id="current" name="current" type="password" class="field" autocomplete="current-password" required />
			</div>
			<div>
				<label class="label" for="password">Neues Passwort</label>
				<input id="password" name="password" type="password" class="field" autocomplete="new-password" minlength="10" aria-describedby="password-hint" required />
				<p id="password-hint" class="mt-1.5 text-[0.8125rem] text-ink-3">Mindestens 10 Zeichen. Andere Geräte werden danach abgemeldet.</p>
			</div>
			<div>
				<label class="label" for="repeat">Neues Passwort wiederholen</label>
				<input id="repeat" name="repeat" type="password" class="field" autocomplete="new-password" required />
			</div>
			{#if form?.account}<p class="text-[0.9375rem] text-critical" role="alert">{form.account}</p>{/if}
			{#if form?.accountDone}<p class="text-[0.9375rem] text-good" role="status">{form.accountDone}</p>{/if}
			<button class="btn btn-quiet">Passwort ändern</button>
		</form>
		<form method="post" action="?/logout">
			<button class="btn btn-quiet"><LogOut size={17} strokeWidth={1.75} />Abmelden</button>
		</form>
	</div>
</section>

<section class="mt-12 grid gap-4 border-t border-rule pt-6 md:grid-cols-[14rem_1fr]">
	<div>
		<h2 class="font-medium">Benutzer</h2>
		<p class="mt-1 text-[0.875rem] text-ink-2">Alle Benutzer sehen und bearbeiten dasselbe Budget.</p>
	</div>
	<div>
		{#if form?.users && !failedDelete}<p class="mb-4 text-[0.9375rem] text-critical" role="alert">{form.users}</p>{/if}
		{#if form?.usersDone}<p class="mb-4 text-[0.9375rem] text-good" role="status">{form.usersDone}</p>{/if}
		<ul class="border-t border-rule">
			{#each data.users as u (u.id)}
				{@const self = u.id === data.user.id}
				<li class="flex min-h-13 flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-rule py-2.5">
					<span class="font-medium">{u.username}</span>
					{#if self}<span class="rounded-full bg-sunken px-2 py-0.5 text-[0.75rem] text-ink-2">du</span>{/if}
					<span class="ml-auto text-[0.8125rem] text-ink-3">
						{u.lastLoginAt ? `Zuletzt angemeldet am ${date(u.lastLoginAt)}` : 'Noch nie angemeldet'}
					</span>
					{#if !self && deleting !== u.id}
						<button
							type="button"
							class="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-critical"
							aria-label="Benutzer {u.username} löschen"
							onclick={() => (deleting = u.id)}
						><Trash size={15} /></button>
					{/if}
					{#if !self && deleting === u.id}
						<form
							method="post"
							action="?/deleteUser"
							class="mt-2 w-full"
							use:enhance={({ formElement }) => async ({ result, update }) => {
								if (result.type === 'success') deleting = null;
								await update();
								if (result.type === 'failure') {
									// A wrong password is retyped from scratch.
									const field = formElement.elements.namedItem('current') as HTMLInputElement;
									field.value = '';
									field.focus();
								}
							}}
						>
							<input type="hidden" name="id" value={u.id} />
							<label class="label" for="delete-current">
								«{u.username}» löschen? Die Budgetdaten bleiben erhalten. Bestätige mit deinem Passwort.
							</label>
							<div class="flex flex-wrap items-center gap-3">
								<input id="delete-current" name="current" type="password" class="field max-w-48" autocomplete="current-password" required use:autofocus />
								<button class="btn btn-danger border border-rule-strong">Löschen</button>
								<button type="button" class="btn btn-quiet" onclick={() => (deleting = null)}>Abbrechen</button>
							</div>
							{#if failedDelete === u.id}<p class="mt-2 text-[0.875rem] text-critical" role="alert">{form?.users}</p>{/if}
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		<form method="post" action="?/addUser" use:enhance class="mt-4 flex flex-wrap items-center gap-3">
			<input name="username" value={form?.username ?? ''} placeholder="Benutzername" aria-label="Benutzername" class="field max-w-48" autocomplete="off" autocapitalize="none" spellcheck="false" required />
			<input name="password" placeholder="Startpasswort" aria-label="Startpasswort" class="field max-w-48" autocomplete="off" minlength="10" required />
			<input name="current" type="password" placeholder="Dein Passwort" aria-label="Dein Passwort zur Bestätigung" class="field max-w-48" autocomplete="current-password" required />
			<button class="btn btn-quiet">Hinzufügen</button>
		</form>
		<p class="mt-2 text-[0.8125rem] text-ink-3">Das Startpasswort (mindestens 10 Zeichen) kann die Person danach selbst ändern. Zur Bestätigung braucht es dein eigenes Passwort.</p>
	</div>
</section>
