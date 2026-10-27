<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';

	/** Modal panel: a bottom sheet on phones, a centred dialog on larger screens. */
	let {
		open = $bindable(),
		title,
		children,
		canClose = () => true
	}: { open: boolean; title: string; children: Snippet; canClose?: () => boolean } = $props();

	let dialog: HTMLDialogElement;

	function requestClose() {
		if (canClose()) open = false;
	}

	$effect(() => {
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	oncancel={(e) => {
		e.preventDefault();
		requestClose();
	}}
	onclick={(e) => e.target === dialog && requestClose()}
	aria-labelledby="sheet-title"
	class="sheet"
>
	{#if open}
		<div class="sticky top-0 z-10 flex items-center justify-between gap-4 bg-surface px-6 pt-5 pb-3">
			<h2 id="sheet-title" class="text-[1.25rem] font-medium tracking-[-0.015em]">{title}</h2>
			<button
				type="button"
				class="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
				onclick={requestClose}
				aria-label="Schliessen"
			>
				<X size={19} />
			</button>
		</div>
		<div class="px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
			{@render children()}
		</div>
	{/if}
</dialog>

<style>
	.sheet {
		margin: auto auto 0;
		width: 100%;
		max-width: 100%;
		max-height: 92dvh;
		overflow-y: auto;
		border-radius: 20px 20px 0 0;
		background: var(--surface);
		color: var(--ink);
		overscroll-behavior: contain;
	}
	.sheet[open] {
		animation: rise 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.sheet::backdrop {
		background: rgb(10 16 13 / 0.42);
		backdrop-filter: blur(2px);
	}
	@media (min-width: 640px) {
		.sheet {
			margin: auto;
			max-width: 34rem;
			max-height: 88dvh;
			border-radius: 20px;
			border: 1px solid var(--rule);
		}
		.sheet[open] {
			animation: appear 180ms ease-out;
		}
	}
	@keyframes rise {
		from {
			transform: translateY(24px);
			opacity: 0.6;
		}
	}
	@keyframes appear {
		from {
			transform: scale(0.98);
			opacity: 0;
		}
	}
</style>
