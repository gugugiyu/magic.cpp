<script lang="ts">
	import { Edit, Copy, RefreshCw, Trash2, ArrowRight, GitBranch, Package } from '@lucide/svelte';
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
	import {
		activeConversation,
		conversationsStore,
		activeMessages
	} from '$lib/stores/conversations.svelte';
	import { config } from '$lib/stores/settings.svelte';
	import { apiPost } from '$lib/utils/api-fetch';
	import type { CompactSessionRequest, CompactSessionResponse } from '$lib/types/compact';
	import { toast } from 'svelte-sonner';
	import { formatAgenticTurn } from '$lib/utils/formatters';

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
		const messages = activeMessages();

		if (messages.length <= anchorCount) {
			toast.error(`Need more than ${anchorCount} messages to compact`);
			showCompactDialog = false;
			return;
		}

		isCompacting = true;

		try {
			// Get messages to compact (all except last N anchor messages)
			const messagesToCompact = messages.slice(0, messages.length - anchorCount);
			const anchorMessages = messages.slice(messages.length - anchorCount);
			const anchorMessageId = anchorMessages[0].id;

			// Detect a previous compaction summary (system-type message) and exclude it
			// from the messages sent for summarization, but include it as chained context.
			let previousSummary: string | undefined;
			const messagesForApi: typeof messagesToCompact = [];
			for (const msg of messagesToCompact) {
				if (msg.type === 'system' && msg.role === MessageRole.SYSTEM) {
					// This is likely a previous compaction summary
					previousSummary = msg.content || undefined;
				} else {
					messagesForApi.push(msg);
				}
			}

			// Convert to API format, pairing each assistant message with its following tool messages
			// so tool results are included. TOOL-role messages are skipped as standalone entries.
			const apiMessages: { role: string; content: string }[] = [];
			let i = 0;
			while (i < messagesForApi.length) {
				const msg = messagesForApi[i];
				if (msg.role === MessageRole.TOOL) {
					// Handled as part of the preceding assistant message
					i++;
					continue;
				}
				if (msg.role === MessageRole.ASSISTANT) {
					// Collect consecutive tool messages that follow this assistant message
					const toolMsgs: DatabaseMessage[] = [];
					let j = i + 1;
					while (j < messagesForApi.length && messagesForApi[j].role === MessageRole.TOOL) {
						toolMsgs.push(messagesForApi[j]);
						j++;
					}
					apiMessages.push({ role: msg.role, content: formatAgenticTurn(msg, toolMsgs) });
					i = j;
				} else {
					// USER / SYSTEM — plain content
					apiMessages.push({ role: msg.role, content: msg.content || '' });
					i++;
				}
			}

			const request: CompactSessionRequest = {
				messages: apiMessages,
				anchorMessagesCount: anchorCount,
				previousSummary
			};

			const response = await apiPost<CompactSessionResponse>('/compact', request);

			// Compact the session in the store
			const result = await conversationsStore.compactSession(
				response.summary,
				messagesToCompact,
				anchorMessageId,
				response.tokensSaved
			);

			if (result.success) {
				toast.success(`Session compacted, ${response.tokensSaved.toLocaleString()} tokens saved`);
			} else {
				toast.error(`Failed to compact: ${result.error}`);
			}
		} catch (error) {
			console.error('Compact session error:', error);
			const errorMessage = error instanceof Error ? error.message : 'Failed to compact session';
			toast.error(errorMessage);
		} finally {
			isCompacting = false;
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
		? 'Compacting conversation history...'
		: `This will summarize all messages except the last ${config().anchorMessagesCount ?? 3} messages. Older messages will be replaced with a concise summary. This action cannot be undone.`}
	confirmText={isCompacting ? 'Compacting...' : 'Compact'}
	cancelText="Cancel"
	icon={Package}
	onConfirm={executeCompact}
	onCancel={() => (showCompactDialog = false)}
	disabled={isCompacting}
/>
