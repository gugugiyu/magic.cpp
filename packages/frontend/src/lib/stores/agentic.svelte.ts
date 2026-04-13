/**
 * agenticStore - Reactive State Store for Agentic Loop Orchestration
 *
 * Manages multi-turn agentic loop with MCP tools:
 * - LLM streaming with tool call detection
 * - Tool execution via mcpStore
 * - Session state management
 * - Turn limit enforcement
 *
 * Each agentic turn produces separate DB messages:
 * - One assistant message per LLM turn (with tool_calls if any)
 * - One tool result message per tool call execution
 *
 * **Architecture & Relationships:**
 * - **ChatService**: Stateless API layer (sendMessage, streaming)
 * - **mcpStore**: MCP connection management and tool execution
 * - **agenticStore** (this): Reactive state + business logic
 *
 * @see ChatService in services/chat.service.ts for API operations
 * @see mcpStore in stores/mcp.svelte.ts for MCP operations
 */

import { toast } from 'svelte-sonner';
import { SvelteSet } from 'svelte/reactivity';
import { ChatService } from '$lib/services';
import { config, settingsStore } from '$lib/stores/settings.svelte';
import { mcpStore } from '$lib/stores/mcp.svelte';
import { modelsStore } from '$lib/stores/models.svelte';
import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
import { modelCapabilityStore } from '$lib/stores/model-capabilities.svelte';
import { isAbortError, safeNumber } from '$lib/utils';
import { sequentialThinkingStore, type ThoughtEntry } from '$lib/stores/sequential-thinking.svelte';
import {
	DEFAULT_AGENTIC_CONFIG,
	NEWLINE_SEPARATOR,
	TURN_LIMIT_MESSAGE,
	LLM_ERROR_BLOCK_START,
	LLM_ERROR_BLOCK_END
} from '$lib/constants';
import { SUBAGENT_DEFAULT_PROMPT, BUILTIN_TOOLS } from '@shared/constants/prompts-and-tools';
import { skillsStore } from '$lib/stores/skills.svelte';
import {
	processToolOutput as processMcpToolOutput,
	countLines,
	McpSummarizeCancelledError
} from '$lib/services/mcp-summarize-harness';
import {
	IMAGE_MIME_TO_EXTENSION,
	DATA_URI_BASE64_REGEX,
	MCP_ATTACHMENT_NAME_PREFIX,
	DEFAULT_IMAGE_EXTENSION
} from '$lib/constants';
import {
	AttachmentType,
	ContentPartType,
	MessageRole,
	MimeTypePrefix,
	ToolCallType
} from '$lib/enums';
import type {
	AgenticFlowParams,
	AgenticFlowResult,
	AgenticSession,
	AgenticConfig,
	SettingsConfigType,
	McpServerOverride,
	MCPToolCall,
	OpenAIToolDefinition
} from '$lib/types';
import type {
	AgenticMessage,
	AgenticToolCallList,
	AgenticFlowCallbacks,
	AgenticFlowOptions
} from '$lib/types/agentic';
import type {
	ApiChatCompletionToolCall,
	ApiChatMessageData,
	ApiChatMessageContentPart
} from '$lib/types/api';
import type {
	ChatMessagePromptProgress,
	ChatMessageTimings,
	ChatMessageAgenticTimings,
	ChatMessageToolCallTiming,
	ChatMessageAgenticTurnStats
} from '$lib/types/chat';
import type {
	DatabaseMessage,
	DatabaseMessageExtra,
	DatabaseMessageExtraImageFile
} from '$lib/types/database';

// ─── Subagent progress types (exported for UI consumption) ───────────────────

export interface SubagentStep {
	toolName: string;
	status: 'calling' | 'done';
}

export interface SubagentProgress {
	modelName: string;
	steps: SubagentStep[];
	/** The skill name that triggered this subagent invocation, if applicable. */
	originSkill?: string;
}

// Built-in tool definitions imported from $lib/constants/prompts

// ─────────────────────────────────────────────────────────────────────────────

function createDefaultSession(): AgenticSession {
	return {
		isRunning: false,
		currentTurn: 0,
		totalToolCalls: 0,
		lastError: null,
		streamingToolCall: null
	};
}

function toAgenticMessages(messages: ApiChatMessageData[]): AgenticMessage[] {
	return messages.map((message) => {
		if (
			message.role === MessageRole.ASSISTANT &&
			message.tool_calls &&
			message.tool_calls.length > 0
		) {
			return {
				role: MessageRole.ASSISTANT,
				content: message.content,
				tool_calls: message.tool_calls.map((call, index) => ({
					id: call.id ?? `call_${index}`,
					type: (call.type as ToolCallType.FUNCTION) ?? ToolCallType.FUNCTION,
					function: {
						name: call.function?.name ?? '',
						arguments: call.function?.arguments ?? ''
					}
				}))
			} satisfies AgenticMessage;
		}
		if (message.role === MessageRole.TOOL && message.tool_call_id) {
			return {
				role: MessageRole.TOOL,
				tool_call_id: message.tool_call_id,
				content: typeof message.content === 'string' ? message.content : ''
			} satisfies AgenticMessage;
		}
		return {
			role: message.role as MessageRole.SYSTEM | MessageRole.USER,
			content: message.content
		} satisfies AgenticMessage;
	});
}

class AgenticStore {
	private _sessions = $state<Map<string, AgenticSession>>(new Map());
	private _subagentProgress = $state<Record<string, SubagentProgress | null>>({});
	/** Tracks startedAt timestamps for sequential_thinking tool calls by tool call ID. */
	private _sequentialThinkingStartedAt = $state<Map<string, number>>(new Map());
	/** Tracks the last skill name read via read_skill, for associating with subsequent call_subagent. */
	private _lastReadSkill = $state<string | null>(null);

	get isReady(): boolean {
		return true;
	}
	get isAnyRunning(): boolean {
		for (const session of this._sessions.values()) {
			if (session.isRunning) return true;
		}
		return false;
	}

	subagentProgress(conversationId: string): SubagentProgress | null {
		return this._subagentProgress[conversationId] ?? null;
	}

	getSession(conversationId: string): AgenticSession {
		let session = this._sessions.get(conversationId);
		if (!session) {
			session = createDefaultSession();
			this._sessions.set(conversationId, session);
		}
		return session;
	}

	private updateSession(conversationId: string, update: Partial<AgenticSession>): void {
		const session = this.getSession(conversationId);
		this._sessions.set(conversationId, { ...session, ...update });
	}

	clearSession(conversationId: string): void {
		this._sessions.delete(conversationId);
	}

	getActiveSessions(): Array<{
		conversationId: string;
		session: AgenticSession;
	}> {
		const active: Array<{ conversationId: string; session: AgenticSession }> = [];
		for (const [conversationId, session] of this._sessions.entries()) {
			if (session.isRunning) active.push({ conversationId, session });
		}
		return active;
	}

	isRunning(conversationId: string): boolean {
		return this.getSession(conversationId).isRunning;
	}

	currentTurn(conversationId: string): number {
		return this.getSession(conversationId).currentTurn;
	}

	totalToolCalls(conversationId: string): number {
		return this.getSession(conversationId).totalToolCalls;
	}

	lastError(conversationId: string): Error | null {
		return this.getSession(conversationId).lastError;
	}

	streamingToolCall(conversationId: string): { name: string; arguments: string } | null {
		return this.getSession(conversationId).streamingToolCall;
	}

	/** Get the last skill name read via read_skill, for associating with subsequent call_subagent. */
	getLastReadSkill(): string | null {
		return this._lastReadSkill;
	}

	/** Clear the last read skill tracking. */
	clearLastReadSkill(): void {
		this._lastReadSkill = null;
	}

	clearError(conversationId: string): void {
		this.updateSession(conversationId, { lastError: null });
	}

	/** Record the startedAt timestamp for a sequential_thinking tool call. */
	recordSequentialThinkingStartedAt(toolCallId: string, timestamp: number): void {
		this._sequentialThinkingStartedAt.set(toolCallId, timestamp);
	}

	/** Retrieve and consume the startedAt timestamp for a sequential_thinking tool call. */
	consumeSequentialThinkingStartedAt(toolCallId: string): number | undefined {
		const val = this._sequentialThinkingStartedAt.get(toolCallId);
		this._sequentialThinkingStartedAt.delete(toolCallId);
		return val;
	}

	private setSubagentProgress(conversationId: string, progress: SubagentProgress | null): void {
		this._subagentProgress = { ...this._subagentProgress, [conversationId]: progress };
	}

	private addSubagentStep(conversationId: string, step: SubagentStep): void {
		const current = this._subagentProgress[conversationId];
		if (!current) return;
		this._subagentProgress = {
			...this._subagentProgress,
			[conversationId]: { ...current, steps: [...current.steps, step] }
		};
	}

	private markLastSubagentStepDone(conversationId: string): void {
		const current = this._subagentProgress[conversationId];
		if (!current || current.steps.length === 0) return;
		const steps = current.steps.map((s, i) =>
			i === current.steps.length - 1 ? { ...s, status: 'done' as const } : s
		);
		this._subagentProgress = {
			...this._subagentProgress,
			[conversationId]: { ...current, steps }
		};
	}

	private getBuiltinTools(settings: SettingsConfigType): OpenAIToolDefinition[] {
		const tools: OpenAIToolDefinition[] = [];
		const settingKeyToTool: Record<string, OpenAIToolDefinition> = {
			builtinToolCalculator: BUILTIN_TOOLS[0],
			builtinToolTime: BUILTIN_TOOLS[1],
			builtinToolLocation: BUILTIN_TOOLS[2],
			builtinToolSequentialThinking: BUILTIN_TOOLS[3],
			builtinToolCallSubagent: BUILTIN_TOOLS[4]
		};
		for (const [key, def] of Object.entries(settingKeyToTool)) {
			if (!settings[key]) continue;

			if (key === 'builtinToolCallSubagent' && !subagentConfigStore.isConfigured) {
				toast.warning("Subagent endpoint wasn't available, this tool will be disabled", {
					duration: 4000
				});
				settingsStore.updateConfig('builtinToolCallSubagent', false);
				continue;
			}

			tools.push(def);
		}

		// Add skill tools if enabled
		if (settings.builtinToolSkills) {
			tools.push(BUILTIN_TOOLS[5], BUILTIN_TOOLS[6]);
		}

		return tools;
	}

	getConfig(settings: SettingsConfigType, perChatOverrides?: McpServerOverride[]): AgenticConfig {
		const maxTurns = Number(settings.agenticMaxTurns) || DEFAULT_AGENTIC_CONFIG.maxTurns;
		const maxToolPreviewLines =
			Number(settings.agenticMaxToolPreviewLines) || DEFAULT_AGENTIC_CONFIG.maxToolPreviewLines;
		const hasMcp = mcpStore.hasEnabledServers(perChatOverrides);
		const hasBuiltin = this.getBuiltinTools(settings).length > 0;
		return {
			enabled: (hasMcp || hasBuiltin) && DEFAULT_AGENTIC_CONFIG.enabled,
			maxTurns,
			maxToolPreviewLines
		};
	}

	async runAgenticFlow(params: AgenticFlowParams): Promise<AgenticFlowResult> {
		const { conversationId, messages, options = {}, callbacks, signal, perChatOverrides } = params;

		const settings = config();
		const agenticConfig = this.getConfig(settings, perChatOverrides);
		if (!agenticConfig.enabled) return { handled: false };

		// Collect built-in tools first (no async needed)
		const builtinTools = this.getBuiltinTools(settings);
		const builtinToolNames = new Set(builtinTools.map((t) => t.function.name));

		// Only initialize MCP when there are MCP servers configured
		const hasMcpServers = mcpStore.hasEnabledServers(perChatOverrides);
		let mcpTools: ReturnType<typeof mcpStore.getToolDefinitionsForLLM> = [];

		if (hasMcpServers) {
			const initialized = await mcpStore.ensureInitialized(perChatOverrides);
			if (!initialized) {
				console.log('[AgenticStore] MCP not initialized, continuing with built-in tools only');
			} else {
				mcpTools = mcpStore.getToolDefinitionsForLLM();
			}
		}

		const tools = [...builtinTools, ...mcpTools];
		if (tools.length === 0) {
			console.log('[AgenticStore] No tools available, falling back to standard chat');
			return { handled: false };
		}

		// Respect per-model tool-calling override set by the user in Settings → Connection.
		const activeModelId = params.options?.model as string | undefined;
		if (activeModelId && !modelCapabilityStore.isToolCallingEnabled(activeModelId)) {
			console.log(
				`[AgenticStore] Tool-calling disabled for model "${activeModelId}", falling back to standard chat`
			);
			return { handled: false };
		}

		console.log(
			`[AgenticStore] Starting agentic flow with ${tools.length} tools (${builtinTools.length} built-in, ${mcpTools.length} MCP)`
		);

		const normalizedMessages: ApiChatMessageData[] = messages
			.map((msg) => {
				if ('id' in msg && 'convId' in msg && 'timestamp' in msg)
					return ChatService.convertDbMessageToApiChatMessageData(
						msg as DatabaseMessage & { extra?: DatabaseMessageExtra[] }
					);
				return msg as ApiChatMessageData;
			})
			.filter((msg) => {
				if (msg.role === MessageRole.SYSTEM) {
					const content = typeof msg.content === 'string' ? msg.content : '';
					return content.trim().length > 0;
				}
				return true;
			});

		this.updateSession(conversationId, {
			isRunning: true,
			currentTurn: 0,
			totalToolCalls: 0,
			lastError: null
		});

		// Acquire MCP connection only when we actually have MCP tools
		if (mcpTools.length > 0) mcpStore.acquireConnection();

		try {
			await this.executeAgenticLoop({
				conversationId,
				messages: normalizedMessages,
				options,
				tools,
				builtinToolNames,
				agenticConfig,
				mcpSummarizeOutputs: Boolean(settings.mcpSummarizeOutputs),
				mcpSummarizeLineThreshold: safeNumber(settings.mcpSummarizeLineThreshold, 400),
				mcpSummarizeHardCap: safeNumber(settings.mcpSummarizeHardCap, 800),
				mcpSummarizeAllTools: Boolean(settings.mcpSummarizeAllTools),
				callbacks,
				signal
			});
			return { handled: true };
		} catch (error) {
			const normalizedError = error instanceof Error ? error : new Error(String(error));
			this.updateSession(conversationId, { lastError: normalizedError });
			callbacks.onError?.(normalizedError);
			return { handled: true, error: normalizedError };
		} finally {
			this.updateSession(conversationId, { isRunning: false });
			if (mcpTools.length > 0) {
				await mcpStore
					.releaseConnection()
					.catch((err: unknown) =>
						console.warn('[AgenticStore] Failed to release MCP connection:', err)
					);
			}
		}
	}

	private async executeAgenticLoop(params: {
		conversationId: string;
		messages: ApiChatMessageData[];
		options: AgenticFlowOptions;
		tools: OpenAIToolDefinition[];
		builtinToolNames: Set<string>;
		agenticConfig: AgenticConfig;
		mcpSummarizeOutputs: boolean;
		mcpSummarizeLineThreshold: number;
		mcpSummarizeHardCap: number;
		mcpSummarizeAllTools: boolean;
		callbacks: AgenticFlowCallbacks;
		signal?: AbortSignal;
	}): Promise<void> {
		const {
			conversationId,
			messages,
			options,
			tools,
			builtinToolNames,
			agenticConfig,
			mcpSummarizeOutputs,
			mcpSummarizeLineThreshold,
			mcpSummarizeHardCap,
			mcpSummarizeAllTools,
			callbacks,
			signal
		} = params;
		const {
			onChunk,
			onReasoningChunk,
			onToolCallsStreaming,
			onAttachments,
			onModel,
			onAssistantTurnComplete,
			createToolResultMessage,
			createAssistantMessage,
			onFlowComplete,
			onTimings,
			onTurnComplete
		} = callbacks;

		const sessionMessages: AgenticMessage[] = toAgenticMessages(messages);
		let capturedTimings: ChatMessageTimings | undefined;
		let totalToolCallCount = 0;

		const agenticTimings: ChatMessageAgenticTimings = {
			turns: 0,
			toolCallsCount: 0,
			toolsMs: 0,
			toolCalls: [],
			perTurn: [],
			llm: { predicted_n: 0, predicted_ms: 0, prompt_n: 0, prompt_ms: 0 }
		};
		const maxTurns = agenticConfig.maxTurns;

		const effectiveModel =
			options.model || modelsStore.selectedModelName || modelsStore.models[0]?.model || '';

		// Capture the first assistant message ID to use for all tool executions
		// across all turns. This prevents sequential thinking contamination where
		// each turn would otherwise get its own messageId.
		let firstAssistantMessageId = '';

		for (let turn = 0; turn < maxTurns; turn++) {
			this.updateSession(conversationId, { currentTurn: turn + 1 });
			agenticTimings.turns = turn + 1;

			if (signal?.aborted) {
				onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
				return;
			}

			// For turns > 0, create a new assistant message via callback
			if (turn > 0 && createAssistantMessage) {
				await createAssistantMessage();
			}

			let turnContent = '';
			let turnReasoningContent = '';
			let turnToolCalls: ApiChatCompletionToolCall[] = [];
			let lastStreamingToolCallName = '';
			let lastStreamingToolCallArgsLength = 0;
			let turnTimings: ChatMessageTimings | undefined;

			const turnStats: ChatMessageAgenticTurnStats = {
				turn: turn + 1,
				llm: { predicted_n: 0, predicted_ms: 0, prompt_n: 0, prompt_ms: 0 },
				toolCalls: [],
				toolsMs: 0
			};

			try {
				await ChatService.sendMessage(
					sessionMessages as ApiChatMessageData[],
					{
						...options,
						stream: true,
						tools: tools.length > 0 ? tools : undefined,
						onChunk: (chunk: string) => {
							turnContent += chunk;
							onChunk?.(chunk);
						},
						onReasoningChunk: (chunk: string) => {
							turnReasoningContent += chunk;
							onReasoningChunk?.(chunk);
						},
						onToolCallChunk: (serialized: string) => {
							try {
								turnToolCalls = JSON.parse(serialized) as ApiChatCompletionToolCall[];
								if (import.meta.env.DEV) {
									console.log(
										'[agentic onToolCallChunk] turn=',
										turn + 1,
										'count=',
										turnToolCalls.length,
										turnToolCalls.map((c) => c.function?.name).join(', ') || '(empty)'
									);
								}
								onToolCallsStreaming?.(turnToolCalls);

								if (turnToolCalls.length > 0 && turnToolCalls[0]?.function) {
									const name = turnToolCalls[0].function.name || '';
									const args = turnToolCalls[0].function.arguments || '';
									const argsLengthBucket = Math.floor(args.length / 100);
									if (
										name !== lastStreamingToolCallName ||
										argsLengthBucket !== lastStreamingToolCallArgsLength
									) {
										lastStreamingToolCallName = name;
										lastStreamingToolCallArgsLength = argsLengthBucket;
										this.updateSession(conversationId, {
											streamingToolCall: { name, arguments: args }
										});

										// Track startedAt for sequential_thinking tool calls
										if (
											name === 'sequential_thinking' &&
											turnToolCalls[0].id &&
											!this._sequentialThinkingStartedAt.has(turnToolCalls[0].id)
										) {
											this._sequentialThinkingStartedAt.set(turnToolCalls[0].id, Date.now());
										}
									}
								}
							} catch (e) {
								if (import.meta.env.DEV) {
									console.warn(
										'[agentic onToolCallChunk] JSON parse error:',
										e,
										'raw:',
										serialized.slice(0, 200)
									);
								}
							}
						},
						onModel,
						onTimings: (timings?: ChatMessageTimings, progress?: ChatMessagePromptProgress) => {
							onTimings?.(timings, progress);
							if (timings) {
								capturedTimings = timings;
								turnTimings = timings;
							}
						},
						onComplete: () => {
							/* Completion handled after sendMessage resolves */
						},
						onError: (error: Error) => {
							throw error;
						}
					},
					undefined,
					signal
				);

				this.updateSession(conversationId, { streamingToolCall: null });

				if (turnTimings) {
					agenticTimings.llm.predicted_n += turnTimings.predicted_n || 0;
					agenticTimings.llm.predicted_ms += turnTimings.predicted_ms || 0;
					agenticTimings.llm.prompt_n += turnTimings.prompt_n || 0;
					agenticTimings.llm.prompt_ms += turnTimings.prompt_ms || 0;
					turnStats.llm.predicted_n = turnTimings.predicted_n || 0;
					turnStats.llm.predicted_ms = turnTimings.predicted_ms || 0;
					turnStats.llm.prompt_n = turnTimings.prompt_n || 0;
					turnStats.llm.prompt_ms = turnTimings.prompt_ms || 0;
				}
			} catch (error) {
				if (signal?.aborted) {
					// Save whatever we have for this turn before exiting
					await onAssistantTurnComplete?.(
						turnContent,
						turnReasoningContent || undefined,
						this.buildFinalTimings(capturedTimings, agenticTimings),
						undefined
					);
					onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
					return;
				}
				const normalizedError = error instanceof Error ? error : new Error('LLM stream error');
				// Save error as content in the current turn
				onChunk?.(`${LLM_ERROR_BLOCK_START}${normalizedError.message}${LLM_ERROR_BLOCK_END}`);
				await onAssistantTurnComplete?.(
					turnContent + `${LLM_ERROR_BLOCK_START}${normalizedError.message}${LLM_ERROR_BLOCK_END}`,
					turnReasoningContent || undefined,
					this.buildFinalTimings(capturedTimings, agenticTimings),
					undefined
				);
				onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
				throw normalizedError;
			}

			// No tool calls = final turn, save and complete
			if (import.meta.env.DEV) {
				console.log(
					'[agentic turn complete] turn=',
					turn + 1,
					'content_len=',
					turnContent.length,
					'toolCalls=',
					turnToolCalls.length,
					'reasoning_len=',
					turnReasoningContent.length
				);
			}
			if (turnToolCalls.length === 0) {
				if (import.meta.env.DEV) {
					console.log('[agentic] FINAL TURN detected (no tool calls)');
				}
				agenticTimings.perTurn!.push(turnStats);

				const finalTimings = this.buildFinalTimings(capturedTimings, agenticTimings);

				await onAssistantTurnComplete?.(
					turnContent,
					turnReasoningContent || undefined,
					finalTimings,
					undefined
				);

				if (finalTimings) onTurnComplete?.(finalTimings);

				onFlowComplete?.(finalTimings);

				return;
			}

			// Normalize and save assistant turn with tool calls
			const normalizedCalls = this.normalizeToolCalls(turnToolCalls);
			if (normalizedCalls.length === 0) {
				await onAssistantTurnComplete?.(
					turnContent,
					turnReasoningContent || undefined,
					this.buildFinalTimings(capturedTimings, agenticTimings),
					undefined
				);
				onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
				return;
			}

			totalToolCallCount += normalizedCalls.length;
			this.updateSession(conversationId, {
				totalToolCalls: totalToolCallCount
			});

			// Save the assistant message with its tool calls
			const turnMessageId =
				(await onAssistantTurnComplete?.(
					turnContent,
					turnReasoningContent || undefined,
					turnTimings,
					normalizedCalls
				)) ?? '';

			// Capture the first assistant message ID for cross-turn tool execution
			if (!firstAssistantMessageId && turnMessageId) {
				firstAssistantMessageId = turnMessageId;
			}

			// Add assistant message to session history
			sessionMessages.push({
				role: MessageRole.ASSISTANT,
				content: turnContent || undefined,
				reasoning_content: turnReasoningContent || undefined,
				tool_calls: normalizedCalls
			});

			// Execute each tool call and create result messages
			for (const toolCall of normalizedCalls) {
				if (signal?.aborted) {
					onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
					return;
				}

				const toolStartTime = performance.now();
				const mcpCall: MCPToolCall = {
					id: toolCall.id,
					function: {
						name: toolCall.function.name,
						arguments: toolCall.function.arguments
					}
				};

				let result: string;
				let toolSuccess = true;

				try {
					if (builtinToolNames.has(mcpCall.function.name)) {
						result = await this.executeBuiltinTool(
							mcpCall.function.name,
							typeof mcpCall.function.arguments === 'string'
								? mcpCall.function.arguments
								: JSON.stringify(mcpCall.function.arguments),
							conversationId,
							firstAssistantMessageId,
							tools,
							signal,
							mcpCall.id
						);
					} else {
						const executionResult = await mcpStore.executeTool(mcpCall, signal);
						result = executionResult.content;
					}
				} catch (error) {
					if (isAbortError(error)) {
						onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
						return;
					}
					result = `Error: ${error instanceof Error ? error.message : String(error)}`;
					toolSuccess = false;
				}

				const toolDurationMs = performance.now() - toolStartTime;
				const toolTiming: ChatMessageToolCallTiming = {
					name: toolCall.function.name,
					duration_ms: Math.round(toolDurationMs),
					success: toolSuccess
				};

				agenticTimings.toolCalls!.push(toolTiming);
				agenticTimings.toolCallsCount++;
				agenticTimings.toolsMs += Math.round(toolDurationMs);
				turnStats.toolCalls.push(toolTiming);
				turnStats.toolsMs += Math.round(toolDurationMs);

				if (signal?.aborted) {
					onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
					return;
				}

				const { cleanedResult: rawCleanedResult, attachments } =
					this.extractBase64Attachments(result);

				// MCP response length harness: check if output exceeds threshold
				const isMcpTool = !builtinToolNames.has(toolCall.function.name);
				const summarizeEnabled = mcpSummarizeOutputs && (mcpSummarizeAllTools || isMcpTool);
				let cleanedResult: string;
				let wasSummarized: boolean;
				let wasCropped: boolean;
				try {
					({
						content: cleanedResult,
						wasSummarized,
						wasCropped
					} = await processMcpToolOutput(
						toolCall.function.name,
						rawCleanedResult,
						summarizeEnabled,
						mcpSummarizeLineThreshold,
						mcpSummarizeHardCap,
						signal
					));
				} catch (error) {
					if (error instanceof McpSummarizeCancelledError) {
						onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
						return;
					}
					throw error;
				}

				// Build summary metadata extra if summarized or cropped
				const summaryExtras: DatabaseMessageExtra[] = [];
				if (wasSummarized) {
					summaryExtras.push({
						type: AttachmentType.MCP_SUMMARY,
						name: 'summarized',
						originalLineCount: countLines(rawCleanedResult)
					});
				} else if (wasCropped) {
					summaryExtras.push({
						type: AttachmentType.MCP_SUMMARY,
						name: 'cropped',
						originalLineCount: countLines(rawCleanedResult)
					});
				}

				const allExtras = [...summaryExtras, ...attachments];

				// Create the tool result message in the DB
				let toolResultMessage: DatabaseMessage | undefined;
				if (createToolResultMessage) {
					toolResultMessage = await createToolResultMessage(
						toolCall.id,
						cleanedResult,
						allExtras.length > 0 ? allExtras : undefined
					);
				}

				if (allExtras.length > 0 && toolResultMessage) {
					onAttachments?.(toolResultMessage.id, allExtras);
				}

				// Build content parts for session history (including images for vision models)
				const contentParts: ApiChatMessageContentPart[] = [
					{ type: ContentPartType.TEXT, text: cleanedResult }
				];
				for (const attachment of attachments) {
					if (attachment.type === AttachmentType.IMAGE) {
						if (modelsStore.modelSupportsVision(effectiveModel)) {
							contentParts.push({
								type: ContentPartType.IMAGE_URL,
								image_url: {
									url: (attachment as DatabaseMessageExtraImageFile).base64Url
								}
							});
						} else {
							console.info(
								`[AgenticStore] Skipping image attachment (model "${effectiveModel}" does not support vision)`
							);
						}
					}
				}

				sessionMessages.push({
					role: MessageRole.TOOL,
					tool_call_id: toolCall.id,
					content: contentParts.length === 1 ? cleanedResult : contentParts
				});
			}

			if (turnStats.toolCalls.length > 0) {
				agenticTimings.perTurn!.push(turnStats);

				const intermediateTimings = this.buildFinalTimings(capturedTimings, agenticTimings);
				if (intermediateTimings) onTurnComplete?.(intermediateTimings);
			}
		}

		// Turn limit reached
		onChunk?.(TURN_LIMIT_MESSAGE);
		await onAssistantTurnComplete?.(
			TURN_LIMIT_MESSAGE,
			undefined,
			this.buildFinalTimings(capturedTimings, agenticTimings),
			undefined
		);
		onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
	}

	private async executeBuiltinTool(
		name: string,
		args: string,
		conversationId: string,
		messageId: string,
		allTools?: OpenAIToolDefinition[],
		signal?: AbortSignal,
		toolCallId?: string
	): Promise<string> {
		let parsed: Record<string, unknown> = {};
		try {
			parsed = JSON.parse(args || '{}');
		} catch {
			/* use empty object if args are malformed */
		}

		switch (name) {
			case 'calculator': {
				const expression = String(parsed.expression ?? '');
				if (!expression) return 'Error: missing expression';
				try {
					// Only allow safe arithmetic characters to prevent code injection
					// if (!/^[\d\s+\-*/().%^,eE]+$/.test(expression)) {
					// 	return 'Error: expression contains disallowed characters';
					// }

					const result = new Function(`"use strict"; return (${expression})`)();
					if (typeof result !== 'number' || !isFinite(result)) {
						return 'Error: expression did not produce a finite number';
					}
					return String(result);
				} catch (err) {
					return `Error: ${err instanceof Error ? err.message : String(err)}`;
				}
			}

			case 'get_time': {
				return new Date().toISOString();
			}

			case 'get_location': {
				if (!navigator.geolocation) {
					return 'Error: Geolocation is not supported by this browser';
				}
				return new Promise<string>((resolve) => {
					navigator.geolocation.getCurrentPosition(
						(pos) => {
							resolve(
								JSON.stringify({
									latitude: pos.coords.latitude,
									longitude: pos.coords.longitude,
									accuracy_meters: pos.coords.accuracy
								})
							);
						},
						(err) => {
							resolve(`Error: ${err.message}`);
						},
						{ timeout: 10_000 }
					);
				});
			}

			case 'sequential_thinking': {
				const thought = String(parsed.thought ?? '');
				const thoughtNumber = Number(parsed.thoughtNumber ?? 1);
				const totalThoughts = Number(parsed.totalThoughts ?? 1);
				const nextThoughtNeeded = Boolean(parsed.nextThoughtNeeded ?? false);
				const done = !nextThoughtNeeded;
				const completedAt = Date.now();

				// Retrieve the startedAt that was recorded when the tool call chunk arrived
				const startedAt = toolCallId
					? this.consumeSequentialThinkingStartedAt(toolCallId)
					: undefined;

				const entry: ThoughtEntry = {
					thoughtNumber,
					totalThoughts,
					thought,
					nextThoughtNeeded,
					done,
					startedAt: startedAt ?? completedAt,
					completedAt
				};

				// Mark the previous thought in this message as completed
				const existingTurn = sequentialThinkingStore.getTurn(conversationId, messageId);
				if (existingTurn && existingTurn.thoughts.length > 0) {
					const prevThought = existingTurn.thoughts[existingTurn.thoughts.length - 1];
					if (!prevThought.completedAt) {
						prevThought.completedAt = completedAt;
					}
				}

				sequentialThinkingStore.recordThought({ conversationId, messageId, thought: entry });

				return JSON.stringify({
					thoughtNumber,
					totalThoughts,
					nextThoughtNeeded,
					comment:
						'Thought recorded, you should brief the user with a small headup (e.g. Let me continue reasoning.) before registering next thoughts, or proceed with the agentic flow anyways.'
				});
			}

			case 'call_subagent': {
				if (!subagentConfigStore.isConfigured) {
					return JSON.stringify({
						error:
							'Subagent not configured. Please set endpoint, model, and enable the subagent in Settings.'
					});
				}

				const subagentModelId = subagentConfigStore.getModel();
				if (!modelCapabilityStore.isToolCallingEnabled(subagentModelId)) {
					return JSON.stringify({
						error:
							`Subagent model "${subagentModelId}" has tool-calling disabled. ` +
							'A subagent needs tool-calling capabilities to assist the main model. ' +
							'Please select another model that supports function calling in Settings → Connection → Subagent.'
					});
				}

				const { prompt, system } = parsed as { prompt: string; system?: string };
				if (!prompt) {
					return JSON.stringify({ error: 'call_subagent requires a prompt argument' });
				}

				// Built-in tools the subagent may call (no call_subagent to prevent recursion,
				// no sequential_thinking since that tool writes to the parent model's reasoning store)
				const subagentTools = (allTools ?? []).filter((t: OpenAIToolDefinition) => {
					const tName = t.function?.name;
					return tName && tName !== 'call_subagent' && tName !== 'sequential_thinking';
				});
				const builtinNameSet = new SvelteSet(BUILTIN_TOOLS.map((t) => t.function.name));
				builtinNameSet.delete('call_subagent');

				const endpoint = subagentConfigStore.getEndpoint();
				const apiKey = subagentConfigStore.getApiKey();
				const url = `${endpoint}/v1/chat/completions`;
				const headers: Record<string, string> = { 'Content-Type': 'application/json' };
				if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

				const modelDisplayName = subagentModelId.split('/').pop() ?? subagentModelId;
				// Associate with the last read skill if called shortly after
				const originSkill = this._lastReadSkill ?? undefined;
				this.setSubagentProgress(conversationId, {
					modelName: modelDisplayName,
					steps: [],
					originSkill
				});
				// Clear after associating
				this._lastReadSkill = null;

				// Running message history for the subagent loop (OpenAI wire format)
				const loopMessages: Record<string, unknown>[] = [];

				// Default to summarization persona, most common use case
				if (system) {
					loopMessages.push({ role: 'system', content: system });
				} else {
					loopMessages.push({
						role: 'system',
						content: SUBAGENT_DEFAULT_PROMPT
					});
				}

				loopMessages.push({ role: 'user', content: prompt });

				const SUBAGENT_MAX_TURNS = 10;

				try {
					for (let subTurn = 0; subTurn < SUBAGENT_MAX_TURNS; subTurn++) {
						if (signal?.aborted) {
							this.setSubagentProgress(conversationId, null);
							return JSON.stringify({ error: 'Subagent aborted' });
						}

						const requestBody: Record<string, unknown> = {
							model: subagentModelId,
							messages: loopMessages,
							stream: false
						};
						if (subagentTools.length > 0) requestBody.tools = subagentTools;

						const response = await fetch(url, {
							method: 'POST',
							headers,
							body: JSON.stringify(requestBody),
							signal
						});

						if (!response.ok) {
							const errorText = await response.text().catch(() => 'Unknown error');
							this.setSubagentProgress(conversationId, null);
							return JSON.stringify({
								error: `Subagent error (${response.status}): ${errorText}`
							});
						}

						const data = (await response.json()) as {
							choices?: {
								message?: {
									content?: string | { type: string; text?: string }[] | null;
									tool_calls?: {
										id?: string;
										function?: { name?: string; arguments?: string };
									}[];
								};
								finish_reason?: string;
							}[];
						};

						const choice = data.choices?.[0];
						if (!choice) {
							this.setSubagentProgress(conversationId, null);
							return JSON.stringify({ error: 'Invalid subagent response format' });
						}

						const assistantMsg = choice.message;
						const finishReason = choice.finish_reason;
						const toolCalls = assistantMsg?.tool_calls;

						if (finishReason === 'tool_calls' || (toolCalls && toolCalls.length > 0)) {
							// Append assistant message with tool_calls to history
							loopMessages.push({
								role: 'assistant',
								content: assistantMsg?.content ?? null,
								tool_calls: toolCalls
							});

							// Execute each tool call
							for (const tc of toolCalls ?? []) {
								const tcName = tc.function?.name ?? '';
								const tcArgs = tc.function?.arguments ?? '{}';
								const tcId = tc.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;

								this.addSubagentStep(conversationId, { toolName: tcName, status: 'calling' });

								let toolResult: string;
								try {
									if (builtinNameSet.has(tcName)) {
										toolResult = await this.executeBuiltinTool(
											tcName,
											tcArgs,
											conversationId,
											messageId,
											allTools,
											signal,
											tcId
										);
									} else {
										const mcpResult = await mcpStore.executeTool(
											{ id: tcId, function: { name: tcName, arguments: tcArgs } },
											signal
										);
										toolResult = mcpResult.content;
									}
								} catch (err) {
									toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
								}

								this.markLastSubagentStepDone(conversationId);
								loopMessages.push({ role: 'tool', tool_call_id: tcId, content: toolResult });
							}
							// Continue to next sub-turn
						} else {
							// finish_reason === 'stop' — extract final text content
							const resultContent =
								typeof assistantMsg?.content === 'string'
									? assistantMsg.content
									: (assistantMsg?.content
											?.map((c) =>
												typeof c === 'object' && c !== null && 'text' in c
													? ((c as { text?: string }).text ?? '')
													: ''
											)
											.join('') ?? '');

							this.setSubagentProgress(conversationId, null);
							return JSON.stringify({ result: resultContent });
						}
					}

					// Max sub-turns exhausted
					this.setSubagentProgress(conversationId, null);
					return JSON.stringify({
						error: 'Subagent reached maximum turn limit without producing a final answer'
					});
				} catch (error) {
					this.setSubagentProgress(conversationId, null);
					const message = error instanceof Error ? error.message : String(error);
					return JSON.stringify({ error: `Subagent request failed: ${message}` });
				}
			}

			case 'list_skill': {
				// Refresh skills from backend to avoid stale data
				await skillsStore.loadSkills();
				const entries = skillsStore.getListSkillEntries();
				if (entries.length === 0) {
					return JSON.stringify({
						skills: [],
						message: 'No skills are currently enabled.'
					});
				}
				return JSON.stringify({ skills: entries });
			}

			case 'read_skill': {
				const name = String(parsed.name ?? '');
				if (!name) {
					return JSON.stringify({ error: 'Missing required parameter: name' });
				}
				// Refresh skills from backend to avoid stale data
				await skillsStore.loadSkills();
				const content = skillsStore.getReadSkillContent(name);
				if (content === null) {
					return JSON.stringify({ error: `Skill "${name}" not found or not enabled.` });
				}
				// Track this skill was read, for potential association with next call_subagent
				this._lastReadSkill = name;
				return JSON.stringify({ name, content });
			}

			default:
				return `Error: unknown built-in tool "${name}"`;
		}
	}

	private buildFinalTimings(
		capturedTimings: ChatMessageTimings | undefined,
		agenticTimings: ChatMessageAgenticTimings
	): ChatMessageTimings | undefined {
		if (agenticTimings.toolCallsCount === 0) return capturedTimings;
		return {
			predicted_n: capturedTimings?.predicted_n,
			predicted_ms: capturedTimings?.predicted_ms,
			prompt_n: capturedTimings?.prompt_n,
			prompt_ms: capturedTimings?.prompt_ms,
			cache_n: capturedTimings?.cache_n,
			agentic: agenticTimings
		};
	}

	private normalizeToolCalls(toolCalls: ApiChatCompletionToolCall[]): AgenticToolCallList {
		if (!toolCalls) return [];
		return toolCalls.map((call, index) => ({
			id: call?.id ?? `tool_${index}`,
			type: (call?.type as ToolCallType.FUNCTION) ?? ToolCallType.FUNCTION,
			function: {
				name: call?.function?.name ?? '',
				arguments: call?.function?.arguments ?? ''
			}
		}));
	}

	private extractBase64Attachments(result: string): {
		cleanedResult: string;
		attachments: DatabaseMessageExtra[];
	} {
		if (!result.trim()) {
			return { cleanedResult: result, attachments: [] };
		}

		const lines = result.split(NEWLINE_SEPARATOR);
		const attachments: DatabaseMessageExtra[] = [];
		let attachmentIndex = 0;

		const cleanedLines = lines.map((line) => {
			const trimmedLine = line.trim();

			const match = trimmedLine.match(DATA_URI_BASE64_REGEX);
			if (!match) {
				return line;
			}

			const mimeType = match[1].toLowerCase();
			const base64Data = match[2];

			if (!base64Data) {
				return line;
			}

			attachmentIndex += 1;
			const name = this.buildAttachmentName(mimeType, attachmentIndex);

			if (mimeType.startsWith(MimeTypePrefix.IMAGE)) {
				attachments.push({
					type: AttachmentType.IMAGE,
					name,
					base64Url: trimmedLine
				});

				return `[Attachment saved: ${name}]`;
			}

			return line;
		});

		return { cleanedResult: cleanedLines.join(NEWLINE_SEPARATOR), attachments };
	}

	private buildAttachmentName(mimeType: string, index: number): string {
		const extension = IMAGE_MIME_TO_EXTENSION[mimeType] ?? DEFAULT_IMAGE_EXTENSION;

		return `${MCP_ATTACHMENT_NAME_PREFIX}-${Date.now()}-${index}.${extension}`;
	}
}

export const agenticStore = new AgenticStore();

export function agenticIsRunning(conversationId: string) {
	return agenticStore.isRunning(conversationId);
}

export function agenticCurrentTurn(conversationId: string) {
	return agenticStore.currentTurn(conversationId);
}

export function agenticTotalToolCalls(conversationId: string) {
	return agenticStore.totalToolCalls(conversationId);
}

export function agenticLastError(conversationId: string) {
	return agenticStore.lastError(conversationId);
}

export function agenticStreamingToolCall(conversationId: string) {
	return agenticStore.streamingToolCall(conversationId);
}

export function agenticSubagentProgress(conversationId: string) {
	return agenticStore.subagentProgress(conversationId);
}

export function agenticIsAnyRunning() {
	return agenticStore.isAnyRunning;
}
