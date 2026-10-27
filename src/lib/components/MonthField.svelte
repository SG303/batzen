<script lang="ts">
	import { MONTH_NAMES, type Month } from '#lib/domain.ts';

	/** Month picker built from two selects: works the same in every browser. */
	let {
		name,
		value = $bindable(),
		label,
		id,
		yearsAhead = 2
	}: { name: string; value: Month; label: string; id: string; /** How far into the future the years go */ yearsAhead?: number } = $props();

	const thisYear = new Date().getFullYear();
	const years = $derived(Array.from({ length: thisYear + yearsAhead + 1 - 1990 }, (_, i) => thisYear + yearsAhead - i));

	const year = $derived(Number(value.slice(0, 4)));
	const month = $derived(Number(value.slice(5, 7)));

	const set = (y: number, m: number) => (value = `${y}-${String(m).padStart(2, '0')}`);
</script>

<fieldset>
	<legend class="label">{label}</legend>
	<input type="hidden" {name} {value} />
	<div class="grid grid-cols-[1fr_6.5rem] gap-2">
		<select
			{id}
			class="field"
			aria-label="Monat"
			value={month}
			onchange={(e) => set(year, Number(e.currentTarget.value))}
		>
			{#each MONTH_NAMES as m, i (m)}<option value={i + 1}>{m}</option>{/each}
		</select>
		<select
			class="field num"
			aria-label="Jahr"
			value={year}
			onchange={(e) => set(Number(e.currentTarget.value), month)}
		>
			{#each years as y (y)}<option value={y}>{y}</option>{/each}
		</select>
	</div>
</fieldset>
