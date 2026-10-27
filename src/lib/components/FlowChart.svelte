<script lang="ts">
	import type { BudgetFlow } from '#lib/domain.ts';
	import { catColor } from '#lib/categories.ts';
	import { chf, percent } from '#lib/money.ts';
	import { forPeriod, periodSuffix } from '#lib/prefs.svelte.ts';

	/**
	 * Where the income goes, as a flow: incomes on the left, spending, saving and what is left in the
	 * middle, categories and saving items on the right. Band widths are monthly amounts, own share.
	 */
	let { flow, income }: { flow: BudgetFlow; income: number } = $props();

	type Node = {
		key: string;
		col: 0 | 1 | 2;
		name: string;
		value: number;
		color: string;
		y0: number;
		y1: number;
	};
	type Link = { key: string; from: Node; to: Node; value: number; sy: number; ty: number; color: string };

	let width = $state(640);
	const narrow = $derived(width < 560);
	const NODE_W = 10;
	const GAP = 14;
	/** Room for the labels right of the last column */
	const labelSpace = $derived(narrow ? 128 : 220);
	const x = $derived([0, (width - labelSpace - NODE_W) / 2, width - labelSpace - NODE_W]);

	const NEUTRAL = 'color-mix(in oklab, var(--ink) 58%, var(--paper))';

	const layout = $derived.by(() => {
		const col0 = [
			...flow.sources.map((s) => ({ key: `in-${s.id}`, name: s.name, value: s.value, color: NEUTRAL })),
			...(flow.deficit > 0 ? [{ key: 'deficit', name: 'Fehlbetrag', value: flow.deficit, color: 'var(--critical)' }] : [])
		];
		const col1 = [
			{ key: 'spending', name: 'Ausgaben', value: flow.spending, color: NEUTRAL },
			{ key: 'saving', name: 'Sparen', value: flow.saving, color: NEUTRAL },
			{ key: 'free', name: 'Frei', value: flow.free, color: 'var(--accent)' }
		].filter((n) => n.value > 0);
		const col2 = [
			...flow.categories.map((c) => ({ key: `cat-${c.category.id}`, name: c.category.name, value: c.value, color: catColor(c.category.color), parent: 'spending' })),
			...flow.savings.map((s) => ({ key: `save-${s.item.id}`, name: s.item.name, value: s.value, color: s.category ? catColor(s.category.color) : NEUTRAL, parent: 'saving' }))
		];

		// One scale for all columns, so band widths compare across the whole chart
		const columns = [col0, col1, col2];
		const most = Math.max(...columns.map((c) => c.length));
		const total = Math.max(...columns.map((c) => c.reduce((a, n) => a + n.value, 0)), 1);
		const height = Math.max(260, most * 30);
		const k = (height - GAP * (most - 1)) / total;

		const place = (list: { key: string; name: string; value: number; color: string }[], col: 0 | 1 | 2): Node[] => {
			let y = 0;
			return list.map((n) => {
				const h = Math.max(n.value * k, 2);
				const node = { ...n, col, y0: y, y1: y + h };
				y += h + GAP;
				return node;
			});
		};
		const n0 = place(col0, 0);
		const n1 = place(col1, 1);
		const n2 = place(col2, 2);

		// Every income feeds the middle in proportion; the right column hangs off spending and saving
		const links: Link[] = [];
		const out = new Map<string, number>();
		const into = new Map<string, number>();
		const link = (from: Node, to: Node, value: number, color: string) => {
			if (value <= 0) return;
			const sy = out.get(from.key) ?? from.y0;
			const ty = into.get(to.key) ?? to.y0;
			const h = value * k;
			links.push({ key: `${from.key}>${to.key}`, from, to, value, sy, ty, color });
			out.set(from.key, sy + h);
			into.set(to.key, ty + h);
		};
		const left = n0.reduce((a, n) => a + n.value, 0) || 1;
		for (const target of n1) for (const src of n0) link(src, target, (target.value * src.value) / left, target.color);
		for (const target of n2) {
			const parent = n1.find((n) => n.key === col2.find((c) => c.key === target.key)!.parent);
			if (parent) link(parent, target, target.value, target.color);
		}
		return { nodes: [...n0, ...n1, ...n2], links, height, k };
	});

	const pad = { top: 6, bottom: 6 };
	const svgHeight = $derived(layout.height + pad.top + pad.bottom);

	function band(l: Link): string {
		const x0 = x[l.from.col] + NODE_W;
		const x1 = x[l.to.col];
		const h = l.value * layout.k;
		const mid = (x0 + x1) / 2;
		const [a, b] = [l.sy + pad.top, l.ty + pad.top];
		return `M${x0},${a}C${mid},${a} ${mid},${b} ${x1},${b}L${x1},${b + h}C${mid},${b + h} ${mid},${a + h} ${x0},${a + h}Z`;
	}

	// Hover: a node or a band, with everything connected to it highlighted
	let active = $state<{ node?: Node; link?: Link } | null>(null);
	const connected = (l: Link) =>
		!active ? true : active.link ? active.link.key === l.key : l.from.key === active.node!.key || l.to.key === active.node!.key;
	const lit = (n: Node) =>
		!active ? true : active.node ? active.node.key === n.key || layout.links.some((l) => connected(l) && (l.from.key === n.key || l.to.key === n.key)) : active.link!.from.key === n.key || active.link!.to.key === n.key;

	const tip = $derived.by(() => {
		if (!active) return null;
		if (active.node) {
			const n = active.node;
			return { x: x[n.col] + NODE_W / 2, y: n.y0 + pad.top, title: n.name, value: n.value };
		}
		const l = active.link!;
		return {
			x: (x[l.from.col] + NODE_W + x[l.to.col]) / 2,
			y: (l.sy + l.ty) / 2 + pad.top,
			title: `${l.from.name} → ${l.to.name}`,
			value: l.value
		};
	});

	/**
	 * Label text that fits the room next to a node, measured roughly by characters. The right column
	 * keeps the amount and shortens the name; the others keep the name and drop the amount when tight.
	 * Full names and amounts are always in the tooltip and the list view.
	 */
	function label(n: Node): { name: string; amount: string | null } {
		const amount = chf(forPeriod(n.value));
		const room = n.col === 2 ? labelSpace - 14 : x[1] - x[0] - NODE_W - 16;
		const amountW = amount.length * 7 + 5;
		if (n.name.length * 6.6 + amountW <= room) return { name: n.name, amount };
		if (n.col === 2) {
			const max = Math.max(4, Math.floor((room - amountW) / 6.6));
			return { name: `${n.name.slice(0, max - 1)}…`, amount };
		}
		const max = Math.floor(room / 6.6);
		return { name: n.name.length > max ? `${n.name.slice(0, max - 1)}…` : n.name, amount: null };
	}
</script>

<div class="relative" bind:clientWidth={width}>
	<svg
		{width}
		height={svgHeight}
		role="img"
		aria-label="Fluss des Einkommens in Ausgaben, Sparen und was frei bleibt. Die Beträge stehen auch in der Liste."
		onpointerleave={() => (active = null)}
	>
		{#each layout.links as l (l.key)}
			<path
				d={band(l)}
				fill={l.color}
				class="band"
				class:dim={!connected(l)}
				role="presentation"
				onpointerenter={() => (active = { link: l })}
			/>
		{/each}

		{#each layout.nodes as n (n.key)}
			<rect
				x={x[n.col]}
				y={n.y0 + pad.top}
				width={NODE_W}
				height={n.y1 - n.y0}
				rx="2"
				fill={n.color}
				class="node"
				class:dim={!lit(n)}
				role="button"
				tabindex="0"
				aria-label="{n.name}: CHF {chf(forPeriod(n.value))} {periodSuffix()}, {percent(n.value, income)} des Einkommens"
				onpointerenter={() => (active = { node: n })}
				onfocus={() => (active = { node: n })}
				onblur={() => (active = null)}
			/>
		{/each}

		{#each layout.nodes as n (n.key)}
			{@const cy = (n.y0 + n.y1) / 2 + pad.top}
			{@const text = label(n)}
			<text
				x={x[n.col] + NODE_W + 6}
				y={cy}
				dy="0.35em"
				class="label text-[12px]"
				class:dim={!lit(n)}
				aria-hidden="true"
			>
				<tspan class={n.key === 'free' ? 'fill-accent font-semibold' : n.key === 'deficit' ? 'fill-critical' : 'fill-ink-2'}>{text.name}</tspan>
				{#if text.amount}<tspan class="num {n.key === 'free' ? 'fill-accent font-semibold' : 'fill-ink'}" dx="5">{text.amount}</tspan>{/if}
			</text>
		{/each}
	</svg>

	{#if tip}
		<div
			class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-rule bg-surface px-3.5 py-2.5 whitespace-nowrap shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)]"
			style="left: clamp(90px, {tip.x}px, calc(100% - 90px)); top: {Math.max(tip.y - 8, 0)}px"
			role="tooltip"
		>
			<div class="text-[0.8125rem] text-ink-2">{tip.title}</div>
			<div class="text-[1rem] font-semibold">CHF {chf(forPeriod(tip.value))}</div>
			<div class="text-[0.8125rem] text-ink-2">{percent(tip.value, income)} des Einkommens</div>
		</div>
	{/if}
</div>

<style>
	.band {
		opacity: 0.32;
		transition: opacity 120ms;
	}
	.band.dim {
		opacity: 0.08;
	}
	.node,
	.label {
		transition: opacity 120ms;
	}
	.node.dim,
	.label.dim {
		opacity: 0.35;
	}
	/* Labels sit on top of the bands; a halo in the page colour keeps them readable */
	.label {
		paint-order: stroke;
		stroke: var(--paper);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.node {
		outline: none;
		cursor: default;
	}
	.node:focus-visible {
		stroke: var(--ink);
		stroke-width: 2;
	}
</style>
