<script lang="ts">
	import { page } from '$app/state';
	import { X, Loader2, Pencil } from '@lucide/svelte';
	import { fly, fade } from 'svelte/transition';
	import { cn } from '$lib/components/ui/utils';
	import { sequentialThinkingStore } from '$lib/stores/sequential-thinking.svelte';
	import { agenticStreamingToolCall } from '$lib/stores/agentic.svelte';
	import { isChatStreaming } from '$lib/stores/chat.svelte';
	import { config } from '$lib/stores/settings.svelte';
	import { countWords, truncateToWords } from '$lib/utils/text';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open = $bindable(false), onClose }: Props = $props();

	let expandedSteps = $state<Set<string>>(new Set());
	let editingKey = $state<string | null>(null);
	let editingText = $state('');
	let scrollContainer = $state<HTMLDivElement | undefined>(undefined);

	const DEFAULT_VISIBLE_WORDS = 110;

	function stepKey(messageId: string, stepIndex: number): string {
		return `${messageId}-${stepIndex}`;
	}

	function toggleExpanded(key: string) {
		if (expandedSteps.has(key)) {
			expandedSteps.delete(key);
		} else {
			expandedSteps.add(key);
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	let currentChatId = $derived(page.params.id);
	let isSequentialThinkingEnabled = $derived(config().builtinToolSequentialThinking);
	let streamingActive = $derived(isChatStreaming());
	let streamingCall = $derived(currentChatId ? agenticStreamingToolCall(currentChatId) : null);

	// Detect "Model is reasoning..." state: no thoughts in store yet, but streaming a sequential_thinking call
	const isModelReasoning = $derived.by(() => {
		if (!currentChatId) return false;
		const turns = sequentialThinkingStore.getTurnsForConversation(currentChatId);
		const hasAnyThoughts = turns.some((t) => t.thoughts.length > 0);
		if (hasAnyThoughts) return false;
		if (!streamingActive) return false;
		return streamingCall?.name === 'sequential_thinking';
	});

	let allTurns = $derived.by(() => {
		if (!currentChatId) return [];
		return sequentialThinkingStore.getTurnsForConversation(currentChatId);
	});

	let allStepsFlat = $derived(allTurns.flatMap((t) => t.thoughts));

	// Auto-scroll to bottom when new steps are added
	$effect(() => {
		if (allStepsFlat.length > 0 && scrollContainer) {
			scrollContainer.scrollTo({
				top: scrollContainer.scrollHeight,
				behavior: 'smooth'
			});
		}
	});

	function startEdit(key: string, currentText: string) {
		editingKey = key;
		editingText = currentText.trim();
	}

	function cancelEdit() {
		editingKey = null;
		editingText = '';
	}

	function saveEdit(messageId: string, thoughtIndex: number) {
		if (!currentChatId || !editingText.trim()) return;
		sequentialThinkingStore.updateThought(
			currentChatId,
			messageId,
			thoughtIndex,
			editingText.trim()
		);
		editingKey = null;
		editingText = '';
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-999 bg-black/30 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-label="Reasoning History"
		tabindex="-1"
		transition:fade={{ duration: 200 }}
		onclick={handleOverlayClick}
		onkeydown={handleKeydown}
	>
		<div
			class={cn(
				'fixed inset-y-0 left-0 z-50 flex flex-col shadow-lg',
				'w-3/4 max-w-sm border-r bg-background/95 backdrop-blur-md'
			)}
			transition:fly={{ x: -320, duration: 300, opacity: 1 }}
		>
			<div class="flex items-center justify-between border-b px-4 py-4">
				<h2 class="text-sm font-semibold">Reasoning History</h2>
				<button
					onclick={onClose}
					class="rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden"
				>
					<X class="h-4 w-4" />
					<span class="sr-only">Close</span>
				</button>
			</div>

			<div bind:this={scrollContainer} class="flex-1 overflow-y-auto px-4 py-4">
				{#if !isSequentialThinkingEnabled}
					<p class="text-sm text-muted-foreground">
						Sequential thinking is disabled. Enable it in Settings → MCP → Built-in Tools.
					</p>
				{:else if isModelReasoning}
					<div class="flex items-center gap-2 py-4">
						<Loader2 class="h-4 w-4 animate-spin text-primary" />
						<p class="animate-pulse text-sm text-primary">Model is reasoning...</p>
					</div>
				{:else if allTurns.length === 0}
					<p class="text-sm text-muted-foreground">No reasoning steps recorded yet.</p>
				{:else}
					<div class="space-y-6">
						{#each allTurns as turn (turn.messageId)}
							<div
								class="rounded-lg border border-border/50 bg-muted/20 p-3"
								in:fly={{ y: 10, duration: 250 }}
							>
								<div class="mb-3 flex items-center gap-2">
									<span class="text-xs font-semibold text-primary"
										>Message {turn.messageId.slice(0, 8)}</span
									>
									<span class="text-xs text-muted-foreground">
										— {turn.thoughts.length}
										{turn.thoughts.length === 1 ? 'step' : 'steps'}
									</span>
								</div>
								<ul class="space-y-3">
									{#each turn.thoughts as step, i (i)}
										{@const key = stepKey(turn.messageId, i)}
										{@const wordCount = countWords(step.thought)}
										{@const isExpanded = expandedSteps.has(key)}
										{@const truncatedText = truncateToWords(step.thought, DEFAULT_VISIBLE_WORDS)}
										{@const hasMore = wordCount > DEFAULT_VISIBLE_WORDS}
										{@const duration = step.startedAt
											? (step.completedAt ?? 0) - step.startedAt
											: 0}
										<li class="flex gap-3 text-sm" in:fly={{ y: 15, duration: 250, delay: i * 40 }}>
											<span
												class="mt-0.5 shrink-0 text-xs font-medium text-muted-foreground tabular-nums"
											>
												{i + 1}.
											</span>
											<div class="flex-1">
												{#if editingKey === key}
													<textarea
														class="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-relaxed text-foreground focus:ring-1 focus:ring-ring focus:outline-none"
														rows={6}
														bind:value={editingText}
														onkeydown={(e) => {
															if (e.key === 'Escape') cancelEdit();
															if (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
																saveEdit(turn.messageId, i);
														}}
													></textarea>
													<div class="mt-1.5 flex items-center gap-3">
														<button
															onclick={() => saveEdit(turn.messageId, i)}
															class="text-xs font-medium text-primary hover:underline"
														>
															Save
														</button>
														<button
															onclick={cancelEdit}
															class="text-xs text-muted-foreground hover:underline"
														>
															Cancel
														</button>
														<span class="text-xs text-muted-foreground/50">Ctrl+Enter to save</span>
													</div>
												{:else}
													<p class="leading-relaxed text-muted-foreground">
														{isExpanded ? step.thought.trim() : truncatedText}
													</p>
													<div class="mt-1 flex items-center gap-3">
														{#if hasMore}
															<button
																onclick={() => toggleExpanded(key)}
																class="text-xs font-medium text-primary hover:underline"
															>
																{isExpanded ? 'Collapse' : 'Read more →'}
															</button>
														{/if}
														{#if duration > 0}
															<span class="text-xs text-muted-foreground/60 tabular-nums">
																{formatDuration(duration)}
															</span>
														{/if}
														{#if !streamingActive}
															<button
																onclick={() => startEdit(key, step.thought)}
																class="ml-auto text-muted-foreground/40 transition-colors hover:text-muted-foreground"
																aria-label="Edit thought"
															>
																<Pencil class="h-3 w-3" />
															</button>
														{/if}
													</div>
												{/if}
											</div>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
