<script lang="ts">
	import {
		ChatMessageStatistics,
		MarkdownContent,
		SyntaxHighlightedCode
	} from '$lib/components/app';
	import { config } from '$lib/stores/settings.svelte';
	import { Wrench, Loader2, Brain, ChevronRight } from '@lucide/svelte';
	import { cn } from '$lib/components/ui/utils';
	import { AgenticSectionType, FileTypeText } from '$lib/enums';
	import { formatJsonPretty, applyResponseFilters } from '$lib/utils';
	import {
		deriveAgenticSections,
		parseToolResultWithImages,
		type AgenticSection,
		type ToolResultLine
	} from '$lib/utils';
	import type { DatabaseMessage } from '$lib/types/database';
	import type { ChatMessageAgenticTimings, ChatMessageAgenticTurnStats } from '$lib/types/chat';
	import { ChatMessageStatsView } from '$lib/enums';

	interface Props {
		message: DatabaseMessage;
		toolMessages?: DatabaseMessage[];
		isStreaming?: boolean;
		highlightTurns?: boolean;
	}

	let { message, toolMessages = [], isStreaming = false, highlightTurns = false }: Props = $props();

	let expandedStates: Record<number, boolean> = $state({});

	const showToolCallInProgress = $derived(config().showToolCallInProgress as boolean);
	const showThoughtInProgress = $derived(config().showThoughtInProgress as boolean);

	const filterOptions = $derived({
		filterEmojiRemoval: config().filterEmojiRemoval as boolean,
		filterCodeblockOnly: config().filterCodeblockOnly as boolean,
		filterRawMode: config().filterRawMode as boolean
	});

	const sections = $derived(deriveAgenticSections(message, toolMessages, [], isStreaming));

	// Parse tool results with images
	const sectionsParsed = $derived(
		sections.map((section) => ({
			...section,
			parsedLines: section.toolResult
				? parseToolResultWithImages(section.toolResult, section.toolResultExtras || message?.extra)
				: ([] as ToolResultLine[])
		}))
	);

	// Group flat sections into agentic turns
	// A new turn starts when a non-tool section follows a tool section
	const turnGroups = $derived.by(() => {
		const turns: { sections: (typeof sectionsParsed)[number][]; flatIndices: number[] }[] = [];
		let currentTurn: (typeof sectionsParsed)[number][] = [];
		let currentIndices: number[] = [];
		let prevWasTool = false;

		for (let i = 0; i < sectionsParsed.length; i++) {
			const section = sectionsParsed[i];
			const isTool =
				section.type === AgenticSectionType.TOOL_CALL ||
				section.type === AgenticSectionType.TOOL_CALL_PENDING ||
				section.type === AgenticSectionType.TOOL_CALL_STREAMING;

			if (!isTool && prevWasTool && currentTurn.length > 0) {
				turns.push({ sections: currentTurn, flatIndices: currentIndices });
				currentTurn = [];
				currentIndices = [];
			}

			currentTurn.push(section);
			currentIndices.push(i);
			prevWasTool = isTool;
		}

		if (currentTurn.length > 0) {
			turns.push({ sections: currentTurn, flatIndices: currentIndices });
		}

		return turns;
	});

	function getDefaultExpanded(section: AgenticSection): boolean {
		if (
			section.type === AgenticSectionType.TOOL_CALL_PENDING ||
			section.type === AgenticSectionType.TOOL_CALL_STREAMING
		) {
			return showToolCallInProgress;
		}

		if (section.type === AgenticSectionType.REASONING_PENDING) {
			return showThoughtInProgress;
		}

		return false;
	}

	function isExpanded(index: number, section: AgenticSection): boolean {
		if (expandedStates[index] !== undefined) {
			return expandedStates[index];
		}

		return getDefaultExpanded(section);
	}

	function toggleExpanded(index: number, section: AgenticSection) {
		const currentState = isExpanded(index, section);

		expandedStates[index] = !currentState;
	}

	function buildTurnAgenticTimings(stats: ChatMessageAgenticTurnStats): ChatMessageAgenticTimings {
		return {
			turns: 1,
			toolCallsCount: stats.toolCalls.length,
			toolsMs: stats.toolsMs,
			toolCalls: stats.toolCalls,
			llm: stats.llm
		};
	}
</script>

{#snippet renderSection(section: (typeof sectionsParsed)[number], index: number)}
	{#if section.type === AgenticSectionType.TEXT}
		{@const displayContent = applyResponseFilters(section.content, filterOptions)}
		<div class="agentic-text">
			<MarkdownContent content={displayContent} attachments={message?.extra} />
		</div>
	{:else if section.type === AgenticSectionType.TOOL_CALL_STREAMING}
		<div class="agentic-inline-block">
			<button
				type="button"
				class="agentic-inline-trigger"
				onclick={() => toggleExpanded(index, section)}
				aria-expanded={isExpanded(index, section)}
			>
				<Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin" />
				<span class="agentic-label">
					Calling <span class="agentic-name">{section.toolName || 'tool'}</span>{isStreaming
						? '…'
						: ' — incomplete'}
				</span>
				<ChevronRight class={cn('agentic-chevron', isExpanded(index, section) && 'expanded')} />
			</button>

			{#if isExpanded(index, section)}
				<div class="agentic-inline-content">
					<div class="mb-2 text-xs text-muted-foreground/60">Arguments</div>
					{#if section.toolArgs}
						<SyntaxHighlightedCode
							code={formatJsonPretty(section.toolArgs)}
							language={FileTypeText.JSON}
							maxHeight="20rem"
							class="text-xs"
						/>
					{:else if isStreaming}
						<p class="text-xs text-muted-foreground/60 italic">Receiving arguments…</p>
					{:else}
						<p class="text-xs text-yellow-600 italic dark:text-yellow-400">
							Response was truncated
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{:else if section.type === AgenticSectionType.TOOL_CALL || section.type === AgenticSectionType.TOOL_CALL_PENDING}
		{@const isPending = section.type === AgenticSectionType.TOOL_CALL_PENDING}

		<div class="agentic-inline-block">
			<button
				type="button"
				class="agentic-inline-trigger"
				onclick={() => toggleExpanded(index, section)}
				aria-expanded={isExpanded(index, section)}
			>
				{#if isPending}
					<Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin" />
				{:else}
					<Wrench class="h-3.5 w-3.5 shrink-0" />
				{/if}
				<span class="agentic-label">
					{isPending ? 'Calling' : 'Called'}
					<span class="agentic-name">{section.toolName || 'tool'}</span>{isPending ? '…' : ''}
				</span>
				<ChevronRight class={cn('agentic-chevron', isExpanded(index, section) && 'expanded')} />
			</button>

			{#if isExpanded(index, section)}
				<div class="agentic-inline-content">
					{#if section.toolArgs && section.toolArgs !== '{}'}
						<div class="mb-2 text-xs text-muted-foreground/60">Arguments</div>
						<SyntaxHighlightedCode
							code={formatJsonPretty(section.toolArgs)}
							language={FileTypeText.JSON}
							maxHeight="20rem"
							class="text-xs"
						/>
					{/if}

					<div class="mt-3 mb-2 flex items-center gap-2 text-xs text-muted-foreground/60">
						<span>Result</span>
						{#if isPending}<Loader2 class="h-3 w-3 animate-spin" />{/if}
					</div>
					{#if section.toolResult}
						<div class="overflow-auto rounded-md border border-border bg-muted/50 p-3">
							{#each section.parsedLines as line, i (i)}
								<div class="font-mono text-xs leading-relaxed whitespace-pre-wrap">{line.text}</div>
								{#if line.image}
									<img
										src={line.image.base64Url}
										alt={line.image.name}
										class="mt-2 mb-2 h-auto max-w-full rounded-lg"
										loading="lazy"
									/>
								{/if}
							{/each}
						</div>
					{:else if isPending}
						<p class="text-xs text-muted-foreground/60 italic">Waiting for result…</p>
					{/if}
				</div>
			{/if}
		</div>
	{:else if section.type === AgenticSectionType.REASONING}
		<div class="agentic-inline-block">
			<button
				type="button"
				class="agentic-inline-trigger"
				onclick={() => toggleExpanded(index, section)}
				aria-expanded={isExpanded(index, section)}
			>
				<Brain class="h-3.5 w-3.5 shrink-0" />
				<span class="agentic-label">Thought</span>
				<ChevronRight class={cn('agentic-chevron', isExpanded(index, section) && 'expanded')} />
			</button>

			{#if isExpanded(index, section)}
				<div class="agentic-inline-content">
					<div class="text-xs leading-relaxed break-words whitespace-pre-wrap">
						{section.content}
					</div>
				</div>
			{/if}
		</div>
	{:else if section.type === AgenticSectionType.REASONING_PENDING}
		<div class="agentic-inline-block">
			<button
				type="button"
				class="agentic-inline-trigger"
				onclick={() => toggleExpanded(index, section)}
				aria-expanded={isExpanded(index, section)}
			>
				<Brain class="h-3.5 w-3.5 shrink-0" />
				<span class="agentic-label" class:thinking-pulse={isStreaming}>
					{isStreaming ? 'Thinking…' : 'Thought — incomplete'}
				</span>
				<ChevronRight class={cn('agentic-chevron', isExpanded(index, section) && 'expanded')} />
			</button>

			{#if isExpanded(index, section)}
				<div class="agentic-inline-content">
					<div class="text-xs leading-relaxed break-words whitespace-pre-wrap">
						{section.content}
					</div>
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<div class="agentic-content">
	{#if highlightTurns && turnGroups.length > 1}
		{#each turnGroups as turn, turnIndex (turnIndex)}
			{@const turnStats = message?.timings?.agentic?.perTurn?.[turnIndex]}
			<div class="agentic-turn my-2 hover:bg-muted/80 dark:hover:bg-muted/30">
				<span class="agentic-turn-label">Turn {turnIndex + 1}</span>
				{#each turn.sections as section, sIdx (turn.flatIndices[sIdx])}
					{@render renderSection(section, turn.flatIndices[sIdx])}
				{/each}
				{#if turnStats}
					<div class="turn-stats">
						<ChatMessageStatistics
							promptTokens={turnStats.llm.prompt_n}
							promptMs={turnStats.llm.prompt_ms}
							predictedTokens={turnStats.llm.predicted_n}
							predictedMs={turnStats.llm.predicted_ms}
							agenticTimings={turnStats.toolCalls.length > 0
								? buildTurnAgenticTimings(turnStats)
								: undefined}
							initialView={ChatMessageStatsView.GENERATION}
							hideSummary
						/>
					</div>
				{/if}
			</div>
		{/each}
	{:else}
		{#each sectionsParsed as section, index (index)}
			{@render renderSection(section, index)}
		{/each}
	{/if}
</div>

<style>
	.agentic-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		max-width: 48rem;
	}

	.agentic-text {
		width: 100%;
	}

	.agentic-inline-block {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.agentic-inline-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.25rem;
		transition:
			color 0.15s,
			background 0.15s;
		text-align: left;
		width: auto;
	}

	.agentic-inline-trigger:hover {
		color: var(--foreground);
		background: hsl(var(--muted) / 0.5);
	}

	.agentic-label {
		font-size: 0.75rem;
		color: inherit;
	}

	.agentic-name {
		font-style: italic;
	}

	:global(.agentic-chevron) {
		width: 0.875rem;
		height: 0.875rem;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	:global(.agentic-chevron.expanded) {
		transform: rotate(90deg);
	}

	.agentic-inline-content {
		margin-left: 1.25rem;
		margin-top: 0.25rem;
		padding-left: 0.75rem;
		border-left: 2px solid hsl(var(--muted-foreground) / 0.25);
		max-height: 32rem;
		overflow-y: auto;
	}

	@keyframes thinking-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	.thinking-pulse {
		animation: thinking-pulse 1.6s ease-in-out infinite;
	}

	.agentic-turn {
		position: relative;
		border: 1.5px dashed var(--muted-foreground);
		border-radius: 0.75rem;
		padding: 1rem;
		transition: background 0.1s;
	}

	.agentic-turn-label {
		position: absolute;
		top: -1rem;
		left: 0.75rem;
		padding: 0 0.375rem;
		background: var(--background);
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.turn-stats {
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid hsl(var(--muted) / 0.5);
	}
</style>
