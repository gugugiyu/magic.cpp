<script lang="ts">
	import {
		ChatMessageStatistics,
		ChatMessageThinkingSteps,
		MarkdownContent,
		SyntaxHighlightedCode
	} from '$lib/components/app';
	import {
		sequentialThinkingStore,
		type ThoughtEntry
	} from '$lib/stores/sequential-thinking.svelte';
	import { config } from '$lib/stores/settings.svelte';
	import {
		Loader2,
		ChevronRight,
		Bot,
		Brain,
		Copy,
		Pencil,
		Check,
		CheckCircle,
		AlertCircle,
		X,
		Scissors,
		Sparkles
	} from '@lucide/svelte';
	import { agenticStore, type SubagentProgress } from '$lib/stores/agentic.svelte';
	import { cn } from '$lib/components/ui/utils';
	import { AgenticSectionType, FileTypeText } from '$lib/enums';
	import { formatJsonPretty, applyResponseFilters, copyToClipboard } from '$lib/utils';
	import { truncateToWords } from '$lib/utils/text';
	import {
		deriveAgenticSections,
		parseToolResultWithImages,
		type AgenticSection,
		type ToolResultLine
	} from '$lib/utils';
	import type { DatabaseMessage } from '$lib/types/database';
	import type { ChatMessageAgenticTimings, ChatMessageAgenticTurnStats } from '$lib/types/chat';
	import { ChatMessageStatsView } from '$lib/enums';
	import { DatabaseService } from '$lib/services/database.service';
	import { conversationsStore } from '$lib/stores/conversations.svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	interface Props {
		message: DatabaseMessage;
		toolMessages?: DatabaseMessage[];
		isStreaming?: boolean;
		highlightTurns?: boolean;
	}

	let { message, toolMessages = [], isStreaming = false, highlightTurns = false }: Props = $props();

	let expandedStates: Record<number, boolean> = $state({});
	/** Track whether the sequential thinking header is expanded to show individual steps. */
	let seqThinkingHeaderExpanded = $state(false);

	// Per-section editing state
	let editingSectionIndex = $state<number | null>(null);
	let editingSectionText = $state('');

	const subagentProgress = $derived(
		agenticStore.subagentProgress(message.convId)
	) satisfies SubagentProgress | null;

	const showToolCallInProgress = $derived(config().showToolCallInProgress as boolean);
	const showThoughtInProgress = $derived(config().showThoughtInProgress as boolean);

	const filterOptions = $derived({
		filterEmojiRemoval: config().filterEmojiRemoval as boolean,
		filterCodeblockOnly: config().filterCodeblockOnly as boolean,
		filterRawMode: config().filterRawMode as boolean,
		filterNormalizeMarkdown: config().filterNormalizeMarkdown as boolean
	});

	const sections = $derived(deriveAgenticSections(message, toolMessages, [], isStreaming));

	// Parse tool results with images
	const sectionsParsed = $derived(
		sections.map((section: AgenticSection) => ({
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

	/**
	 * Determines if a section is expanded.
	 * For sequential_thinking sections: auto-expands during streaming, collapses when done.
	 * For other sections: respects manual toggle state or default expansion rules.
	 */
	function isExpanded(index: number, section: AgenticSection): boolean {
		// For sequential_thinking sections, use auto-expand logic
		if (section.toolName === 'sequential_thinking') {
			// Check if user manually toggled this specific index
			if (expandedStates[index] !== undefined) {
				return expandedStates[index];
			}
			// During streaming: expand all sequential_thinking sections
			// After streaming: collapse all (user can re-expand manually)
			if (isStreaming) {
				return true;
			}
			return false;
		}

		// For all other sections, check manual toggle then defaults
		if (expandedStates[index] !== undefined) {
			return expandedStates[index];
		}

		return getDefaultExpanded(section);
	}

	function toggleExpanded(index: number, section: AgenticSection) {
		const currentState = isExpanded(index, section);

		expandedStates[index] = !currentState;
	}

	/** Parse a ThoughtEntry from a sequential_thinking tool section's toolArgs string. */
	function parseThoughtFromSection(section: (typeof sectionsParsed)[number]): ThoughtEntry | null {
		if (!section.toolArgs) return null;
		try {
			const raw =
				typeof section.toolArgs === 'string' ? JSON.parse(section.toolArgs) : section.toolArgs;
			return {
				thoughtNumber: Number(raw.thoughtNumber ?? 0),
				totalThoughts: Number(raw.totalThoughts ?? 0),
				thought: String(raw.thought ?? ''),
				nextThoughtNeeded: Boolean(raw.nextThoughtNeeded),
				done: section.toolResult != null
			};
		} catch {
			return null;
		}
	}

	/**
	 * Check if this section is the first sequential_thinking section across ALL sections (global, not per-turn).
	 * Used to determine where to render the single header-only stepper.
	 */
	function isFirstSeqThinkingGlobally(flatIndex: number): boolean {
		const firstSeqThinkingIndex = sectionsParsed.findIndex(
			(s: (typeof sectionsParsed)[number]) => s?.toolName === 'sequential_thinking'
		);
		return flatIndex === firstSeqThinkingIndex;
	}

	/** Get all sequential thinking thoughts across all turns. */
	function getAllSeqThinkingThoughts(): ThoughtEntry[] {
		const allThoughts: ThoughtEntry[] = [];
		for (const turn of turnGroups) {
			allThoughts.push(...getThoughtsForTurn(turn.flatIndices));
		}
		// Deduplicate by thoughtNumber (same thought might appear from multiple source messages)
		const seen = new SvelteMap<number, ThoughtEntry>();
		for (const thought of allThoughts) {
			if (!seen.has(thought.thoughtNumber)) {
				seen.set(thought.thoughtNumber, thought);
			}
		}
		const result = Array.from(seen.values());
		result.sort((a, b) => a.thoughtNumber - b.thoughtNumber);
		return result;
	}

	/** Get all thoughts for a specific turn group (by flat indices). */
	function getThoughtsForTurn(turnFlatIndices: number[]): ThoughtEntry[] {
		// Collect unique sourceMessageIds in this turn
		const sourceIds = new SvelteSet<string>();
		for (const idx of turnFlatIndices) {
			const section = sectionsParsed[idx];
			if (section?.toolName === 'sequential_thinking') {
				sourceIds.add(section.sourceMessageId ?? message.id);
			}
		}
		// Aggregate thoughts from all source messages in this turn
		const allThoughts: ThoughtEntry[] = [];
		for (const sourceId of sourceIds) {
			const storeThoughts = sequentialThinkingStore.getThoughtsForMessage(message.convId, sourceId);
			if (storeThoughts.length > 0) {
				allThoughts.push(...storeThoughts);
			} else {
				// Fallback: parse from sections
				for (const idx of turnFlatIndices) {
					const section = sectionsParsed[idx];
					if (
						section?.toolName === 'sequential_thinking' &&
						(section.sourceMessageId ?? message.id) === sourceId
					) {
						const parsed = parseThoughtFromSection(section);
						if (parsed) allThoughts.push(parsed);
					}
				}
			}
		}
		// Sort by thoughtNumber
		allThoughts.sort((a, b) => a.thoughtNumber - b.thoughtNumber);
		return allThoughts;
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

	function handleSectionCopy(content: string) {
		void copyToClipboard(content);
	}

	function startSectionEdit(index: number, content: string) {
		editingSectionIndex = index;
		editingSectionText = content;
	}

	function cancelSectionEdit() {
		editingSectionIndex = null;
		editingSectionText = '';
	}

	async function saveSectionEdit(section: AgenticSection) {
		if (editingSectionIndex === null) return;

		const trimmedText = editingSectionText.trim();
		if (!trimmedText) {
			cancelSectionEdit();
			return;
		}

		const sourceId = section.sourceMessageId;
		if (sourceId) {
			// Update the source message in the database
			await DatabaseService.updateMessage(sourceId, { content: trimmedText });

			// Update the UI: find the message in conversationsStore and update it
			const msgIdx = conversationsStore.findMessageIndex(sourceId);
			if (msgIdx !== -1) {
				conversationsStore.updateMessageAtIndex(msgIdx, { content: trimmedText });
			}
		}

		cancelSectionEdit();
	}
</script>

{#snippet renderSection(section: (typeof sectionsParsed)[number], index: number)}
	{#if section.toolName === 'sequential_thinking'}
		{@const thought = parseThoughtFromSection(section)}
		{@const isThisStepActive = isStreaming && thought != null && !thought.done}
		{#if isFirstSeqThinkingGlobally(index)}
			{@const allThoughts = getAllSeqThinkingThoughts()}
			{#if allThoughts.length > 0 || isStreaming}
				<div class="agentic-inline-block">
					<button
						type="button"
						class="agentic-inline-trigger seq-thinking-header"
						onclick={() => (seqThinkingHeaderExpanded = !seqThinkingHeaderExpanded)}
						aria-expanded={seqThinkingHeaderExpanded}
						title={seqThinkingHeaderExpanded ? 'Collapse thinking steps' : 'Expand thinking steps'}
					>
						<ChatMessageThinkingSteps
							thoughts={allThoughts}
							{isStreaming}
							conversationId={message.convId}
							headerOnly={true}
						/>
						<ChevronRight class={cn('agentic-chevron', seqThinkingHeaderExpanded && 'expanded')} />
					</button>
				</div>
			{/if}
		{/if}
		{#if thought && seqThinkingHeaderExpanded}
			<div class="agentic-inline-block">
				<button
					type="button"
					class="agentic-inline-trigger"
					onclick={() => toggleExpanded(index, section)}
					aria-expanded={isExpanded(index, section)}
				>
					{#if isThisStepActive}
						<Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin" />
					{:else if thought.done}
						<Check class="step-done-icon h-3.5 w-3.5 shrink-0" />
					{:else}
						<Brain class="h-3.5 w-3.5 shrink-0" />
					{/if}
					<span class="agentic-label">
						Step {thought.thoughtNumber}{thought.totalThoughts ? ` / ${thought.totalThoughts}` : ''}
					</span>
					<ChevronRight class={cn('agentic-chevron', isExpanded(index, section) && 'expanded')} />
				</button>
				{#if isExpanded(index, section)}
					<div class="agentic-inline-content">
						<div class="text-xs leading-relaxed break-words whitespace-pre-wrap">
							{thought.thought}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{:else if section.type === AgenticSectionType.TEXT}
		{@const displayContent = applyResponseFilters(section.content, filterOptions)}
		<div class="agentic-text-group">
			{#if editingSectionIndex === index}
				<textarea
					class="agentic-edit-textarea"
					rows={Math.max(3, editingSectionText.split('\n').length)}
					bind:value={editingSectionText}
					onkeydown={(e) => {
						if (e.key === 'Escape') cancelSectionEdit();
						if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveSectionEdit(section);
					}}
				></textarea>
				<div class="agentic-section-actions">
					<button
						class="agentic-action-btn save"
						onclick={() => saveSectionEdit(section)}
						title="Save"
					>
						<Check class="h-3.5 w-3.5" />
						<span>Save</span>
					</button>
					<button class="agentic-action-btn cancel" onclick={cancelSectionEdit} title="Cancel">
						<X class="h-3.5 w-3.5" />
						<span>Cancel</span>
					</button>
				</div>
			{:else}
				<div class="agentic-text">
					<MarkdownContent
						class="markdown-assistant-content"
						content={displayContent}
						attachments={message?.extra}
					/>
				</div>
				<div class="agentic-section-actions">
					<button
						class="agentic-action-btn"
						onclick={() => handleSectionCopy(section.content)}
						title="Copy"
					>
						<Copy class="h-3.5 w-3.5" />
					</button>
					<button
						class="agentic-action-btn"
						onclick={() => startSectionEdit(index, section.content)}
						title="Edit"
					>
						<Pencil class="h-3.5 w-3.5" />
					</button>
				</div>
			{/if}
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
		{@const hasError = section.toolResult?.startsWith('Error:')}

		<div class="agentic-inline-block">
			<button
				type="button"
				class="agentic-inline-trigger"
				onclick={() => toggleExpanded(index, section)}
				aria-expanded={isExpanded(index, section)}
			>
				{#if isPending}
					<Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin" />
				{:else if hasError}
					<AlertCircle class="tool-error-icon h-3.5 w-3.5 shrink-0" />
				{:else}
					<CheckCircle class="tool-success-icon h-3.5 w-3.5 shrink-0" />
				{/if}
				<span class="agentic-label">
					{isPending ? 'Calling' : hasError ? 'Error in' : 'Called'}
					<span class="agentic-name">{section.toolName || 'tool'}</span>{isPending ? '…' : ''}
				</span>
				<ChevronRight class={cn('agentic-chevron', isExpanded(index, section) && 'expanded')} />
			</button>

			{#if isPending && section.toolName === 'call_subagent' && subagentProgress}
				<div class="subagent-steps">
					{#each subagentProgress.steps as step, i (i)}
						<div class="subagent-step">
							{#if step.status === 'calling'}
								<Loader2 class="h-3 w-3 shrink-0 animate-spin" />
							{:else}
								<Bot class="h-3 w-3 shrink-0" />
							{/if}
							<span class="text-xs text-muted-foreground">
								<span class="font-mono">{subagentProgress.modelName}</span> →
								<span class="agentic-name">{step.toolName}</span>(){step.status === 'calling'
									? '…'
									: ''}
							</span>
						</div>
					{/each}
				</div>
			{/if}

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
						{#if section.wasCropped}
							<span
								class="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-500"
							>
								<Scissors class="h-2.5 w-2.5" />
								Trimmed
							</span>
						{:else if section.wasSummarized}
							<span
								class="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
							>
								<Sparkles class="h-2.5 w-2.5" />
								Summarized
							</span>
						{/if}
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
								{:else if line.dataUri}
									<img
										src={line.dataUri}
										alt=""
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
		{@const reasoningPreview = truncateToWords(section.content, 25)}
		{@const hasReasoningMore = section.content.length > reasoningPreview.length}
		<div class="agentic-inline-block">
			<button
				type="button"
				class="agentic-inline-trigger"
				onclick={() => toggleExpanded(index, section)}
				aria-expanded={isExpanded(index, section)}
			>
				<Brain class="h-3.5 w-3.5 shrink-0" />
				<span class="agentic-label">
					Thought
					{#if !isExpanded(index, section) && hasReasoningMore}
						<span class="agentic-preview"> — {reasoningPreview}…</span>
					{/if}
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

	.agentic-text-group {
		width: 100%;
		position: relative;
	}

	.agentic-text-group:hover .agentic-section-actions {
		opacity: 1;
		max-height: 2rem;
		transition-delay: 550ms;
	}

	.agentic-section-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		overflow: hidden;
		max-height: 0;
		opacity: 0;
		transition:
			opacity 0.15s ease,
			max-height 0.15s ease;
	}

	.agentic-edit-textarea {
		width: 100%;
		resize: vertical;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--input));
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		line-height: 1.5;
		font-family: inherit;
		outline: none;
	}

	.agentic-edit-textarea:focus {
		border-color: hsl(var(--ring));
		box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
	}

	.agentic-action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid hsl(var(--border) / 0.5);
		background: hsl(var(--muted) / 0.3);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition:
			color 0.15s,
			background 0.15s,
			border-color 0.15s;
		font-size: 0.75rem;
	}

	.agentic-action-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.6);
		border-color: hsl(var(--border));
	}

	.agentic-action-btn.save {
		color: hsl(var(--primary));
		border-color: hsl(var(--primary) / 0.3);
	}

	.agentic-action-btn.save:hover {
		background: hsl(var(--primary) / 0.1);
	}

	.agentic-action-btn.cancel {
		color: hsl(var(--muted-foreground));
	}

	.agentic-turn {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.agentic-inline-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.25rem;
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

	:global(.seq-thinking-header) {
		cursor: pointer;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.25rem 0.5rem;
	}

	:global(.seq-thinking-header:hover) {
		background: hsl(var(--muted) / 0.5);
	}

	.agentic-label {
		font-size: 0.75rem;
		color: inherit;
	}

	.agentic-name {
		font-style: italic;
	}

	.agentic-preview {
		color: hsl(var(--muted-foreground) / 0.6);
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
		/* margin-left: 1.25rem; No longer needed, we're switching to inline style*/
		margin-top: 0.25rem;
		/* padding-left: 0.75rem; */
		border-left: 2px solid hsl(var(--muted-foreground) / 0.25);
		max-height: 32rem;
		overflow-y: auto;
	}

	.subagent-steps {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		margin-left: 1.5rem;
		margin-top: 0.125rem;
	}

	.subagent-step {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--muted-foreground);
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

	:global(.step-done-icon) {
		color: hsl(142 71% 45%);
	}

	:global(.tool-success-icon) {
		color: hsl(142 71% 45%);
	}

	:global(.tool-error-icon) {
		color: hsl(0 72% 51%);
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
