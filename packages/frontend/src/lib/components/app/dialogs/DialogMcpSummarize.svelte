<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		subscribePendingRequest,
		resolveRequest,
		getAllPendingRequests,
		summarizeToolOutput,
		type PendingSummarizeRequest
	} from '$lib/services/mcp-summarize-harness';
	import {
		FileText,
		Sparkles,
		ChevronDown,
		ChevronUp,
		AlertTriangle,
		Loader2
	} from '@lucide/svelte';
	import { config } from '$lib/stores/settings.svelte';
	import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';

	let pendingRequests = $state<PendingSummarizeRequest[]>([]);
	let isSummarizing = $state(false);
	let showFullPreview = $state(false);
	let countdown = $state(0);
	let countdownTimer: ReturnType<typeof setInterval> | null = null;

	let settings = $derived(config());
	let threshold = $derived(
		((n) => (Number.isNaN(n) ? 400 : n))(Number(settings.mcpSummarizeLineThreshold))
	);
	let autoTimeoutSeconds = $derived(
		((n) => (Number.isNaN(n) ? 0 : Math.max(0, n)))(Number(settings.mcpSummarizeAutoTimeout))
	);
	let isSubagentConfigured = $derived(subagentConfigStore.isConfigured);

	let currentRequest = $derived(pendingRequests[0] ?? null);
	let pendingCount = $derived(pendingRequests.length);
	let hasMorePending = $derived(pendingRequests.length > 1);

	$effect(() => {
		return subscribePendingRequest((req) => {
			untrack(() => {
				if (req) {
					const existingIds = new Set(pendingRequests.map((r) => r.id));
					if (!existingIds.has(req.id)) {
						pendingRequests = [...pendingRequests, req];
					}
				} else {
					pendingRequests = getAllPendingRequests();
				}
			});
		});
	});

	$effect(() => {
		if (!currentRequest || autoTimeoutSeconds <= 0) {
			countdown = 0;
			if (countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}
			return;
		}
		if (countdownTimer) return;
		countdown = autoTimeoutSeconds;
		countdownTimer = setInterval(() => {
			if (isSummarizing) return;
			countdown -= 1;
			if (countdown <= 0) {
				if (countdownTimer) {
					clearInterval(countdownTimer);
					countdownTimer = null;
				}
				handleKeepRaw();
			}
		}, 1000);
		return () => {
			if (countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}
		};
	});

	function handleKeepRaw() {
		if (currentRequest) {
			const req = currentRequest;
			pendingRequests = pendingRequests.filter((r) => r.id !== req.id);
			resolveRequest(req.id, false);
		}
	}

	async function handleSummarize() {
		const req = currentRequest;
		if (!req) return;
		isSummarizing = true;
		try {
			const summary = await summarizeToolOutput(req.rawOutput);
			pendingRequests = pendingRequests.filter((r) => r.id !== req.id);
			resolveRequest(req.id, summary ?? false);
		} finally {
			isSummarizing = false;
		}
	}

	function handleDialogOpenChange(open: boolean) {
		if (!open && currentRequest) {
			const req = currentRequest;
			pendingRequests = pendingRequests.filter((r) => r.id !== req.id);
			resolveRequest(req.id, false);
		}
	}

	function openSubagentSettings() {
		goto('#/settings/connection');
	}

	function lineCountLabel(count: number): string {
		return `${count.toLocaleString()} lines`;
	}

	const PREVIEW_LINES = 6;
	const PREVIEW_CHARS = 300;

	function previewSnippet(text: string): string {
		const lines = text.split('\n');
		const preview = lines.slice(0, PREVIEW_LINES).join('\n');
		return preview.length > PREVIEW_CHARS ? preview.slice(0, PREVIEW_CHARS) + '…' : preview;
	}

	let hasMore = $derived.by(() => {
		if (!currentRequest) return false;
		const lines = currentRequest.rawOutput.split('\n');
		const preview = lines.slice(0, PREVIEW_LINES).join('\n');
		return lines.length > PREVIEW_LINES || preview.length > PREVIEW_CHARS;
	});
</script>

{#if currentRequest}
	<Dialog.Root open={!!currentRequest} onOpenChange={handleDialogOpenChange}>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/30" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg"
		>
			<div class="space-y-1">
				<Dialog.Title class="text-lg font-semibold">Long tool output detected</Dialog.Title>
				<Dialog.Description class="text-sm text-muted-foreground">
					<span class="font-mono text-xs font-medium text-foreground"
						>{currentRequest.toolName || 'unknown tool'}</span
					>
					returned {lineCountLabel(currentRequest.lineCount)} (soft threshold: {threshold} lines, hard
					cap: {currentRequest.hardCap >= 0 ? currentRequest.hardCap : 'disabled'} lines).
					{#if hasMorePending}
						<span class="ml-1 text-amber-600 dark:text-amber-400">
							({pendingCount - 1} more pending)
						</span>
					{/if}
				</Dialog.Description>
			</div>

			<!-- Output preview with expand/collapse -->
			<div class="rounded-md border bg-muted/30 p-3">
				<pre
					class="font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground {showFullPreview
						? 'max-h-64 overflow-y-auto'
						: ''}">{showFullPreview
						? currentRequest.rawOutput
						: previewSnippet(currentRequest.rawOutput)}</pre>
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
						<button
							type="button"
							class="underline underline-offset-2 hover:no-underline"
							onclick={openSubagentSettings}
						>
							Configure it in Connection settings.
						</button>
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
					{#if countdown > 0}
						<span class="ml-1 text-xs text-muted-foreground tabular-nums">({countdown}s)</span>
					{/if}
				</button>
				<button
					type="button"
					class="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					onclick={handleSummarize}
					disabled={isSummarizing}
				>
					{#if isSummarizing}
						<Loader2 class="h-4 w-4 animate-spin" />
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
