<script lang="ts">
	interface Breakdown {
		user: number;
		assistant: number;
		tool: number;
		total: number;
	}

	interface Props {
		breakdown: Breakdown;
		class?: string;
	}

	let { breakdown, class: className = '' }: Props = $props();

	const R = 12;
	const C = 100;

	let segments = $derived.by(() => {
		const { user, assistant, tool, total } = breakdown;
		if (total <= 0) {
			return [{ key: 'empty', percent: 100, offset: 0, color: 'var(--muted)' }];
		}
		const userP = (user / total) * C;
		const assistantP = (assistant / total) * C;
		const toolP = (tool / total) * C;
		let cumulative = 0;
		return [
			{ key: 'user', percent: userP, offset: -cumulative, color: 'var(--info)' },
			{
				key: 'assistant',
				percent: assistantP,
				offset: -(cumulative += userP),
				color: 'var(--success)'
			},
			{ key: 'tool', percent: toolP, offset: -(cumulative += assistantP), color: 'var(--warning)' }
		];
	});
</script>

<svg
	viewBox="0 0 36 36"
	class="h-8 w-8 -rotate-90 {className}"
	role="img"
	aria-label="Token breakdown donut chart"
>
	{#each segments as seg (seg.key)}
		<circle
			cx="18"
			cy="18"
			r={R}
			fill="none"
			stroke={seg.color}
			stroke-width="4"
			stroke-dasharray="{seg.percent} {C - seg.percent}"
			stroke-dashoffset={seg.offset}
			stroke-linecap="butt"
			class="transition-all duration-300 ease-out"
		/>
	{/each}
</svg>
