<script lang="ts">
	import { fadeInView } from '$lib/actions/fade-in-view.svelte';
	import { ChatMessage, CompactionNote } from '$lib/components/app';
	import { setChatActionsContext } from '$lib/contexts';
	import { MessageRole } from '$lib/enums';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { conversationsStore, activeConversation } from '$lib/stores/conversations.svelte';
	import { config } from '$lib/stores/settings.svelte';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import {
		copyToClipboard,
		formatMessageForClipboard,
		formatAgenticTurn,
		getMessageSiblings,
		hasAgenticContent
	} from '$lib/utils';

	interface Props {
		class?: string;
		messages?: DatabaseMessage[];
		onUserAction?: () => void;
	}

	let { class: className, messages = [], onUserAction }: Props = $props();

	let allConversationMessages = $state<DatabaseMessage[]>([]);
	const currentConfig = config();

	setChatActionsContext({
		copy: async (message: DatabaseMessage, toolMessages: DatabaseMessage[] = []) => {
			let clipboardContent: string;
			if (toolMessages.length > 0 || message.toolCalls) {
				clipboardContent = formatAgenticTurn(message, toolMessages);
			} else {
				const asPlainText = Boolean(currentConfig.copyTextAttachmentsAsPlainText);
				clipboardContent = formatMessageForClipboard(message.content, message.extra, asPlainText);
			}
			await copyToClipboard(clipboardContent, 'Message copied to clipboard');
		},

		delete: async (message: DatabaseMessage) => {
			await chatStore.deleteMessage(message.id);
			refreshAllMessages();
		},

		navigateToSibling: async (siblingId: string) => {
			await conversationsStore.navigateToSibling(siblingId);
		},

		editWithBranching: async (
			message: DatabaseMessage,
			newContent: string,
			newExtras?: DatabaseMessageExtra[]
		) => {
			onUserAction?.();
			await chatStore.editMessageWithBranching(message.id, newContent, newExtras);
			refreshAllMessages();
		},

		editWithReplacement: async (
			message: DatabaseMessage,
			newContent: string,
			shouldBranch: boolean
		) => {
			onUserAction?.();
			await chatStore.editAssistantMessage(message.id, newContent, shouldBranch);
			refreshAllMessages();
		},

		editUserMessagePreserveResponses: async (
			message: DatabaseMessage,
			newContent: string,
			newExtras?: DatabaseMessageExtra[]
		) => {
			onUserAction?.();
			await chatStore.editUserMessagePreserveResponses(message.id, newContent, newExtras);
			refreshAllMessages();
		},

		regenerateWithBranching: async (message: DatabaseMessage, modelOverride?: string) => {
			onUserAction?.();
			await chatStore.regenerateMessageWithBranching(message.id, modelOverride);
			refreshAllMessages();
		},

		continueAssistantMessage: async (message: DatabaseMessage) => {
			onUserAction?.();
			await chatStore.continueAssistantMessage(message.id);
			refreshAllMessages();
		},

		forkConversation: async (
			message: DatabaseMessage,
			options: { name: string; includeAttachments: boolean }
		) => {
			await conversationsStore.forkConversation(message.id, options);
		}
	});

	function refreshAllMessages() {
		const conversation = activeConversation();

		if (conversation) {
			conversationsStore.getConversationMessages(conversation.id).then((messages) => {
				allConversationMessages = messages;
			});
		} else {
			allConversationMessages = [];
		}
	}

	// Single effect that tracks both conversation and message changes
	$effect(() => {
		const conversation = activeConversation();

		if (conversation) {
			refreshAllMessages();
		}
	});

	// Reset compaction token after messages change (give UI time to render the note)
	$effect(() => {
		if (conversationsStore.lastCompactionTokensSaved !== null && messages.length > 0) {
			const timer = setTimeout(() => {
				conversationsStore.lastCompactionTokensSaved = null;
			}, 5000);
			return () => clearTimeout(timer);
		}
	});

	let displayMessages = $derived.by(() => {
		if (!messages.length) {
			return {
				result: [] as Array<{
					message: DatabaseMessage;
					toolMessages: DatabaseMessage[];
					isLastAssistantMessage: boolean;
					siblingInfo: ChatMessageSiblingInfo;
				}>,
				systemMessageBeforeDisplayIndex: new Map<number, number>()
			};
		}

		const filteredMessages = currentConfig.showSystemMessage
			? messages
			: messages.filter((msg) => msg.type !== MessageRole.SYSTEM);

		// Build a set of indices in filteredMessages where a system/compaction message
		// was removed from the original messages array. These act as boundaries so
		// agentic grouping doesn't cross compaction points.
		const boundaryIndices = new SvelteSet<number>();
		if (!currentConfig.showSystemMessage) {
			let filteredIdx = 0;
			for (let i = 0; i < messages.length; i++) {
				if (messages[i].type === MessageRole.SYSTEM) {
					// The position in filteredMessages where this system message would be
					// is the current filteredIdx. Messages after it start at filteredIdx.
					boundaryIndices.add(filteredIdx);
				} else {
					filteredIdx++;
				}
			}
		}

		// Build display entries, grouping agentic sessions into single entries.
		// An agentic session = assistant(with tool_calls) → tool → assistant → tool → ... → assistant(final)
		const result: Array<{
			message: DatabaseMessage;
			toolMessages: DatabaseMessage[];
			isLastAssistantMessage: boolean;
			siblingInfo: ChatMessageSiblingInfo;
		}> = [];

		for (let i = 0; i < filteredMessages.length; i++) {
			const msg = filteredMessages[i];

			// Skip tool messages - they're grouped with preceding assistant
			if (msg.role === MessageRole.TOOL) continue;

			const toolMessages: DatabaseMessage[] = [];
			if (msg.role === MessageRole.ASSISTANT && hasAgenticContent(msg)) {
				let j = i + 1;

				while (j < filteredMessages.length) {
					// Stop grouping if we hit a boundary (system/compaction summary was here)
					if (boundaryIndices.has(j)) {
						break;
					}

					const next = filteredMessages[j];

					if (next.role === MessageRole.TOOL) {
						toolMessages.push(next);

						j++;
					} else if (next.role === MessageRole.ASSISTANT) {
						toolMessages.push(next);

						j++;
					} else {
						break;
					}
				}

				i = j - 1;
			} else if (msg.role === MessageRole.ASSISTANT) {
				let j = i + 1;

				while (j < filteredMessages.length && filteredMessages[j].role === MessageRole.TOOL) {
					// Stop if next tool message is across a boundary
					if (boundaryIndices.has(j)) break;
					toolMessages.push(filteredMessages[j]);
					j++;
				}
			}

			const siblingInfo = getMessageSiblings(allConversationMessages, msg.id);

			result.push({
				message: msg,
				toolMessages,
				isLastAssistantMessage: false,
				siblingInfo: siblingInfo || {
					message: msg,
					siblingIds: [msg.id],
					currentIndex: 0,
					totalSiblings: 1
				}
			});
		}

		// Mark the last assistant message
		for (let i = result.length - 1; i >= 0; i--) {
			if (result[i].message.role === MessageRole.ASSISTANT) {
				result[i].isLastAssistantMessage = true;
				break;
			}
		}

		// Determine which display entry index comes right before each system message
		// (by position in the original messages array). This is used for placing the
		// CompactionNote after the correct message when system messages are hidden.
		const systemMessageBeforeDisplayIndex = new SvelteMap<number, number>();
		if (!currentConfig.showSystemMessage) {
			let displayIdx = 0;
			for (let i = 0; i < messages.length; i++) {
				if (messages[i].type === MessageRole.SYSTEM) {
					// The display entry just before this system message is at displayIdx - 1
					// (displayIdx hasn't been incremented yet for this system message)
					systemMessageBeforeDisplayIndex.set(i, displayIdx - 1);
				} else {
					displayIdx++;
				}
			}
		}

		return { result, systemMessageBeforeDisplayIndex };
	});

	// Find the system message that should trigger a CompactionNote
	let compactionNoteDisplayIndex = $derived.by(() => {
		if (conversationsStore.lastCompactionTokensSaved === null) return -1;
		if (currentConfig.showSystemMessage) return -1;

		const sysInfo = displayMessages.systemMessageBeforeDisplayIndex;
		// Find the most recent system message (compaction summary) in the messages array
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].type === MessageRole.SYSTEM) {
				return sysInfo.get(i) ?? -1;
			}
		}
		return -1;
	});
</script>

<div
	class="flex h-full flex-col space-y-10 pt-24 {className}"
	style="height: auto; min-height: calc(100dvh - 14rem);"
>
	{#each displayMessages.result as { message, toolMessages, isLastAssistantMessage, siblingInfo }, index (message.id)}
		<div use:fadeInView>
			<ChatMessage
				class="mx-auto w-full max-w-[48rem]"
				{message}
				{toolMessages}
				{isLastAssistantMessage}
				{siblingInfo}
			/>
		</div>

		{#if currentConfig.showSystemMessage}
			<!-- When system messages are visible, show compaction note after system summary messages -->
			{#if message.role === MessageRole.SYSTEM && message.type === 'system' && conversationsStore.lastCompactionTokensSaved !== null}
				{@const tokensSaved = conversationsStore.lastCompactionTokensSaved}
				<CompactionNote {tokensSaved} />
			{/if}
		{:else}
			<!-- When system messages are hidden, show compaction note after the message preceding the system summary -->
			{#if index === compactionNoteDisplayIndex && conversationsStore.lastCompactionTokensSaved !== null}
				{@const tokensSaved = conversationsStore.lastCompactionTokensSaved}
				<CompactionNote {tokensSaved} />
			{/if}
		{/if}
	{/each}
</div>
