<script lang="ts">
	import { slide } from 'svelte/transition';
	import { onMount } from 'svelte';

	interface Breakdown {
		userChars: number;
		assistantChars: number;
		toolChars: number;
		userTokens: number;
		assistantTokens: number;
		toolTokens: number;
		totalTokens: number;
	}

	interface Props {
		class?: string;
		isOpen?: boolean;
		breakdown: Breakdown;
		onClose?: () => void;
	}

	let { class: className = '', isOpen = false, breakdown, onClose }: Props = $props();

	const R = 21;
	const C = 100;

	let segments = $derived.by(() => {
		const { userTokens, assistantTokens, toolTokens, totalTokens } = breakdown;
		if (totalTokens <= 0) {
			return [{ key: 'empty', percent: C, offset: 0, color: 'var(--muted)' }];
		}
		const userP = (userTokens / totalTokens) * C;
		const assistantP = (assistantTokens / totalTokens) * C;
		const toolP = (toolTokens / totalTokens) * C;
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

	function handleKeydown(event: KeyboardEvent) {
		if (!isOpen) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose?.();
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

{#if isOpen}
	<div
		class="absolute right-0 bottom-full z-50 mb-2 w-60 overflow-hidden rounded-lg border border-border bg-popover shadow-lg {className}"
		role="dialog"
		aria-label="Token breakdown"
		transition:slide={{ duration: 150, axis: 'y' }}
	>
		<!-- Header: mini donut + total -->
		<div class="flex items-center gap-3 border-b border-border/40 px-4 py-3">
			<div class="relative shrink-0">
				<svg class="h-8 w-8 -rotate-90" viewBox="0 0 46 46">
					<circle
						cx="23"
						cy="23"
						r={R}
						fill="none"
						stroke="currentColor"
						stroke-width="4"
						class="text-border/60"
					/>
					{#each segments as seg (seg.key)}
						<circle
							cx="23"
							cy="23"
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
				<span
					class="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-foreground tabular-nums"
				>
					{breakdown.totalTokens > 999
						? `${(breakdown.totalTokens / 1000).toFixed(1)}k`
						: breakdown.totalTokens.toLocaleString()}
				</span>
			</div>
			<div class="flex flex-col">
				<span class="text-xs font-medium text-muted-foreground">Conversation tokens</span>
				<span class="text-sm font-semibold text-foreground tabular-nums">
					~{breakdown.totalTokens.toLocaleString()} total
				</span>
			</div>
		</div>

		<!-- Breakdown rows -->
		<div class="space-y-2 px-4 py-3">
			<div class="flex items-center justify-between text-sm">
				<span class="flex items-center gap-1.5 text-muted-foreground">
					<span class="inline-block h-2 w-2 rounded-full" style="background: var(--info)"></span>
					User
				</span>
				<span class="text-foreground tabular-nums">
					{breakdown.userChars.toLocaleString()} chars
				</span>
			</div>
			<div class="flex items-center justify-between text-sm">
				<span class="flex items-center gap-1.5 text-muted-foreground">
					<span class="inline-block h-2 w-2 rounded-full" style="background: var(--success)"></span>
					Assistant
				</span>
				<span class="text-foreground tabular-nums">
					{breakdown.assistantChars.toLocaleString()} chars
				</span>
			</div>
			<div class="flex items-center justify-between text-sm">
				<span class="flex items-center gap-1.5 text-muted-foreground">
					<span class="inline-block h-2 w-2 rounded-full" style="background: var(--warning)"></span>
					Tool
				</span>
				<span class="text-foreground tabular-nums">
					{breakdown.toolChars.toLocaleString()} chars
				</span>
			</div>
		</div>

		<!-- Footer -->
		<div class="border-t border-border/50 px-4 py-1.5 text-[10px] text-muted-foreground">
			<span>esc close</span>
		</div>
	</div>
{/if}
