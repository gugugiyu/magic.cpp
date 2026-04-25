<script lang="ts">
	import {
		ChatMessageStatistics,
		MarkdownContent,
		SyntaxHighlightedCode
	} from '$lib/components/app';
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
		Sparkles,
		Search,
		BookOpen,
		FileText,
		FolderOpen,
		Terminal
	} from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import {
		agenticStore,
		agenticSubagentFinalStats,
		type SubagentProgress,
		type SubagentFinalStats
	} from '$lib/stores/agentic.svelte';
	import { cn } from '$lib/components/ui/utils';
	import { AgenticSectionType, AttachmentType, FileTypeText } from '$lib/enums';
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
	import { runCommandSessionStore } from '$lib/stores/run-command-session.svelte';
	import { serverEndpointStore } from '$lib/stores/server-endpoint.svelte';
	import { onDestroy } from 'svelte';

	interface Props {
		message: DatabaseMessage;
		toolMessages?: DatabaseMessage[];
		isStreaming?: boolean;
		highlightTurns?: boolean;
	}

	let { message, toolMessages = [], isStreaming = false, highlightTurns = false }: Props = $props();

	let expandedStates: Record<number, boolean> = $state({});
	/** Track expanded state for tool call groups (keyed by first flat section index of the group). */
	let toolGroupExpanded: Record<number, boolean> = $state({});
	// Per-section editing state
	let editingSectionIndex = $state<number | null>(null);
	let editingSectionText = $state('');
	/** Tracks which run_command tool call is currently being re-executed after inline approval. */
	let reExecutingToolCallId = $state<string | null>(null);
	/** Errors from re-execution attempts, keyed by toolCallId. */
	let reExecutionErrors = $state<Record<string, string>>({});
	/** AbortController for the active re-execution fetch. */
	let reExecutionAbortController: AbortController | null = null;

	onDestroy(() => {
		reExecutionAbortController?.abort();
	});

	const subagentProgress = $derived(
		agenticStore.subagentProgress(message.convId)
	) satisfies SubagentProgress | null;

	const subagentFinalStats = $derived(
		agenticSubagentFinalStats(message.convId)
	) satisfies SubagentFinalStats | null;

	const showToolCallInProgress = $derived(config().showToolCallInProgress as boolean);
	const showThoughtInProgress = $derived(config().showThoughtInProgress as boolean);

	const filterOptions = $derived({
		filterEmojiRemoval: config().filterEmojiRemoval as boolean,
		filterCodeblockOnly: config().filterCodeblockOnly as boolean,
		filterRawMode: config().filterRawMode as boolean,
		// Skip normalization during streaming: fixUnclosedCodeBlocks closes in-progress
		// fences, making MarkdownContent treat them as complete blocks and never render
		// the streaming scroll container.
		filterNormalizeMarkdown: !isStreaming && (config().filterNormalizeMarkdown as boolean)
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

	// Cluster consecutive tool calls (2+) into collapsible groups
	const sectionClusters = $derived(
		computeClusters(
			sectionsParsed,
			sectionsParsed.map((_, i) => i)
		)
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
	 * Respects manual toggle state or default expansion rules.
	 */
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

	type SectionCluster =
		| { type: 'tool-group'; sections: typeof sectionsParsed; indices: number[] }
		| { type: 'single'; section: (typeof sectionsParsed)[number]; index: number };

	function computeClusters(sections: typeof sectionsParsed, indices: number[]): SectionCluster[] {
		const clusters: SectionCluster[] = [];
		let i = 0;
		while (i < sections.length) {
			const section = sections[i];
			const isGroupable =
				section.type === AgenticSectionType.TOOL_CALL ||
				section.type === AgenticSectionType.TOOL_CALL_PENDING ||
				section.type === AgenticSectionType.TOOL_CALL_STREAMING;

			if (isGroupable) {
				const groupSections: typeof sectionsParsed = [];
				const groupIndices: number[] = [];
				while (i < sections.length) {
					const s = sections[i];
					const isT =
						s.type === AgenticSectionType.TOOL_CALL ||
						s.type === AgenticSectionType.TOOL_CALL_PENDING ||
						s.type === AgenticSectionType.TOOL_CALL_STREAMING;
					if (!isT) break;
					groupSections.push(s);
					groupIndices.push(indices[i]);
					i++;
				}
				if (groupSections.length >= 2) {
					clusters.push({ type: 'tool-group', sections: groupSections, indices: groupIndices });
				} else {
					clusters.push({ type: 'single', section: groupSections[0], index: groupIndices[0] });
				}
			} else {
				clusters.push({ type: 'single', section, index: indices[i] });
				i++;
			}
		}
		return clusters;
	}

	function isToolGroupOpen(
		firstIndex: number,
		cluster: { sections: typeof sectionsParsed }
	): boolean {
		if (toolGroupExpanded[firstIndex] !== undefined) return toolGroupExpanded[firstIndex];
		return (
			showToolCallInProgress &&
			cluster.sections.some(
				(s) =>
					s.type === AgenticSectionType.TOOL_CALL_PENDING ||
					s.type === AgenticSectionType.TOOL_CALL_STREAMING
			)
		);
	}

	function toggleToolGroup(firstIndex: number, cluster: { sections: typeof sectionsParsed }): void {
		toolGroupExpanded[firstIndex] = !isToolGroupOpen(firstIndex, cluster);
	}

	function autoScrollOnMutation(node: HTMLElement, active: boolean) {
		let rafHandle: number | null = null;
		let observer: MutationObserver | null = null;

		function isNearBottom(el: HTMLElement): boolean {
			return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
		}

		function start() {
			if (observer) return;
			observer = new MutationObserver(() => {
				if (rafHandle !== null) cancelAnimationFrame(rafHandle);
				rafHandle = requestAnimationFrame(() => {
					rafHandle = null;
					if (isNearBottom(node)) {
						node.scrollTop = node.scrollHeight;
					}
				});
			});
			observer.observe(node, { childList: true, subtree: true, characterData: true });
			node.scrollTop = node.scrollHeight;
		}

		function stop() {
			if (rafHandle !== null) {
				cancelAnimationFrame(rafHandle);
				rafHandle = null;
			}
			observer?.disconnect();
			observer = null;
		}

		if (active) start();

		return {
			update(newActive: boolean) {
				if (newActive) start();
				else stop();
			},
			destroy() {
				stop();
			}
		};
	}

	/** Safely extract the skill name from a read_skill section's toolArgs string. */
	function parseReadSkillName(section: (typeof sectionsParsed)[number]): string {
		if (!section.toolArgs) return '';
		try {
			const raw =
				typeof section.toolArgs === 'string' ? JSON.parse(section.toolArgs) : section.toolArgs;
			return String(raw?.name ?? '');
		} catch {
			return '';
		}
	}

	/** Safely extract run_command rationale, command, and shell mode from a section's toolArgs string. */
	function parseRunCommandArgs(section: (typeof sectionsParsed)[number]): {
		rationale: string;
		command: string;
		inShell: boolean;
	} {
		if (!section.toolArgs) return { rationale: '', command: '', inShell: false };
		try {
			const raw =
				typeof section.toolArgs === 'string' ? JSON.parse(section.toolArgs) : section.toolArgs;
			return {
				rationale: String(raw?.rationale ?? ''),
				command: String(raw?.command ?? ''),
				inShell: Boolean(raw?.inShell ?? false)
			};
		} catch {
			return { rationale: '', command: '', inShell: false };
		}
	}

	function isSessionApprovalError(result: string | undefined): boolean {
		return !!result && result.includes('is not approved for this session');
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
		editingSectionText = content.trim();
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

	/**
	 * Re-execute a run_command tool call after the user approved it via the inline button.
	 * Updates the tool result message in the database and local store with the new output.
	 */
	async function reExecuteRunCommand(section: (typeof sectionsParsed)[number]) {
		if (!section.toolCallId || !section.toolArgs) return;

		let parsedArgs: Record<string, unknown> = {};
		try {
			parsedArgs = JSON.parse(section.toolArgs);
		} catch {
			return;
		}

		const command = String(parsedArgs.command ?? '');
		if (!command) return;

		// Clear any previous error for this tool call
		if (reExecutionErrors[section.toolCallId]) {
			reExecutionErrors = { ...reExecutionErrors, [section.toolCallId]: '' };
		}

		runCommandSessionStore.approve(command);
		reExecutingToolCallId = section.toolCallId;
		reExecutionAbortController?.abort();
		reExecutionAbortController = new AbortController();

		try {
			const toolMsg = toolMessages.find((m) => m.toolCallId === section.toolCallId);
			if (!toolMsg) return;

			const endpoint = serverEndpointStore.getBaseUrl();
			const resp = await fetch(`${endpoint}/api/tools/execute`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'run_command',
					args: {
						...parsedArgs,
						sessionApprovedCommands: runCommandSessionStore.getApprovedCommands()
					}
				}),
				signal: reExecutionAbortController.signal
			});
			if (!resp.ok) {
				const text = await resp.text().catch(() => 'Unknown error');
				throw new Error(`HTTP ${resp.status} — ${text}`);
			}
			const data = (await resp.json()) as {
				result?: string;
				error?: string;
				truncated?: boolean;
				originalLength?: number;
			};
			const result = data.error ? `Error: ${data.error}` : String(data.result ?? '');

			const extras = toolMsg.extra ? [...toolMsg.extra] : [];
			if (data.truncated && typeof data.originalLength === 'number') {
				extras.push({
					type: AttachmentType.TRUNCATED,
					name: 'truncated',
					originalLength: data.originalLength
				});
			}

			await DatabaseService.updateMessage(toolMsg.id, {
				content: result,
				extra: extras.length > 0 ? extras : undefined
			});
			const idx = conversationsStore.findMessageIndex(toolMsg.id);
			if (idx !== -1) {
				conversationsStore.updateMessageAtIndex(idx, {
					content: result,
					extra: extras.length > 0 ? extras : undefined
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (err instanceof DOMException && err.name === 'AbortError') {
				// User navigated away or cancelled — no need to surface error
				return;
			}
			reExecutionErrors = {
				...reExecutionErrors,
				[section.toolCallId]: `Re-execution failed: ${message}`
			};
			console.error('Failed to re-execute run_command:', err);
		} finally {
			reExecutingToolCallId = null;
			reExecutionAbortController = null;
		}
	}
</script>

{#snippet renderToolGroup(cluster: Extract<SectionCluster, { type: 'tool-group' }>)}
	{@const toolNames = cluster.sections.map((s) => s.toolName || 'tool')}
	{@const hasAnyPending = cluster.sections.some(
		(s) =>
			s.type === AgenticSectionType.TOOL_CALL_PENDING ||
			s.type === AgenticSectionType.TOOL_CALL_STREAMING
	)}
	{@const hasAnyError = cluster.sections.some(
		(s) =>
			s.toolResult?.startsWith('Error:') ||
			(s.toolResult?.startsWith('{') && s.toolResult.includes('"error"'))
	)}
	{@const MAX_SHOWN = 3}
	{@const shownNames = toolNames.slice(0, MAX_SHOWN)}
	{@const extraCount = toolNames.length - MAX_SHOWN}
	{@const labelNames = shownNames.join(', ') + (extraCount > 0 ? ` +${extraCount} more` : '')}
	{@const firstIndex = cluster.indices[0]}
	{@const isOpen = isToolGroupOpen(firstIndex, cluster)}
	<div class="agentic-inline-block">
		<button
			type="button"
			class="agentic-inline-trigger"
			onclick={() => toggleToolGroup(firstIndex, cluster)}
			aria-expanded={isOpen}
		>
			{#if hasAnyPending}
				<Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin" />
			{:else if hasAnyError}
				<AlertCircle class="h-3.5 w-3.5 shrink-0 text-destructive" />
			{:else}
				<CheckCircle class="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
			{/if}
			<span class="agentic-label">
				{hasAnyPending ? 'Calling' : hasAnyError ? 'Error in' : 'Called'}
				<span class="agentic-name">{labelNames}</span>{hasAnyPending ? '…' : ''}
			</span>
			<ChevronRight class={cn('agentic-chevron', isOpen && 'expanded')} />
		</button>
		{#if isOpen}
			<div class="agentic-tool-group-body">
				{#each cluster.sections as section, sIdx (cluster.indices[sIdx])}
					{@render renderSection(section, cluster.indices[sIdx])}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet renderSection(section: (typeof sectionsParsed)[number], index: number)}
	{#if section.type === AgenticSectionType.TEXT}
		{@const displayContent = applyResponseFilters(section.content, filterOptions)}
		<div class="agentic-text-group" class:editing={editingSectionIndex === index}>
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
				<div class="agentic-inline-content" use:autoScrollOnMutation={isStreaming}>
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
		{@const hasError =
			section.toolResult?.startsWith('Error:') ||
			(section.toolResult?.startsWith('{') && section.toolResult.includes('"error"'))}
		{@const isListSkill = section.toolName === 'list_skill'}
		{@const isReadSkill = section.toolName === 'read_skill'}
		{@const isRunCommand = section.toolName === 'run_command'}
		{@const runCommandArgs = isRunCommand
			? parseRunCommandArgs(section)
			: { rationale: '', command: '', inShell: false }}
		{@const isAwaitingApproval =
			isPending && isRunCommand && runCommandSessionStore.isPending(section.toolCallId || '')}
		{@const isSessionError =
			isRunCommand &&
			isSessionApprovalError(section.toolResult) &&
			!runCommandSessionStore.isApproved(runCommandArgs.command)}
		{@const skillIcon = isListSkill ? Search : isReadSkill ? BookOpen : null}
		{@const FILE_TOOL_LABELS: Record<string, { pending: string; done: string; error: string }> = {
			read_file: { pending: 'Model is reading file…', done: 'Model read file', error: 'Error reading file' },
			write_file: { pending: 'Model is writing file…', done: 'Model wrote file', error: 'Error writing file' },
			patch_file: { pending: 'Model is patching file…', done: 'Model patched file', error: 'Error patching file' },
			list_directory: { pending: 'Model is listing directory…', done: 'Model listed directory', error: 'Error listing directory' },
			search_files: { pending: 'Model is searching files…', done: 'Model searched files', error: 'Error searching files' },
			delete_file: { pending: 'Model is deleting file…', done: 'Model deleted file', error: 'Error deleting file' },
			move_file: { pending: 'Model is moving file…', done: 'Model moved file', error: 'Error moving file' }
		}}
		{@const fileToolLabel = FILE_TOOL_LABELS[section.toolName ?? '']}
		{@const isFileTool = fileToolLabel !== undefined}

		<div class="agentic-inline-block">
			<button
				type="button"
				class="agentic-inline-trigger"
				onclick={() => toggleExpanded(index, section)}
				aria-expanded={isExpanded(index, section)}
			>
				{#if isPending && !skillIcon && !isFileTool && !isRunCommand}
					<Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin" />
				{:else if hasError && !skillIcon && !isFileTool && !isRunCommand}
					<AlertCircle class="h-3.5 w-3.5 shrink-0 text-destructive" />
				{:else if skillIcon}
					{@const Icon = skillIcon}
					<Icon class="h-3.5 w-3.5 shrink-0 text-primary" />
				{:else if isFileTool}
					<FolderOpen class="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
				{:else if isRunCommand}
					<Terminal class="h-3.5 w-3.5 shrink-0 text-primary" />
				{:else}
					<CheckCircle class="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
				{/if}
				<span class="agentic-label">
					{#if isListSkill}
						{isPending
							? 'Model is finding best skill matching your request'
							: hasError
								? 'Error finding skills'
								: 'Model found skills'}
					{:else if isReadSkill}
						{#if isPending}
							Model now reading skill {parseReadSkillName(section)}...
						{:else}
							{hasError ? 'Error reading skill' : 'Model read skill'}
							{parseReadSkillName(section)}
						{/if}
					{:else if isFileTool}
						{isPending
							? fileToolLabel.pending
							: hasError
								? fileToolLabel.error
								: fileToolLabel.done}
					{:else if isRunCommand}
						{isPending
							? `${runCommandArgs.rationale || '…'}`
							: hasError
								? 'Error running command'
								: `[DONE] ${runCommandArgs.rationale || '…'}`}
					{:else}
						{isPending ? 'Calling' : hasError ? 'Error in' : 'Called'}
						<span class="agentic-name">{section.toolName || 'tool'}</span>{isPending ? '…' : ''}
					{/if}
				</span>
				{#if !isListSkill && !isReadSkill}
					<ChevronRight class={cn('agentic-chevron', isExpanded(index, section) && 'expanded')} />
				{/if}
			</button>

			{#if section.toolName === 'call_subagent' && (subagentProgress || subagentFinalStats)}
				{@const activeProgress = subagentProgress}
				{@const activeFinal = subagentFinalStats}
				{@const displayTotal = activeProgress?.usage?.total ?? activeFinal?.totalTokens}
				{@const displayToolCalls = activeProgress?.toolCallsCount ?? activeFinal?.toolCallsCount}
				<div class="subagent-steps">
					{#if activeProgress?.originSkill}
						<div class="subagent-step">
							<Badge variant="outline" class="text-[10px]">
								Triggered by skill: {activeProgress.originSkill}
							</Badge>
						</div>
					{/if}
					{#if activeProgress?.steps?.length}
						{#each activeProgress.steps as step, i (i)}
							<div class="subagent-step">
								{#if step.status === 'calling'}
									<Loader2 class="h-3 w-3 shrink-0 animate-spin" />
								{:else}
									<Bot class="h-3 w-3 shrink-0" />
								{/if}
								<span class="text-xs text-muted-foreground">
									<span class="font-mono">{activeProgress.modelName}</span> →
									<span class="agentic-name">{step.toolName}</span>(){step.status === 'calling'
										? '…'
										: ''}
								</span>
							</div>
						{/each}
					{/if}
					{#if displayTotal || displayToolCalls}
						<div class="subagent-stats">
							<div class="subagent-step">
								<FileText class="h-3 w-3 shrink-0" />
								{#if displayTotal}
									<span>{displayTotal.toLocaleString()} tokens</span>
								{/if}
								{#if displayToolCalls}
									<span>• {displayToolCalls} tool calls</span>
								{/if}
							</div>
						</div>
					{/if}
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
						{#if isPending && !isAwaitingApproval}<Loader2 class="h-3 w-3 animate-spin" />{/if}
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
					{#if isAwaitingApproval}
						<div class="mt-2 rounded-md border border-primary/20 bg-primary/5 p-3">
							<p class="mb-2 text-xs text-primary">
								This command requires session approval before it can run.
							</p>
							{#if runCommandArgs.inShell}
								<div
									class="mb-2 inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] font-semibold text-destructive"
								>
									<AlertCircle class="h-3 w-3" />
									Shell mode requested — arbitrary code execution is possible.
								</div>
							{/if}
							<div class="flex gap-2">
								<button
									type="button"
									class="inline-flex items-center gap-1.5 rounded-md border border-primary px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
									onclick={() => {
										runCommandSessionStore.approve(runCommandArgs.command);
										runCommandSessionStore.resolveApproval(section.toolCallId || '', true);
									}}
								>
									<Terminal class="h-3 w-3" />
									Approve and run "{runCommandArgs.command.trim().split(/\s+/)[0]}"
								</button>
								<button
									type="button"
									class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
									onclick={() =>
										runCommandSessionStore.resolveApproval(section.toolCallId || '', false)}
								>
									<X class="h-3 w-3" />
									Deny
								</button>
							</div>
						</div>
					{:else if isSessionError}
						<div class="mt-2 rounded-md border border-primary/20 bg-primary/5 p-3">
							<p class="mb-2 text-xs text-primary">
								This command requires session approval before it can run.
							</p>
							{#if runCommandArgs.inShell}
								<div
									class="mb-2 inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] font-semibold text-destructive"
								>
									<AlertCircle class="h-3 w-3" />
									Shell mode requested — arbitrary code execution is possible.
								</div>
							{/if}
							<button
								type="button"
								class="inline-flex items-center gap-1.5 rounded-md border border-primary px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
								onclick={() => reExecuteRunCommand(section)}
								disabled={reExecutingToolCallId === section.toolCallId}
							>
								{#if reExecutingToolCallId === section.toolCallId}
									<Loader2 class="h-3 w-3 animate-spin" />
									Running…
								{:else}
									<Terminal class="h-3 w-3" />
									Approve and run "{runCommandArgs.command.trim().split(/\s+/)[0]}"
								{/if}
							</button>
							{#if reExecutionErrors[section.toolCallId || '']}
								<p class="mt-2 text-xs text-destructive">
									{reExecutionErrors[section.toolCallId || '']}
								</p>
							{/if}
						</div>
					{/if}

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
				<div class="agentic-inline-content" use:autoScrollOnMutation={isStreaming}>
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
			{@const turnClusters = computeClusters(turn.sections, turn.flatIndices)}
			<div class="agentic-turn my-2 hover:bg-muted/80 dark:hover:bg-muted/30">
				<span class="agentic-turn-label">Turn {turnIndex + 1}</span>
				{#each turnClusters as cluster, cIdx (cIdx)}
					{#if cluster.type === 'tool-group'}
						{@render renderToolGroup(cluster)}
					{:else}
						{@render renderSection(cluster.section, cluster.index)}
					{/if}
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
		{#each sectionClusters as cluster, cIdx (cIdx)}
			{#if cluster.type === 'tool-group'}
				{@render renderToolGroup(cluster)}
			{:else}
				{@render renderSection(cluster.section, cluster.index)}
			{/if}
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

	.agentic-text-group:hover .agentic-section-actions,
	.agentic-text-group.editing .agentic-section-actions {
		opacity: 1;
		max-height: 2rem;
		transition-delay: 550ms;
	}

	.agentic-text-group.editing .agentic-section-actions {
		transition-delay: 0ms;
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
		border: 1px solid var(--input);
		background: var(--background);
		color: var(--foreground);
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		line-height: 1.5;
		font-family: inherit;
		outline: none;
	}

	.agentic-edit-textarea:focus {
		border-color: var(--ring);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--ring) 20%, transparent);
	}

	.agentic-action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		border: none;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
		transition:
			color 0.15s,
			background 0.15s;
		font-size: 0.75rem;
	}

	.agentic-action-btn:hover {
		color: var(--foreground);
		background: color-mix(in oklch, var(--muted) 40%, transparent);
	}

	.agentic-action-btn.save {
		color: var(--primary);
		border-color: color-mix(in oklch, var(--primary) 30%, transparent);
	}

	.agentic-action-btn.save:hover {
		background: color-mix(in oklch, var(--primary) 10%, transparent);
	}

	.agentic-action-btn.cancel {
		color: var(--muted-foreground);
	}

	.agentic-turn {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.agentic-inline-block {
		margin-bottom: 0.3rem;
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
		background: color-mix(in oklch, var(--muted) 50%, transparent);
	}

	.agentic-label {
		font-size: 0.75rem;
		color: inherit;
	}

	.agentic-name {
		font-style: italic;
	}

	.agentic-preview {
		color: color-mix(in oklch, var(--muted-foreground) 60%, transparent);
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
		padding-left: 1.25rem;
		margin-top: 0.25rem;
		/* padding-left: 0.75rem; */
		border-left: 2px solid color-mix(in oklch, var(--muted-foreground) 25%, transparent);
		max-height: 32rem;
		overflow-y: auto;
	}

	.agentic-tool-group-body {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin-top: 0.125rem;
		margin-left: 1rem;
		padding-left: 0.625rem;
		border-left: 2px solid color-mix(in oklch, var(--muted-foreground) 15%, transparent);
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

	.subagent-stats {
		display: flex;
		gap: 0.5rem;
		margin-left: 1.5rem;
		margin-top: 0.25rem;
		font-size: 10px;
		color: var(--muted-foreground);
		opacity: 0.6;
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
		border: 1px solid color-mix(in oklch, var(--muted-foreground) 22%, transparent);
		border-radius: 0.75rem;
		padding: 1rem;
		background: color-mix(in oklch, var(--muted) 15%, transparent);
		transition: background 0.15s ease;
	}

	.agentic-turn-label {
		font-size: 0.65rem;
		margin-bottom: 0.25rem;
		font-weight: 600;
		color: color-mix(in oklch, var(--muted-foreground) 90%, transparent);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.turn-stats {
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid color-mix(in oklch, var(--muted) 50%, transparent);
	}
</style>
