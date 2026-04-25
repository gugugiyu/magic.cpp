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

import { SvelteSet } from 'svelte/reactivity';
import { ChatService } from '$lib/services';
import { config } from '$lib/stores/settings.svelte';
import { mcpStore } from '$lib/stores/mcp.svelte';
import { modelsStore } from '$lib/stores/models.svelte';
import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
import { modelCapabilityStore } from '$lib/stores/model-capabilities.svelte';
import {
	getActiveBuiltinTools,
	getBuiltinToolNames,
	BUILTIN_TOOL_EXECUTION_TARGET
} from '$lib/enums/builtin-tools';
import {
	isAbortError,
	safeNumber,
	createLinkedController,
	repairJsonObject,
	sanitizeToolName
} from '$lib/utils';

import { runCommandSessionStore } from '$lib/stores/run-command-session.svelte';
import {
	DEFAULT_AGENTIC_CONFIG,
	NEWLINE_SEPARATOR,
	TURN_LIMIT_MESSAGE,
	LLM_ERROR_BLOCK_START,
	LLM_ERROR_BLOCK_END
} from '$lib/constants';
import { SUBAGENT_DEFAULT_PROMPT } from '@shared/constants/prompts-and-tools';
import { skillsStore } from '$lib/stores/skills.svelte';
import { todoStore } from '$lib/stores/todos.svelte';
import {
	processToolOutput as processMcpToolOutput,
	countLines,
	McpSummarizeCancelledError
} from '$lib/services/mcp-summarize-harness';
import { createModuleLogger } from '$lib/utils/logger';
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
import { serverEndpointStore } from './server-endpoint.svelte';

const logger = createModuleLogger('agenticStore');

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
	/** Running totals accumulated during subagent execution. */
	usage?: {
		total: number;
		prompt: number;
		completion: number;
	};
	toolCallsCount?: number;
}

/** Final stats for a completed subagent, persisted after progress is cleared. */
export interface SubagentFinalStats {
	totalTokens?: number;
	toolCallsCount?: number;
}

// Built-in tool definitions imported from $lib/constants/prompts

// ─────────────────────────────────────────────────────────────────────────────

const MCP_TOOL_EXECUTION_TIMEOUT_MS = 120_000;

function withMcpToolTimeout<T>(promise: Promise<T>, toolName: string): Promise<T> {
	let timerId: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timerId = setTimeout(
			() =>
				reject(
					new DOMException(
						`Tool "${toolName}" timed out after ${MCP_TOOL_EXECUTION_TIMEOUT_MS}ms`,
						'TimeoutError'
					)
				),
			MCP_TOOL_EXECUTION_TIMEOUT_MS
		);
	});
	return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timerId));
}

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
	/** Persisted final stats shown in UI after subagent completes. */
	private _subagentFinalStats = $state<Record<string, SubagentFinalStats | null>>({});
	/** Tracks the last skill name read via read_skill, for associating with subsequent call_subagent. */
	private _lastReadSkill = $state<Map<string, string>>(new Map());

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
	getLastReadSkill(conversationId: string): string | undefined {
		return this._lastReadSkill.get(conversationId);
	}

	/** Clear the last read skill tracking. */
	clearLastReadSkill(conversationId: string): void {
		this._lastReadSkill.delete(conversationId);
	}

	clearError(conversationId: string): void {
		this.updateSession(conversationId, { lastError: null });
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

	subagentFinalStats(conversationId: string): SubagentFinalStats | null {
		return this._subagentFinalStats[conversationId] ?? null;
	}

	private getBuiltinTools(settings: SettingsConfigType): OpenAIToolDefinition[] {
		return getActiveBuiltinTools(settings);
	}

	getConfig(
		settings: SettingsConfigType,
		perChatOverrides?: McpServerOverride[],
		hasMcpOverride?: boolean
	): AgenticConfig {
		const maxTurns = Number(settings.agenticMaxTurns) || DEFAULT_AGENTIC_CONFIG.maxTurns;
		const maxToolPreviewLines =
			Number(settings.agenticMaxToolPreviewLines) || DEFAULT_AGENTIC_CONFIG.maxToolPreviewLines;
		const maxToolCallsPerTurn =
			Number(settings.agenticMaxToolCallsPerTurn) || DEFAULT_AGENTIC_CONFIG.maxToolCallsPerTurn;
		const hasMcp = hasMcpOverride ?? mcpStore.hasEnabledServers(perChatOverrides);
		const hasBuiltin = this.getBuiltinTools(settings).length > 0;
		return {
			enabled: (hasMcp || hasBuiltin) && DEFAULT_AGENTIC_CONFIG.enabled,
			maxTurns,
			maxToolPreviewLines,
			maxToolCallsPerTurn
		};
	}

	async runAgenticFlow(params: AgenticFlowParams): Promise<AgenticFlowResult> {
		const { conversationId, messages, options = {}, callbacks, signal, perChatOverrides } = params;

		const settings = config();
		const hasMcpServers = mcpStore.hasEnabledServers(perChatOverrides);
		const agenticConfig = this.getConfig(settings, perChatOverrides, hasMcpServers);
		if (!agenticConfig.enabled) return { handled: false };

		// Collect built-in tools first (no async needed)
		const builtinTools = this.getBuiltinTools(settings);
		const builtinToolNames = new Set(builtinTools.map((t) => t.function.name));
		let mcpTools: ReturnType<typeof mcpStore.getToolDefinitionsForLLM> = [];

		if (hasMcpServers) {
			const initialized = await mcpStore.ensureInitialized(perChatOverrides);
			if (!initialized) {
				logger.info('[AgenticStore] MCP not initialized, continuing with built-in tools only');
			} else {
				mcpTools = mcpStore.getToolDefinitionsForLLM();
			}
		}

		const tools = [...builtinTools, ...mcpTools];
		if (tools.length === 0) {
			logger.info('[AgenticStore] No tools available, falling back to standard chat');
			return { handled: false };
		}

		// Respect per-model tool-calling override set by the user in Settings → Connection.
		const activeModelId = params.options?.model as string | undefined;
		if (activeModelId && !modelCapabilityStore.isToolCallingEnabled(activeModelId)) {
			logger.info(
				`[AgenticStore] Tool-calling disabled for model "${activeModelId}", falling back to standard chat`
			);
			return { handled: false };
		}

		logger.info(
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
			const normalizedError = this.normalizeError(error);
			this.updateSession(conversationId, { lastError: normalizedError });
			callbacks.onError?.(normalizedError);
			return { handled: true, error: normalizedError };
		} finally {
			this.updateSession(conversationId, { isRunning: false });
			runCommandSessionStore.clearPending();
			if (mcpTools.length > 0) {
				await mcpStore
					.releaseConnection()
					.catch((err: unknown) =>
						logger.warn('[AgenticStore] Failed to release MCP connection:', err)
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
				this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
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
								this.devLog(
									'[agentic onToolCallChunk] turn=',
									turn + 1,
									'count=',
									turnToolCalls.length,
									turnToolCalls.map((c) => c.function?.name).join(', ') || '(empty)'
								);
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
									}
								}
							} catch (e) {
								this.devLog(
									'[agentic onToolCallChunk] JSON parse error:',
									e,
									'raw:',
									serialized.slice(0, 200)
								);
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
					this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
					return;
				}
				const normalizedError = this.normalizeError(error);
				// Save error as content in the current turn
				onChunk?.(`${LLM_ERROR_BLOCK_START}${normalizedError.message}${LLM_ERROR_BLOCK_END}`);
				await onAssistantTurnComplete?.(
					turnContent + `${LLM_ERROR_BLOCK_START}${normalizedError.message}${LLM_ERROR_BLOCK_END}`,
					turnReasoningContent || undefined,
					this.buildFinalTimings(capturedTimings, agenticTimings),
					undefined
				);
				this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
				throw normalizedError;
			}

			// No tool calls = final turn, save and complete
			this.devLog(
				'[agentic turn complete] turn=',
				turn + 1,
				'content_len=',
				turnContent.length,
				'toolCalls=',
				turnToolCalls.length,
				'reasoning_len=',
				turnReasoningContent.length
			);
			if (turnToolCalls.length === 0) {
				this.devLog('[agentic] FINAL TURN detected (no tool calls)');
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

			// Normalize, deduplicate, and save assistant turn with tool calls
			let normalizedCalls = this.normalizeToolCalls(turnToolCalls);
			if (normalizedCalls.length === 0) {
				await onAssistantTurnComplete?.(
					turnContent,
					turnReasoningContent || undefined,
					this.buildFinalTimings(capturedTimings, agenticTimings),
					undefined
				);
				this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
				return;
			}

			normalizedCalls = this.deduplicateToolCalls(normalizedCalls);
			if (import.meta.env.DEV && normalizedCalls.length < turnToolCalls.length) {
				logger.debug(
					`[agentic] Deduplicated ${turnToolCalls.length - normalizedCalls.length} duplicate calls, remaining: ${normalizedCalls.length}`
				);
			}

			// Cap tool calls per turn to prevent runaway parallel tool storms
			const maxToolCallsPerTurn = agenticConfig.maxToolCallsPerTurn;
			if (normalizedCalls.length > maxToolCallsPerTurn) {
				logger.warn(
					`[AgenticStore] Capping tool calls from ${normalizedCalls.length} to ${maxToolCallsPerTurn} (maxToolCallsPerTurn)`
				);
				normalizedCalls = normalizedCalls.slice(0, maxToolCallsPerTurn);
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

			// Phase 1: Execute all tool calls in parallel
			type ToolCallOutcome = {
				toolCall: (typeof normalizedCalls)[number];
				result: string;
				success: boolean;
				durationMs: number;
				extras?: DatabaseMessageExtra[];
			};

			if (signal?.aborted) {
				this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
				return;
			}

			let toolOutcomes: ToolCallOutcome[];
			try {
				toolOutcomes = await Promise.all(
					normalizedCalls.map(async (toolCall): Promise<ToolCallOutcome> => {
						const toolStartTime = performance.now();
						const mcpCall: MCPToolCall = {
							id: toolCall.id,
							function: {
								name: toolCall.function.name,
								arguments: toolCall.function.arguments
							}
						};
						let result: string;
						let extras: DatabaseMessageExtra[] | undefined;
						let success = true;
						try {
							if (builtinToolNames.has(mcpCall.function.name)) {
								const builtinResult = await this.executeBuiltinTool(
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
								result = builtinResult.content;
								extras = builtinResult.extras;
								if (result.startsWith('Error:')) success = false;
							} else {
								const executionResult = await withMcpToolTimeout(
									mcpStore.executeTool(mcpCall, signal),
									mcpCall.function.name
								);
								result = executionResult.content;
							}
						} catch (error) {
							if (isAbortError(error)) throw error;
							result = `Error: ${error instanceof Error ? error.message : String(error)}`;
							success = false;
						}
						return {
							toolCall,
							result,
							success,
							durationMs: Math.round(performance.now() - toolStartTime),
							extras
						};
					})
				);
			} catch (error) {
				if (isAbortError(error)) {
					this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
					return;
				}
				throw error;
			}

			if (signal?.aborted) {
				this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
				return;
			}

			// Phase 2: Process results sequentially (DB writes and session ordering must be serial)
			for (const { toolCall, result, success: toolSuccess, durationMs, extras } of toolOutcomes) {
				const toolTiming: ChatMessageToolCallTiming = {
					name: toolCall.function.name,
					duration_ms: durationMs,
					success: toolSuccess
				};

				agenticTimings.toolCalls!.push(toolTiming);
				agenticTimings.toolCallsCount++;
				agenticTimings.toolsMs += durationMs;
				turnStats.toolCalls.push(toolTiming);
				turnStats.toolsMs += durationMs;

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
						this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
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

				const allExtras = [...summaryExtras, ...attachments, ...(extras ?? [])];

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
							logger.info(
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
		this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
	}

	private async executeBuiltinTool(
		name: string,
		args: string,
		conversationId: string,
		messageId: string,
		allTools?: OpenAIToolDefinition[],
		signal?: AbortSignal,
		toolCallId?: string
	): Promise<{ content: string; extras?: DatabaseMessageExtra[] }> {
		let parsed: Record<string, unknown> = {};
		try {
			parsed = JSON.parse(args || '{}');
		} catch {
			/* use empty object if args are malformed */
		}

		if (BUILTIN_TOOL_EXECUTION_TARGET[name] === 'backend') {
			if (name === 'run_command') {
				const command = String(parsed.command ?? '');
				if (!command) return { content: 'Error: command is required' };
				if (!runCommandSessionStore.isApproved(command)) {
					const approved = await runCommandSessionStore.requestApproval(
						toolCallId || '',
						command,
						signal
					);
					if (!approved) {
						const baseCommand = command.trim().split(/\s+/)[0];
						return {
							content: `Error: command '${baseCommand}' is not approved for this session`
						};
					}
				}
			}

			const endpoint = serverEndpointStore.getBaseUrl();
			try {
				const resp = await fetch(`${endpoint}/api/tools/execute`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name,
						args: {
							...parsed,
							...(name === 'run_command' && {
								sessionApprovedCommands: runCommandSessionStore.getApprovedCommands()
							})
						}
					}),
					signal
				});
				if (!resp.ok) {
					const text = await resp.text().catch(() => 'Unknown error');
					return { content: `Error: HTTP ${resp.status} — ${text}` };
				}
				const data = (await resp.json()) as {
					result?: string;
					error?: string;
					truncated?: boolean;
					originalLength?: number;
				};
				if (data.error) return { content: `Error: ${data.error}` };
				const extras: DatabaseMessageExtra[] = [];
				if (data.truncated && typeof data.originalLength === 'number') {
					extras.push({
						type: AttachmentType.TRUNCATED,
						name: 'truncated',
						originalLength: data.originalLength
					});
				}
				return {
					content: String(data.result ?? ''),
					extras: extras.length > 0 ? extras : undefined
				};
			} catch (err) {
				return { content: `Error: ${err instanceof Error ? err.message : String(err)}` };
			}
		}

		switch (name) {
			case 'calculator':
				return { content: this._executeCalculatorTool(parsed) };
			case 'get_time':
				return { content: this._executeGetTimeTool(parsed) };
			case 'get_location':
				return { content: await this._executeGetLocationTool() };
			case 'call_subagent':
				return {
					content: await this._executeCallSubagentTool(
						parsed,
						conversationId,
						messageId,
						allTools,
						signal
					)
				};
			case 'list_skill':
				return { content: await this._executeListSkillTool() };
			case 'read_skill':
				return { content: await this._executeReadSkillTool(parsed, conversationId) };
			case 'create_todo': {
				const texts = Array.isArray(parsed.todos)
					? parsed.todos.filter((t: unknown) => typeof t === 'string')
					: [];
				const isRecreated = Boolean(parsed.isRecreated);
				const items = await todoStore.createTodos(conversationId, texts, isRecreated);
				return { content: todoStore.formatMarkdownList(items) };
			}
			case 'mark_todo': {
				const indices = Array.isArray(parsed.indices)
					? parsed.indices.filter((i: unknown) => typeof i === 'number' && Number.isInteger(i))
					: [];
				await todoStore.markTodos(conversationId, indices);
				return { content: 'Confirmed' };
			}
			case 'read_todo': {
				const current = await todoStore
					.loadTodos(conversationId)
					.then(() => todoStore.getTodos(conversationId));
				return { content: todoStore.formatMarkdownList(current) };
			}
			default:
				return { content: `Error: unknown built-in tool "${name}"` };
		}
	}

	private _executeCalculatorTool(parsed: Record<string, unknown>): string {
		const expression = String(parsed.expression ?? '');
		if (!expression) return 'Error: missing expression';
		try {
			const result = new Function(`"use strict"; return (${expression})`)();
			if (typeof result !== 'number' || !isFinite(result)) {
				return 'Error: expression did not produce a finite number';
			}
			return String(result);
		} catch (err) {
			return `Error: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	private _executeGetTimeTool(parsed: Record<string, unknown>): string {
		const tz = String(parsed.timezone ?? import.meta.env.TZ ?? 'UTC');
		let formatter: Intl.DateTimeFormat;
		try {
			formatter = new Intl.DateTimeFormat('en-CA', {
				timeZone: tz,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false,
				timeZoneName: 'short'
			});
		} catch {
			return `Error: invalid timezone "${tz}"`;
		}
		const parts = formatter.formatToParts(new Date());
		const get = (unit: string) => parts.find((p) => p.type === unit)?.value ?? '';
		const dateStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
		const tzAbbr = parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
		return JSON.stringify({ iso: `${dateStr}`, timezone: tz, tz_abbr: tzAbbr });
	}

	private _executeGetLocationTool(): Promise<string> {
		if (!navigator.geolocation) {
			return Promise.resolve('Error: Geolocation is not supported by this browser');
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

	private async _executeCallSubagentTool(
		parsed: Record<string, unknown>,
		conversationId: string,
		messageId: string,
		allTools?: OpenAIToolDefinition[],
		signal?: AbortSignal
	): Promise<string> {
		if (!subagentConfigStore.isConfigured || !subagentConfigStore.isEnabled) {
			return JSON.stringify({
				error:
					'Subagent not configured or not enabled. Please set endpoint, model, and enable the subagent in Settings.'
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

		const subagentTools = (allTools ?? []).filter((t: OpenAIToolDefinition) => {
			const tName = t.function?.name;
			return tName && tName !== 'call_subagent';
		});
		const builtinNameSet = getBuiltinToolNames();
		builtinNameSet.delete('call_subagent');

		const linkedController = createLinkedController(signal);
		const subagentSignal = linkedController.signal;

		const endpoint = subagentConfigStore.getEndpoint();
		const apiKey = subagentConfigStore.getApiKey();
		const url = `${endpoint}/v1/chat/completions`;
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
		const subagentToolsPayload = subagentTools.length > 0 ? subagentTools : undefined;

		const modelDisplayName = subagentModelId.split('/').pop() ?? subagentModelId;
		const originSkill = this._lastReadSkill.get(conversationId) ?? undefined;
		this.setSubagentProgress(conversationId, {
			modelName: modelDisplayName,
			steps: [],
			originSkill
		});
		this._lastReadSkill.delete(conversationId);

		const loopMessages: Record<string, unknown>[] = [];
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
		let totalTokens = 0;
		let promptTokens = 0;
		let completionTokens = 0;
		let toolCallsCount = 0;

		try {
			for (let subTurn = 0; subTurn < SUBAGENT_MAX_TURNS; subTurn++) {
				if (subagentSignal?.aborted) {
					this.setSubagentProgress(conversationId, null);
					throw new DOMException('Aborted', 'AbortError');
				}

				const requestBody: Record<string, unknown> = {
					model: subagentModelId,
					messages: loopMessages,
					stream: false,
					...(subagentToolsPayload !== undefined ? { tools: subagentToolsPayload } : {})
				};

				const response = await fetch(url, {
					method: 'POST',
					headers,
					body: JSON.stringify(requestBody),
					signal: subagentSignal
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
					usage?: {
						prompt_tokens?: number;
						completion_tokens?: number;
						total_tokens?: number;
					};
				};

				if (data.usage) {
					promptTokens += data.usage.prompt_tokens ?? 0;
					completionTokens += data.usage.completion_tokens ?? 0;
					totalTokens += data.usage.total_tokens ?? 0;
				}

				const choice = data.choices?.[0];
				if (!choice) {
					this.setSubagentProgress(conversationId, null);
					return JSON.stringify({ error: 'Invalid subagent response format' });
				}

				const assistantMsg = choice.message;
				const toolCalls = assistantMsg?.tool_calls;

				if (toolCalls && toolCalls.length > 0) {
					loopMessages.push({
						role: 'assistant',
						content: assistantMsg?.content ?? null,
						tool_calls: toolCalls
					});

					for (const tc of toolCalls ?? []) {
						const tcName = sanitizeToolName(tc.function?.name ?? '');
						const tcArgs = this.sanitizeToolArguments(tc.function?.arguments ?? '{}');
						const tcId = tc.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;

						this.addSubagentStep(conversationId, { toolName: tcName, status: 'calling' });

						toolCallsCount++;
						const currentProgress = this._subagentProgress[conversationId];
						if (currentProgress) {
							this._subagentProgress = {
								...this._subagentProgress,
								[conversationId]: {
									...currentProgress,
									toolCallsCount,
									usage: {
										total: totalTokens,
										prompt: promptTokens,
										completion: completionTokens
									}
								}
							};
						}

						let toolResult: string;
						try {
							if (builtinNameSet.has(tcName)) {
								const builtinResult = await this.executeBuiltinTool(
									tcName,
									tcArgs,
									conversationId,
									messageId,
									allTools,
									subagentSignal,
									tcId
								);
								toolResult = builtinResult.content;
							} else {
								const mcpResult = await mcpStore.executeTool(
									{ id: tcId, function: { name: tcName, arguments: tcArgs } },
									subagentSignal
								);
								toolResult = mcpResult.content;
							}
						} catch (err) {
							if (err instanceof DOMException && err.name === 'AbortError') throw err;
							toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
						}

						this.markLastSubagentStepDone(conversationId);
						loopMessages.push({ role: 'tool', tool_call_id: tcId, content: toolResult });
					}
				} else {
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
					this.setSubagentFinalStats(conversationId, { totalTokens, toolCallsCount });
					return JSON.stringify({ result: resultContent });
				}
			}

			this.setSubagentProgress(conversationId, null);
			this.setSubagentFinalStats(conversationId, { totalTokens, toolCallsCount });
			return JSON.stringify({
				error: 'Subagent reached maximum turn limit without producing a final answer'
			});
		} catch (error) {
			this.setSubagentProgress(conversationId, null);
			this.setSubagentFinalStats(conversationId, { totalTokens, toolCallsCount });
			if (isAbortError(error)) throw error;
			const message = error instanceof Error ? error.message : String(error);
			return JSON.stringify({ error: `Subagent request failed: ${message}` });
		}
	}

	private async _executeListSkillTool(): Promise<string> {
		await skillsStore.loadSkillsIfStale(30_000);
		const entries = skillsStore.getListSkillEntries();
		if (entries.length === 0) {
			return JSON.stringify({
				skills: [],
				message: 'No skills are currently enabled.'
			});
		}
		return JSON.stringify({ skills: entries });
	}

	private async _executeReadSkillTool(
		parsed: Record<string, unknown>,
		conversationId: string
	): Promise<string> {
		const name = String(parsed.name ?? '');
		if (!name) {
			return JSON.stringify({ error: 'Missing required parameter: name' });
		}
		await skillsStore.loadSkillsIfStale(30_000);
		const content = skillsStore.getReadSkillContent(name);
		if (content === null) {
			return JSON.stringify({ error: `Skill "${name}" not found or not enabled.` });
		}
		this._lastReadSkill.set(conversationId, name);
		return JSON.stringify({ name, content });
	}

	private normalizeError(error: unknown): Error {
		return error instanceof Error ? error : new Error(String(error));
	}

	private completeFlow(
		capturedTimings: ChatMessageTimings | undefined,
		agenticTimings: ChatMessageAgenticTimings,
		onFlowComplete?: (timings?: ChatMessageTimings) => void
	): void {
		onFlowComplete?.(this.buildFinalTimings(capturedTimings, agenticTimings));
	}

	private setSubagentFinalStats(conversationId: string, stats: SubagentFinalStats): void {
		this._subagentFinalStats = {
			...this._subagentFinalStats,
			[conversationId]: stats
		};
	}

	private devLog(...args: unknown[]): void {
		logger.debug(...args);
	}

	private sanitizeToolArguments(args: string): string {
		return repairJsonObject(args);
	}

	private buildFinalTimings(
		capturedTimings: ChatMessageTimings | undefined,
		agenticTimings: ChatMessageAgenticTimings
	): ChatMessageTimings | undefined {
		if (agenticTimings.toolCallsCount === 0) return capturedTimings;
		return {
			// Use cumulative token counts from agenticTimings.llm for total context bar display
			predicted_n: agenticTimings.llm.predicted_n,
			prompt_n: agenticTimings.llm.prompt_n,
			// Keep last-turn timing so predicted_per_n (tokens/sec) reflects current turn speed
			predicted_ms: capturedTimings?.predicted_ms,
			prompt_ms: capturedTimings?.prompt_ms,
			cache_n: capturedTimings?.cache_n,
			agentic: agenticTimings
		};
	}

	private normalizeToolCalls(toolCalls: ApiChatCompletionToolCall[]): AgenticToolCallList {
		if (!toolCalls) return [];
		return toolCalls
			.map((call, index) => ({
				id: call?.id ?? `tool_${index}`,
				type: (call?.type as ToolCallType.FUNCTION) ?? ToolCallType.FUNCTION,
				function: {
					name: sanitizeToolName(call?.function?.name ?? ''),
					arguments: this.sanitizeToolArguments(call?.function?.arguments ?? '')
				}
			}))
			.filter((call) => call.function.name.trim() !== '');
	}

	private deduplicateToolCalls(calls: AgenticToolCallList): AgenticToolCallList {
		const seen = new SvelteSet<string>();
		const unique: AgenticToolCallList = [];
		for (const call of calls) {
			const key = `${call.function.name}:${call.function.arguments}`;
			if (!seen.has(key)) {
				seen.add(key);
				unique.push(call);
			}
		}
		return unique;
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

export function agenticSubagentFinalStats(conversationId: string): SubagentFinalStats | null {
	return agenticStore.subagentFinalStats(conversationId);
}

export function agenticIsAnyRunning() {
	return agenticStore.isAnyRunning;
}
