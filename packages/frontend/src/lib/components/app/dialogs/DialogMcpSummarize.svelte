<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		subscribePendingRequest,
		resolveRequest,
		summarizeToolOutput,
		type PendingSummarizeRequest
	} from '$lib/services/mcp-summarize-harness';
	import { FileText, Sparkles, X, ChevronDown, ChevronUp, AlertTriangle } from '@lucide/svelte';
	import { config } from '$lib/stores/settings.svelte';
	import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
	import { getChatSettingsDialogContext } from '$lib/contexts/chat-settings-dialog.context';
	import { SETTINGS_SECTION_TITLES } from '$lib/constants';

	let pendingRequest = $state<PendingSummarizeRequest | null>(null);
	let isSummarizing = $state(false);
	let showFullPreview = $state(false);

	let settings = $derived(config());
	let threshold = $derived(
		((n) => (Number.isNaN(n) ? 400 : n))(Number(settings.mcpSummarizeWordThreshold))
	);
	let isSubagentConfigured = $derived(subagentConfigStore.isConfigured);

	let chatSettingsDialog = $state<ReturnType<typeof getChatSettingsDialogContext> | null>(null);
	try {
		chatSettingsDialog = getChatSettingsDialogContext();
	} catch {
		// context not available outside chat route
	}

	$effect(() => {
		return subscribePendingRequest((req) => {
			pendingRequest = req;
			// Reset state when a new request arrives
			if (req) {
				isSummarizing = false;
				showFullPreview = false;
			}
		});
	});

	function handleCancel() {
		if (pendingRequest) {
			resolveRequest(pendingRequest.id, 'cancel');
		}
	}

	function handleKeepRaw() {
		if (pendingRequest) {
			resolveRequest(pendingRequest.id, false);
		}
	}

	async function handleSummarize() {
		if (!pendingRequest) return;
		isSummarizing = true;
		try {
			const summary = await summarizeToolOutput(pendingRequest.rawOutput);
			resolveRequest(pendingRequest.id, summary ?? false);
		} finally {
			isSummarizing = false;
		}
	}

	function openSubagentSettings() {
		chatSettingsDialog?.open(SETTINGS_SECTION_TITLES.CONNECTION);
	}

	function wordCountLabel(count: number): string {
		return `${count.toLocaleString()} words`;
	}

	const PREVIEW_LINES = 6;
	const PREVIEW_CHARS = 300;

	function previewSnippet(text: string): string {
		const lines = text.split('\n');
		const preview = lines.slice(0, PREVIEW_LINES).join('\n');
		return preview.length > PREVIEW_CHARS ? preview.slice(0, PREVIEW_CHARS) + '…' : preview;
	}

	let hasMore = $derived.by(() => {
		if (!pendingRequest) return false;
		const lines = pendingRequest.rawOutput.split('\n');
		const preview = lines.slice(0, PREVIEW_LINES).join('\n');
		return lines.length > PREVIEW_LINES || preview.length > PREVIEW_CHARS;
	});
</script>

{#if pendingRequest}
	<Dialog.Root open onOpenChange={() => {}}>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/30" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg"
		>
			<!-- Header with X cancel button -->
			<div class="flex items-start justify-between gap-2">
				<div class="space-y-1">
					<Dialog.Title class="text-lg font-semibold">Long tool output detected</Dialog.Title>
					<Dialog.Description class="text-sm text-muted-foreground">
						<span class="font-mono text-xs font-medium text-foreground"
							>{pendingRequest.toolName}</span
						>
						returned {wordCountLabel(pendingRequest.wordCount)} (soft threshold: {threshold} words, hard
						cap: {pendingRequest.hardCap >= 0 ? pendingRequest.hardCap : 'disabled'} words).
					</Dialog.Description>
				</div>
				<button
					type="button"
					class="rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none"
					aria-label="Cancel agentic loop"
					onclick={handleCancel}
					disabled={isSummarizing}
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Output preview with expand/collapse -->
			<div class="rounded-md border bg-muted/30 p-3">
				<pre
					class="font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground {showFullPreview
						? 'max-h-64 overflow-y-auto'
						: ''}">{showFullPreview
						? pendingRequest.rawOutput
						: previewSnippet(pendingRequest.rawOutput)}</pre>
				{#if hasMore}
					<button
						type="button"
						class="mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
						onclick={() => (showFullPreview = !showFullPreview)}
					>
						{#if showFullPreview}
							<ChevronUp class="h-3 w-3" />
							Show less
						{:else}
							<ChevronDown class="h-3 w-3" />
							Show more…
						{/if}
					</button>
				{/if}
			</div>

			<!-- Subagent warning if not configured -->
			{#if !isSubagentConfigured}
				<div
					class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-600 dark:text-amber-400"
				>
					<AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>
						Subagent endpoint not configured — auto-summarize will not work.
						{#if chatSettingsDialog}
							<button
								type="button"
								class="underline underline-offset-2 hover:no-underline"
								onclick={openSubagentSettings}
							>
								Configure it in Connection settings.
							</button>
						{/if}
					</span>
				</div>
			{/if}

			<!-- Action buttons -->
			<div class="flex gap-3">
				<button
					type="button"
					class="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
					onclick={handleKeepRaw}
					disabled={isSummarizing}
				>
					<FileText class="h-4 w-4" />
					Keep raw output
				</button>
				<button
					type="button"
					class="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					onclick={handleSummarize}
					disabled={isSummarizing}
				>
					{#if isSummarizing}
						<svg
							class="h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							></path>
						</svg>
						Summarizing…
					{:else}
						<Sparkles class="h-4 w-4" />
						Auto-summarize
					{/if}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
