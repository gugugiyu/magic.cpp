<script lang="ts">
	import {
		Edit,
		Copy,
		RefreshCw,
		Trash2,
		ArrowRight,
		GitBranch,
		Package,
		Loader2
	} from '@lucide/svelte';
	import {
		ActionIcon,
		ChatMessageBranchingControls,
		DialogConfirmation
	} from '$lib/components/app';
	import { Switch } from '$lib/components/ui/switch';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import { MessageRole } from '$lib/enums';
	import type { DatabaseMessageExtra } from '$lib/types/database';
	import {
		activeConversation,
		conversationsStore,
		activeMessages
	} from '$lib/stores/conversations.svelte';
	import { config } from '$lib/stores/settings.svelte';
	import { apiPost } from '$lib/utils/api-fetch';
	import { agenticIsAnyRunning } from '$lib/stores/agentic.svelte';
	import type { CompactSessionRequest, CompactSessionResponse } from '$lib/types/compact';
	import { toast } from 'svelte-sonner';
	import { modelsStore } from '$lib/stores/models.svelte';

	interface Props {
		role: MessageRole.USER | MessageRole.ASSISTANT;
		justify: 'start' | 'end';
		actionsPosition: 'left' | 'right';
		siblingInfo?: ChatMessageSiblingInfo | null;
		showDeleteDialog: boolean;
		deletionInfo: {
			totalCount: number;
			userMessages: number;
			assistantMessages: number;
			messageTypes: string[];
		} | null;
		onCopy: () => void;
		onEdit?: () => void;
		onRegenerate?: () => void;
		onContinue?: () => void;
		onCompactConversation?: () => void;
		onForkConversation?: (options: { name: string; includeAttachments: boolean }) => void;
		onDelete: () => void;
		onConfirmDelete: () => void;
		onNavigateToSibling?: (siblingId: string) => void;
		onShowDeleteDialogChange: (show: boolean) => void;
		showRawOutputSwitch?: boolean;
		rawOutputEnabled?: boolean;
		onRawOutputToggle?: (enabled: boolean) => void;
	}

	let {
		actionsPosition,
		deletionInfo,
		justify,
		onCopy,
		onEdit,
		onConfirmDelete,
		onContinue,
		onDelete,
		onCompactConversation,
		onForkConversation,
		onNavigateToSibling,
		onShowDeleteDialogChange,
		onRegenerate,
		role,
		siblingInfo = null,
		showDeleteDialog,
		showRawOutputSwitch = false,
		rawOutputEnabled = false,
		onRawOutputToggle
	}: Props = $props();

	let showForkDialog = $state(false);
	let forkName = $state('');
	let forkIncludeAttachments = $state(true);

	let showCompactDialog = $state(false);
	let isCompacting = $state(false);
	let compactAbortController = $state<AbortController | null>(null);

	function handleConfirmDelete() {
		onConfirmDelete();
		onShowDeleteDialogChange(false);
	}

	function handleOpenForkDialog() {
		const conv = activeConversation();

		forkName = `Fork of ${conv?.name ?? 'Conversation'}`;
		forkIncludeAttachments = true;
		showForkDialog = true;
	}

	async function handleCompactSession() {
		if (agenticIsAnyRunning()) {
			toast.error('Cannot compact while the agentic loop is running');
			return;
		}

		if (!activeConversation() || activeMessages().length === 0) {
			toast.error('No messages to compact');
			return;
		}

		const currentConfig = config();
		const anchorCount = currentConfig.anchorMessagesCount ?? 3;
		const messages = activeMessages();

		if (messages.length <= anchorCount) {
			toast.error(`Need more than ${anchorCount} messages to compact`);
			return;
		}

		// Show confirmation dialog
		showCompactDialog = true;
	}

	async function executeCompact() {
		if (isCompacting) return; // Prevent double execution

		const currentConfig = config();
		const anchorCount = currentConfig.anchorMessagesCount ?? 3;

		// Snapshot once — avoids race between validation and slice
		const messages = activeMessages();

		if (messages.length <= anchorCount) {
			toast.error(`Need more than ${anchorCount} messages to compact`);
			showCompactDialog = false;
			return;
		}

		isCompacting = true;
		compactAbortController = new AbortController();

		try {
			// Get messages to compact (all except last N anchor messages)
			const messagesToCompact = messages.slice(0, messages.length - anchorCount);
			const anchorMessages = messages.slice(messages.length - anchorCount);
			const anchorMessageId = anchorMessages[0].id;

			// Convert to API format — preserve tool-call structure for the backend.
			// The compact handler joins messages as "[ROLE]: content", so we keep
			// assistant and tool messages as separate entries with proper OpenAI roles.
			const apiMessages: { role: string; content: string; tool_call_id?: string }[] = [];

			// Detect whether we're compacting for the first time. If the first message
			// in the conversation is a system prompt (not a compaction summary), we
			// skip it from the compacted set so it persists alongside the new summary.
			// On the second+ compaction, the first SYSTEM message will be a prior
			// compaction summary (marked with COMPACTION_SUMMARY extra), so we include
			// it and let the backend produce a unified chained summary.
			const firstMsg = messagesToCompact[0];
			const isFirstSystemPrompt =
				firstMsg?.role === MessageRole.SYSTEM &&
				!firstMsg.extra?.some(
					(e: DatabaseMessageExtra) =>
						e.type === 'COMPACTION_SUMMARY' || e.name === 'compaction_summary'
				);
			const startIndex = isFirstSystemPrompt ? 1 : 0;

			let i = startIndex;
			while (i < messagesToCompact.length) {
				const msg = messagesToCompact[i];
				if (msg.role === MessageRole.TOOL) {
					// Standalone tool message (no preceding assistant — edge case)
					const toolContent = (msg.content || '').trim();
					if (toolContent) {
						apiMessages.push({
							role: 'tool',
							content: toolContent,
							tool_call_id: msg.tool_call_id || ''
						});
					}
					i++;
				} else if (msg.role === MessageRole.ASSISTANT) {
					const parts: string[] = [];
					if (msg.content?.trim()) parts.push(msg.content.trim());

					// Collect consecutive tool messages that follow this assistant message
					let j = i + 1;
					while (j < messagesToCompact.length && messagesToCompact[j].role === MessageRole.TOOL) {
						const toolMsg = messagesToCompact[j];
						const toolContent = (toolMsg.content || '').trim();
						if (toolContent) {
							parts.push(`[Tool: ${toolMsg.tool_call_id || 'unknown'}] ${toolContent}`);
						}
						j++;
					}
					apiMessages.push({ role: msg.role, content: parts.join('\n\n') });
					i = j;
				} else {
					// USER / SYSTEM — plain content
					apiMessages.push({ role: msg.role, content: msg.content || '' });
					i++;
				}
			}

			// If the first message being compacted is a prior compaction summary
			// (identified by the COMPACTION_SUMMARY extra), forward its content so
			// the backend can build a richer chained prompt. On the first compaction,
			// the original system prompt was skipped above, so this will be undefined.
			const firstToCompact = messagesToCompact[startIndex];
			const previousSummary = firstToCompact?.extra?.some(
				(e: DatabaseMessageExtra) =>
					e.type === 'COMPACTION_SUMMARY' || e.name === 'compaction_summary'
			)
				? firstToCompact.content
				: undefined;

			const request: CompactSessionRequest = {
				messages: apiMessages,
				anchorMessagesCount: anchorCount,
				model: modelsStore.selectedModelName || undefined,
				previousSummary
			};

			const response = await apiPost<CompactSessionResponse>('/compact', request, {
				signal: compactAbortController.signal
			});

			// Compact the session in the store
			const result = await conversationsStore.compactSession(
				response.summary,
				messagesToCompact,
				anchorMessageId,
				response.tokensSaved
			);

			if (result.success) {
				toast.success(
					`Session compacted, ~${response.tokensSaved.toLocaleString()} estimated tokens saved`
				);
			} else {
				toast.error(`Failed to compact: ${result.error}`);
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				toast.info('Compaction cancelled');
			} else {
				console.error('Compact session error:', error);
				const errorMessage = error instanceof Error ? error.message : 'Failed to compact session';
				toast.error(errorMessage);
			}
		} finally {
			isCompacting = false;
			compactAbortController = null;
			showCompactDialog = false;
		}
	}

	function handleConfirmFork() {
		onForkConversation?.({ name: forkName.trim(), includeAttachments: forkIncludeAttachments });
		showForkDialog = false;
	}
</script>

<div class="relative {justify === 'start' ? 'mt-2' : ''} flex h-6 items-center justify-between">
	<div
		class="{actionsPosition === 'left'
			? 'left-0'
			: 'right-0'} flex items-center gap-2 opacity-100 transition-opacity"
	>
		{#if siblingInfo && siblingInfo.totalSiblings > 1}
			<ChatMessageBranchingControls {siblingInfo} {onNavigateToSibling} />
		{/if}

		<div
			class="pointer-events-auto inset-0 flex items-center gap-1 opacity-100 transition-all duration-150"
		>
			<ActionIcon icon={Copy} tooltip="Copy" onclick={onCopy} />

			<!-- BUGGY rn, workaround currently being per-turn edit for assistant messages, no universal one-->
			{#if onEdit && role !== MessageRole.ASSISTANT}
				<ActionIcon icon={Edit} tooltip="Edit" onclick={onEdit} />
			{/if}

			{#if role === MessageRole.ASSISTANT && onRegenerate}
				<ActionIcon icon={RefreshCw} tooltip="Regenerate" onclick={() => onRegenerate()} />
			{/if}

			{#if role === MessageRole.ASSISTANT && onContinue}
				<ActionIcon icon={ArrowRight} tooltip="Continue" onclick={onContinue} />
			{/if}

			{#if onForkConversation}
				<ActionIcon icon={GitBranch} tooltip="Fork conversation" onclick={handleOpenForkDialog} />
			{/if}

			{#if onCompactConversation}
				<ActionIcon icon={Package} tooltip="Compact session" onclick={handleCompactSession} />
			{/if}

			<ActionIcon icon={Trash2} tooltip="Delete" onclick={onDelete} />
		</div>
	</div>

	{#if showRawOutputSwitch}
		<div class="flex items-center gap-2">
			<span class="text-xs text-muted-foreground">Show raw output</span>
			<Switch
				checked={rawOutputEnabled}
				onCheckedChange={(checked) => onRawOutputToggle?.(checked)}
			/>
		</div>
	{/if}
</div>

<DialogConfirmation
	bind:open={showDeleteDialog}
	title="Delete Message"
	description={deletionInfo && deletionInfo.totalCount > 1
		? `This will delete ${deletionInfo.totalCount} messages including: ${deletionInfo.userMessages} user message${deletionInfo.userMessages > 1 ? 's' : ''} and ${deletionInfo.assistantMessages} assistant response${deletionInfo.assistantMessages > 1 ? 's' : ''}. All messages in this branch and their responses will be permanently removed. This action cannot be undone.`
		: 'Are you sure you want to delete this message? This action cannot be undone.'}
	confirmText={deletionInfo && deletionInfo.totalCount > 1
		? `Delete ${deletionInfo.totalCount} Messages`
		: 'Delete'}
	cancelText="Cancel"
	variant="destructive"
	icon={Trash2}
	onConfirm={handleConfirmDelete}
	onCancel={() => onShowDeleteDialogChange(false)}
/>

<DialogConfirmation
	bind:open={showForkDialog}
	title="Fork Conversation"
	description="Create a new conversation branching from this message."
	confirmText="Fork"
	cancelText="Cancel"
	icon={GitBranch}
	onConfirm={handleConfirmFork}
	onCancel={() => (showForkDialog = false)}
>
	<div class="flex flex-col gap-4 py-2">
		<div class="flex flex-col gap-2">
			<Label for="fork-name">Title</Label>

			<Input
				id="fork-name"
				class="text-foreground"
				placeholder="Enter fork name"
				type="text"
				bind:value={forkName}
			/>
		</div>

		<div class="flex items-center gap-2">
			<Checkbox
				id="fork-attachments"
				checked={forkIncludeAttachments}
				onCheckedChange={(checked) => {
					forkIncludeAttachments = checked === true;
				}}
			/>

			<Label for="fork-attachments" class="cursor-pointer text-sm font-normal">
				Include all attachments
			</Label>
		</div>
	</div>
</DialogConfirmation>

<DialogConfirmation
	bind:open={showCompactDialog}
	title="Compact Session"
	description={isCompacting
		? 'Compacting conversation history... This may take up to a minute.'
		: `This will summarize all messages except the last ${config().anchorMessagesCount ?? 3} messages. Older messages will be replaced with a concise summary. This action cannot be undone.`}
	confirmText={isCompacting ? 'Compacting...' : 'Compact'}
	cancelText={isCompacting ? 'Cancel' : 'Cancel'}
	icon={isCompacting ? Loader2 : Package}
	onConfirm={executeCompact}
	onCancel={() => {
		if (isCompacting && compactAbortController) {
			compactAbortController.abort();
		} else {
			showCompactDialog = false;
		}
	}}
	disabled={isCompacting}
	disabledCancel={false}
>
	{#if isCompacting}
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<Loader2 class="h-4 w-4 animate-spin" />
			<span>Generating summary...</span>
		</div>
	{/if}
</DialogConfirmation>
