<script lang="ts">
	import { Check, Loader2 } from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import { cn } from '$lib/components/ui/utils';
	import { agenticStreamingToolCall } from '$lib/stores/agentic.svelte';
	import type { ThoughtEntry } from '$lib/stores/sequential-thinking.svelte';
	import { countWords, truncateToWords } from '$lib/utils/text';

	interface Props {
		thoughts: ThoughtEntry[];
		isStreaming?: boolean;
		conversationId?: string;
		/** When true, renders only the counter + progress bar header — no steps list. */
		headerOnly?: boolean;
	}

	let { thoughts, isStreaming = false, conversationId, headerOnly = false }: Props = $props();

	const DEFAULT_VISIBLE_WORDS = 110;
	let expandedSteps = $state<Set<number>>(new Set());

	const lastThought = $derived(thoughts.length > 0 ? thoughts[thoughts.length - 1] : null);

	// Number of placeholder steps to show for future thoughts still to come
	const pendingCount = $derived.by(() => {
		if (!isStreaming || !lastThought || !lastThought.nextThoughtNeeded) return 0;
		return Math.max(0, lastThought.totalThoughts - thoughts.length);
	});

	// Use whichever is larger: the model's estimate or the actual count received so far.
	const totalSteps = $derived(Math.max(lastThought?.totalThoughts ?? 0, thoughts.length));

	function isActiveStep(index: number): boolean {
		return isStreaming && index === thoughts.length - 1 && !!lastThought?.nextThoughtNeeded;
	}

	// Detect "Model is reasoning..." state: streaming is on, no thoughts yet, but sequential_thinking tool is being called
	const isModelReasoning = $derived.by(() => {
		if (thoughts.length > 0) return false;
		if (!isStreaming) return false;
		if (!conversationId) return false;
		const streamingCall = agenticStreamingToolCall(conversationId);
		return streamingCall?.name === 'sequential_thinking';
	});

	// Don't render anything if there's nothing to show
	const hasDisplayableContent = $derived(thoughts.length > 0 || isModelReasoning);

	const progressPercent = $derived.by(() => {
		if (totalSteps === 0) return 0;
		return Math.min(100, (thoughts.length / totalSteps) * 100);
	});

	function toggleExpanded(index: number) {
		if (expandedSteps.has(index)) {
			expandedSteps.delete(index);
		} else {
			expandedSteps.add(index);
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}
</script>

<div class="thinking-steps">
	<div class="steps-header">
		{#if isModelReasoning}
			<span class="steps-label steps-label--reasoning">
				<Loader2 class="h-3 w-3 animate-spin" />
				Model is reasoning...
			</span>
		{:else if thoughts.length > 0}
			<span class="steps-label">
				{thoughts.length} / {totalSteps} step{totalSteps !== 1 ? 's' : ''}
			</span>
			{#if totalSteps > 0}
				<div class="steps-progress">
					<div class="steps-progress-bar" style="--progress: {progressPercent}%"></div>
				</div>
			{/if}
		{/if}
	</div>

	{#if !headerOnly && hasDisplayableContent && thoughts.length > 0}
		<ol class="steps-list">
			{#each thoughts as thought, i (i)}
				{@const active = isActiveStep(i)}
				{@const done = thought.done || (!active && i < thoughts.length - 1)}
				{@const nextThought = thoughts[i + 1]}
				{@const duration = thought.startedAt
					? (thought.completedAt ?? nextThought?.startedAt ?? 0) - thought.startedAt
					: 0}
				{@const wordCount = countWords(thought.thought)}
				{@const isExpanded = expandedSteps.has(i)}
				{@const truncatedText = truncateToWords(thought.thought, DEFAULT_VISIBLE_WORDS)}
				{@const hasMore = wordCount > DEFAULT_VISIBLE_WORDS}
				<li class="step-item" in:fly={{ y: 20, duration: 300, delay: 0 }}>
					<div class={cn('step-icon', done && 'step-icon--done', active && 'step-icon--active')}>
						{#if active}
							<Loader2 class="h-3 w-3 animate-spin" />
						{:else if done}
							<Check class="h-3 w-3" />
						{/if}
					</div>
					<div class="step-body">
						<p class="step-thought">
							{isExpanded ? thought.thought.trim() : truncatedText}
						</p>
						<div class="step-footer">
							{#if hasMore}
								<button onclick={() => toggleExpanded(i)} class="step-toggle">
									{isExpanded ? 'Show less' : 'Show more…'}
								</button>
							{/if}
							{#if duration > 0}
								<span class="step-duration">{formatDuration(duration)}</span>
							{/if}
						</div>
					</div>
				</li>
			{/each}

			{#each { length: pendingCount } as _, i (i)}
				<li class="step-item step-item--pending" in:fly={{ y: 20, duration: 300, delay: 0 }}>
					<div class="step-icon step-icon--pending"></div>
					<div class="step-body">
						<p class="step-thought step-thought--pending">Thinking…</p>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.thinking-steps {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.steps-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.steps-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.steps-label--reasoning {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: hsl(var(--primary));
		animation: reasoning-pulse 1.6s ease-in-out infinite;
	}

	@keyframes reasoning-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.steps-progress {
		flex: 1;
		min-width: 4rem;
		max-width: 8rem;
		height: 0.25rem;
		border-radius: 9999px;
		background: hsl(var(--muted));
		overflow: hidden;
	}

	.steps-progress-bar {
		height: 100%;
		width: var(--progress, 0%);
		border-radius: 9999px;
		background: linear-gradient(90deg, hsl(142 71% 45%), hsl(142 71% 55%));
		transition: width 0.5s ease;
	}

	.steps-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.step-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		position: relative;
	}

	/* Vertical connector line between steps */
	.step-item:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 0.5625rem; /* center of the 1.125rem icon */
		top: 1.25rem;
		bottom: 0;
		width: 1px;
		background: hsl(var(--muted-foreground) / 0.2);
	}

	.step-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.125rem;
		height: 1.125rem;
		margin-top: 0.125rem;
		border-radius: 50%;
		border: 1.5px solid hsl(var(--muted-foreground) / 0.35);
		background: transparent;
		color: var(--muted-foreground);
	}

	.step-icon--done {
		border-color: hsl(142 71% 45%);
		background: hsl(142 71% 45% / 0.12);
		color: hsl(142 71% 45%);
	}

	.step-icon--active {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.step-icon--pending {
		border-style: dashed;
		border-color: hsl(var(--muted-foreground) / 0.2);
	}

	.step-body {
		padding-bottom: 0.5rem;
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.step-thought {
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--foreground);
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}

	.step-thought--pending {
		color: hsl(var(--muted-foreground) / 0.5);
		font-style: italic;
	}

	.step-footer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.step-toggle {
		font-size: 0.65rem;
		font-weight: 500;
		color: hsl(var(--primary));
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: opacity 0.15s;
	}

	.step-toggle:hover {
		opacity: 0.8;
	}

	.step-duration {
		font-size: 0.65rem;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
</style>
