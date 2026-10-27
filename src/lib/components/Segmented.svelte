<script lang="ts" generics="T extends string">
	let {
		options,
		value = $bindable(),
		label,
		size = 'md'
	}: {
		options: { value: T; label: string }[];
		value: T;
		label: string;
		size?: 'sm' | 'md';
	} = $props();
</script>

<div
	role="radiogroup"
	aria-label={label}
	class="inline-flex rounded-full bg-sunken p-0.5 {size === 'sm' ? 'text-[0.8125rem]' : 'text-[0.875rem]'}"
>
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === option.value}
			onclick={() => (value = option.value)}
			class="rounded-full transition-colors {size === 'sm' ? 'px-3 py-1' : 'px-3.5 py-1.5'} {value ===
			option.value
				? 'bg-surface text-ink shadow-[0_0_0_1px_var(--rule-strong)]'
				: 'text-ink-2 hover:text-ink'}"
		>
			{option.label}
		</button>
	{/each}
</div>
