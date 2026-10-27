<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import { privacy, setPrivacy } from '#lib/privacy.svelte.ts';
</script>

<button
	type="button"
	onclick={() => setPrivacy(!privacy.on)}
	class="grid size-10 place-items-center rounded-full transition-colors hover:bg-sunken hover:text-ink {privacy.on ? 'bg-sunken text-ink' : 'text-ink-2'}"
	aria-pressed={privacy.on}
	aria-label="Beträge ausblenden"
	title={privacy.on ? 'Beträge zeigen' : 'Beträge ausblenden'}
>
	{#if privacy.on}<EyeOff size={19} strokeWidth={1.75} />{:else}<Eye size={19} strokeWidth={1.75} />{/if}
</button>
