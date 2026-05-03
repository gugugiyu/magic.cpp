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

import {
	ChatService,
	AgenticBuiltinToolExecutor,
	AgenticToolUtils,
	AgenticTimingService,
	AgenticToolRegistry,
	AgenticLoopHarness
} from '$lib/services';
import { config } from '$lib/stores/settings.svelte';
import { mcpStore } from '$lib/stores/mcp.svelte';
import { modelsStore } from '$lib/stores/models.svelte';
import { modelCapabilityStore } from '$lib/stores/model-capabilities.svelte';
import { isAbortError, safeNumber } from '$lib/utils';

import { runCommandSessionStore } from '$lib/stores/run-command-session.svelte';
import {
	DEFAULT_AGENTIC_CONFIG,
	TURN_LIMIT_MESSAGE,
	LLM_ERROR_BLOCK_START,
	LLM_ERROR_BLOCK_END
} from '$lib/constants';
import { McpSummarizeCancelledError } from '$lib/services/mcp/mcp-summarize-harness';
import { createModuleLogger } from '$lib/utils/logger';
import { MessageRole, ToolCallType } from '$lib/enums';
import type {
	AgenticFlowParams,
	AgenticFlowResult,
	AgenticSession,
	AgenticConfig,
	SettingsConfigType,
	McpServerOverride,
	OpenAIToolDefinition
} from '$lib/types';
import type {
	AgenticMessage,
	AgenticToolCallList,
	AgenticFlowCallbacks,
	AgenticFlowOptions
} from '$lib/types/agentic';
import type { ApiChatCompletionToolCall, ApiChatMessageData } from '$lib/types/api';
import type {
	ChatMessagePromptProgress,
	ChatMessageTimings,
	ChatMessageAgenticTimings,
	ChatMessageToolCallTiming,
	ChatMessageAgenticTurnStats
} from '$lib/types/chat';
import type { DatabaseMessage, DatabaseMessageExtra } from '$lib/types/database';

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
		const hasBuiltin = AgenticToolRegistry.fromSettings(settings).getBuiltinTools().length > 0;
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
		const registry = AgenticToolRegistry.fromSettings(settings);
		const builtinTools = registry.getBuiltinTools();
		let mcpTools: ReturnType<typeof mcpStore.getToolDefinitionsForLLM> = [];

		if (hasMcpServers) {
			const initialized = await mcpStore.ensureInitialized(perChatOverrides);
			if (!initialized) {
				logger.info('[AgenticStore] MCP not initialized, continuing with built-in tools only');
			} else {
				mcpTools = mcpStore.getToolDefinitionsForLLM();
			}
		}

		const tools = registry.mergeWithMcpTools(mcpTools);
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
				registry,
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
		registry: AgenticToolRegistry;
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
			registry,
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
				const turnResult = await AgenticLoopHarness.runSingleTurn(
					sessionMessages as ApiChatMessageData[],
					{
						...options,
						tools: tools.length > 0 ? tools : undefined,
						signal
					},
					{
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
						}
					}
				);

				turnContent = turnResult.content;
				turnReasoningContent = turnResult.reasoningContent || '';
				turnToolCalls = turnResult.toolCalls || [];
				turnTimings = turnResult.timings;

				this.updateSession(conversationId, { streamingToolCall: null });

				// If the stream was aborted by the user, exit immediately without executing tool calls.
				if (signal?.aborted) {
					this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
					return;
				}

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

			if (signal?.aborted) {
				this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
				return;
			}

			// Execute tools via shared harness
			try {
				const toolOutcomes = await AgenticLoopHarness.executeTools(normalizedCalls, {
					registry,
					conversationId,
					messageId: firstAssistantMessageId,
					allTools: tools,
					signal,
					effectiveModel,
					mcpSummarizeOutputs,
					mcpSummarizeLineThreshold,
					mcpSummarizeHardCap,
					mcpSummarizeAllTools,
					executeBuiltinTool: (name, args, convId, msgId, tcId) =>
						this.executeBuiltinTool(name, args, convId, msgId, tools, signal, tcId)
				});

				if (signal?.aborted) {
					this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
					return;
				}

				// Process results sequentially (DB writes and session ordering must be serial)
				for (const outcome of toolOutcomes) {
					const {
						toolCall,
						result,
						success: toolSuccess,
						durationMs,
						extras,
						contentParts
					} = outcome;

					const toolTiming: ChatMessageToolCallTiming = {
						name: toolCall.function?.name ?? '',
						duration_ms: durationMs,
						success: toolSuccess
					};

					agenticTimings.toolCalls!.push(toolTiming);
					agenticTimings.toolCallsCount++;
					agenticTimings.toolsMs += durationMs;
					turnStats.toolCalls.push(toolTiming);
					turnStats.toolsMs += durationMs;

					// Create the tool result message in the DB
					let toolResultMessage: DatabaseMessage | undefined;
					if (createToolResultMessage) {
						toolResultMessage = await createToolResultMessage(
							toolCall.id ?? '',
							result,
							extras?.length ? extras : undefined
						);
					}

					if (extras?.length && toolResultMessage) {
						onAttachments?.(toolResultMessage.id, extras);
					}

					sessionMessages.push({
						role: MessageRole.TOOL,
						tool_call_id: toolCall.id ?? '',
						content: contentParts ?? result
					});
				}
			} catch (error) {
				if (error instanceof McpSummarizeCancelledError || isAbortError(error)) {
					this.completeFlow(capturedTimings, agenticTimings, onFlowComplete);
					return;
				}
				throw error;
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
		return AgenticBuiltinToolExecutor.executeBuiltinTool(
			name,
			args,
			conversationId,
			messageId,
			allTools,
			signal,
			toolCallId
		);
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

	private devLog(...args: unknown[]): void {
		logger.debug(...args);
	}

	private buildFinalTimings(
		capturedTimings: ChatMessageTimings | undefined,
		agenticTimings: ChatMessageAgenticTimings
	): ChatMessageTimings | undefined {
		return AgenticTimingService.buildFinalTimings(capturedTimings, agenticTimings);
	}

	private normalizeToolCalls(toolCalls: ApiChatCompletionToolCall[]): AgenticToolCallList {
		return AgenticToolUtils.normalizeToolCalls(toolCalls);
	}

	private deduplicateToolCalls(calls: AgenticToolCallList): AgenticToolCallList {
		return AgenticToolUtils.deduplicateToolCalls(calls);
	}

	subagentProgress(_conversationId: string): null {
		return null;
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

export function agenticSubagentProgress(_conversationId: string) {
	return null;
}

export function agenticSubagentFinalStats(_conversationId: string): SubagentFinalStats | null {
	return null;
}

export function agenticIsAnyRunning() {
	return agenticStore.isAnyRunning;
}
