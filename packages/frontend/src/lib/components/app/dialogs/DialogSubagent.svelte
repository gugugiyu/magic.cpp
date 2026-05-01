<script lang="ts" module>
	import { Button } from '$lib/components/ui/button';
</script>

<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { DatabaseService } from '$lib/services/database.service';
	import { subagentSessionStore } from '$lib/stores/subagent-session.svelte';
	import { MarkdownContent, SyntaxHighlightedCode } from '$lib/components/app';
	import { FileTypeText, MessageRole } from '$lib/enums';
	import { formatJsonPretty } from '$lib/utils';
	import {
		Bot,
		Loader2,
		CheckCircle,
		AlertCircle,
		Terminal,
		ArrowLeft,
		Activity
	} from '@lucide/svelte';
	import type { DatabaseMessage } from '$lib/types/database';

	interface Props {
		open?: boolean;
		conversationId: string;
		initialSessionId?: string;
	}

	let { open = $bindable(false), conversationId, initialSessionId }: Props = $props();

	// Session list state (for conversation-level view)
	let sessionIds = $state<string[]>([]);
	let isLoadingSessions = $state(false);
	let sessionsLoadError = $state<string | null>(null);

	// Detail view state
	let messages = $state<DatabaseMessage[]>([]);
	let isLoadingMessages = $state(false);
	let messagesLoadError = $state<string | null>(null);
	let selectedSessionId = $state<string | undefined>(initialSessionId);

	// Live session from store (for active subagents)
	let liveSession = $derived(
		selectedSessionId ? subagentSessionStore.getSession(selectedSessionId) : undefined
	);

	async function loadSessionList() {
		if (!conversationId) return;
		isLoadingSessions = true;
		sessionsLoadError = null;
		try {
			const dbSessionIds = await DatabaseService.getSubagentSessions(conversationId);
			const liveSessions = subagentSessionStore.getSessionsForConversation(conversationId);
			const liveIds = liveSessions.map((s) => s.sessionId);
			// Merge: live sessions first, then historical DB sessions not in live
			const merged = [...new Set([...liveIds, ...dbSessionIds])];
			sessionIds = merged;
		} catch (err) {
			sessionsLoadError = err instanceof Error ? err.message : String(err);
		} finally {
			isLoadingSessions = false;
		}
	}

	async function loadMessages() {
		if (!conversationId || !selectedSessionId) return;
		isLoadingMessages = true;
		messagesLoadError = null;
		try {
			const msgs = await DatabaseService.getSubagentMessages(conversationId, selectedSessionId);
			messages = msgs;
		} catch (err) {
			messagesLoadError = err instanceof Error ? err.message : String(err);
		} finally {
			isLoadingMessages = false;
		}
	}

	$effect(() => {
		if (open && conversationId) {
			if (selectedSessionId) {
				loadMessages();
			} else {
				loadSessionList();
			}
		}
	});

	$effect(() => {
		if (!open) {
			sessionIds = [];
			messages = [];
			sessionsLoadError = null;
			messagesLoadError = null;
		}
	});

	// Derive assistant turn count from messages
	let turnCount = $derived(messages.filter((m) => m.role === MessageRole.ASSISTANT).length);
	let toolCount = $derived(messages.filter((m) => m.role === MessageRole.TOOL).length);
	let totalTokens = $derived(
		liveSession?.totalTokens ??
			messages.reduce((sum, m) => {
				const t = m.timings;
				return sum + ((t?.prompt_n ?? 0) + (t?.predicted_n ?? 0));
			}, 0)
	);
	let modelName = $derived(
		liveSession?.modelName || messages.find((m) => m.model)?.model || 'Unknown'
	);
	let isRunning = $derived(liveSession?.isRunning ?? false);
	let isComplete = $derived(liveSession?.isComplete ?? false);
	let error = $derived(liveSession?.error ?? null);

	function handleOpenChange(newOpen: boolean) {
		open = newOpen;
		if (newOpen) {
			selectedSessionId = initialSessionId;
		}
	}

	function selectSession(sessionId: string) {
		selectedSessionId = sessionId;
		messages = [];
		loadMessages();
	}

	function backToList() {
		selectedSessionId = undefined;
		messages = [];
		messagesLoadError = null;
		loadSessionList();
	}

	function parseToolCalls(json?: string) {
		if (!json) return [];
		try {
			const parsed = JSON.parse(json);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function getSessionDisplayInfo(sessionId: string) {
		const live = subagentSessionStore.getSession(sessionId);
		if (live) {
			return {
				model: live.modelName,
				turns: live.currentTurn,
				tools: live.toolCallsCount,
				tokens: live.totalTokens,
				isRunning: live.isRunning,
				isComplete: live.isComplete,
				error: live.error,
				isLive: true as const
			};
		}
		return {
			model: undefined,
			turns: 0,
			tools: 0,
			tokens: 0,
			isRunning: false,
			isComplete: false,
			error: null,
			isLive: false as const
		};
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Overlay class="fixed inset-0 z-50 bg-overlay/50" />
	<Dialog.Content
		class="fixed top-1/2 left-1/2 z-50 flex h-[85vh] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden border bg-background p-0 shadow-xl duration-200 sm:rounded-lg"
	>
		<!-- Sticky Header -->
		<div class="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
			<div class="flex items-center gap-3">
				{#if selectedSessionId && !initialSessionId}
					<Button variant="ghost" size="icon" onclick={backToList} class="h-8 w-8">
						<ArrowLeft class="h-4 w-4" />
					</Button>
				{/if}
				<Bot class="h-5 w-5 text-primary" />
				<div class="flex flex-col">
					<Dialog.Title class="text-sm font-semibold">
						{#if selectedSessionId}
							Subagent Trace
						{:else}
							Subagent Sessions
						{/if}
					</Dialog.Title>
					<Dialog.Description class="text-xs text-muted-foreground">
						{#if selectedSessionId}
							{modelName}
							{#if isRunning}
								<span class="ml-1 inline-flex items-center gap-1 text-primary">
									<Loader2 class="h-3 w-3 animate-spin" />
									Streaming…
								</span>
							{:else if isComplete}
								<span class="ml-1 inline-flex items-center gap-1 text-success">
									<CheckCircle class="h-3 w-3" />
									Complete
								</span>
							{:else if error}
								<span class="ml-1 inline-flex items-center gap-1 text-destructive">
									<AlertCircle class="h-3 w-3" />
									Error
								</span>
							{/if}
						{:else}
							{sessionIds.length} session{sessionIds.length !== 1 ? 's' : ''}
						{/if}
					</Dialog.Description>
				</div>
			</div>
		</div>

		<!-- Scrollable Content -->
		<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
			{#if selectedSessionId}
				<!-- Detail view: messages for a single session -->
				{#if isLoadingMessages && messages.length === 0}
					<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Loading subagent trace…
					</div>
				{:else if messagesLoadError}
					<div
						class="flex h-full flex-col items-center justify-center gap-2 text-sm text-destructive"
					>
						<AlertCircle class="h-5 w-5" />
						<p>Failed to load trace: {messagesLoadError}</p>
					</div>
				{:else if messages.length === 0}
					<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
						No messages in this subagent session.
					</div>
				{:else}
					<div class="flex flex-col gap-4">
						{#each messages as msg (msg.id)}
							{#if msg.role === MessageRole.SYSTEM}
								<div class="rounded-md border border-border/50 bg-muted/30 px-3 py-2">
									<div
										class="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
									>
										System
									</div>
									<div class="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
										{msg.content}
									</div>
								</div>
							{:else if msg.role === MessageRole.USER}
								<div class="flex justify-end">
									<div
										class="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
									>
										{msg.content}
									</div>
								</div>
							{:else if msg.role === MessageRole.ASSISTANT}
								<div class="flex flex-col gap-2">
									<div
										class="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
									>
										<Bot class="h-3 w-3" />
										Assistant
									</div>
									{#if msg.reasoningContent}
										<div class="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
											<div
												class="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
											>
												Reasoning
											</div>
											<div class="text-xs leading-relaxed whitespace-pre-wrap">
												{msg.reasoningContent}
											</div>
										</div>
									{/if}
									{#if msg.content}
										<div class="text-sm leading-relaxed">
											<MarkdownContent content={msg.content} class="markdown-assistant-content" />
										</div>
									{/if}
									{#if msg.toolCalls}
										{@const tcs = parseToolCalls(msg.toolCalls)}
										{#each tcs as tc (tc.id)}
											<div class="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
												<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
													<Terminal class="h-3 w-3" />
													<span class="font-medium">{tc.function?.name || 'tool'}</span>
												</div>
												{#if tc.function?.arguments}
													<div class="mt-1">
														<SyntaxHighlightedCode
															code={formatJsonPretty(tc.function.arguments)}
															language={FileTypeText.JSON}
															maxHeight="12rem"
															class="text-xs"
														/>
													</div>
												{/if}
											</div>
										{/each}
									{/if}
								</div>
							{:else if msg.role === MessageRole.TOOL}
								<div class="flex flex-col gap-1">
									<div
										class="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
									>
										<Terminal class="h-3 w-3" />
										Tool Result
										{#if msg.toolCallId}
											<span class="font-mono text-[10px] opacity-60"
												>{msg.toolCallId.slice(-6)}</span
											>
										{/if}
									</div>
									<div
										class="max-h-48 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3"
									>
										<div class="font-mono text-xs leading-relaxed whitespace-pre-wrap">
											{msg.content}
										</div>
									</div>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			{:else}
				<!-- List view: all sessions for the conversation -->
				{#if isLoadingSessions}
					<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Loading sessions…
					</div>
				{:else if sessionsLoadError}
					<div
						class="flex h-full flex-col items-center justify-center gap-2 text-sm text-destructive"
					>
						<AlertCircle class="h-5 w-5" />
						<p>Failed to load sessions: {sessionsLoadError}</p>
					</div>
				{:else if sessionIds.length === 0}
					<div
						class="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
					>
						<Activity class="h-8 w-8 opacity-40" />
						<p>No subagent sessions found for this conversation.</p>
						<p class="text-xs opacity-70">
							Subagent traces appear here once the main model invokes <code>call_subagent</code>.
						</p>
					</div>
				{:else}
					<div class="flex flex-col gap-3">
						{#each sessionIds as sessionId (sessionId)}
							{@const info = getSessionDisplayInfo(sessionId)}
							<button
								onclick={() => selectSession(sessionId)}
								class="flex items-center justify-between rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/50"
							>
								<div class="flex flex-col gap-1">
									<div class="flex items-center gap-2">
										<span class="font-mono text-xs text-muted-foreground">
											{sessionId.slice(0, 16)}…
										</span>
										{#if info.isLive}
											{#if info.isRunning}
												<span
													class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
												>
													<Loader2 class="h-3 w-3 animate-spin" />
													Running
												</span>
											{:else if info.error}
												<span
													class="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
												>
													<AlertCircle class="h-3 w-3" />
													Error
												</span>
											{:else}
												<span
													class="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"
												>
													<CheckCircle class="h-3 w-3" />
													Complete
												</span>
											{/if}
										{:else}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
											>
												Historical
											</span>
										{/if}
									</div>
									{#if info.isLive}
										<div class="flex items-center gap-3 text-xs text-muted-foreground">
											<span>{info.model ?? 'Unknown'}</span>
											{#if (info.turns ?? 0) > 0}
												<span>{info.turns} turn{(info.turns ?? 0) !== 1 ? 's' : ''}</span>
											{/if}
											{#if (info.tools ?? 0) > 0}
												<span>{info.tools} tool{(info.tools ?? 0) !== 1 ? 's' : ''}</span>
											{/if}
											{#if (info.tokens ?? 0) > 0}
												<span>{(info.tokens ?? 0).toLocaleString()} tokens</span>
											{/if}
										</div>
									{/if}
								</div>
								<ArrowLeft class="h-4 w-4 rotate-180 text-muted-foreground" />
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</div>

		<!-- Sticky Footer -->
		{#if selectedSessionId}
			<div class="flex shrink-0 items-center justify-between border-t bg-background px-4 py-2.5">
				<div class="flex items-center gap-3 text-xs text-muted-foreground">
					<span class="tabular-nums">{turnCount} turn{turnCount !== 1 ? 's' : ''}</span>
					<span class="tabular-nums">{toolCount} tool{toolCount !== 1 ? 's' : ''}</span>
					<span class="tabular-nums">{totalTokens.toLocaleString()} tokens</span>
				</div>
				{#if error}
					<div class="text-xs text-destructive">
						{error}
					</div>
				{/if}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
