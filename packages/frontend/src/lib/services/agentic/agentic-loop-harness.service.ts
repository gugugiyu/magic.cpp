import { ChatService } from '$lib/services';
import { AgenticToolRegistry } from './agentic-tool-registry.service';
import { AgenticAttachmentService } from './agentic-attachment.service';
import { mcpStore } from '$lib/stores/mcp.svelte';
import { modelsStore } from '$lib/stores/models.svelte';
import {
	processToolOutput as processMcpToolOutput,
	countLines
} from '$lib/services/mcp/mcp-summarize-harness';
import { AttachmentType, ContentPartType } from '$lib/enums';
import type { OpenAIToolDefinition } from '$lib/types';
import type {
	ApiChatCompletionToolCall,
	ApiChatMessageData,
	ApiChatMessageContentPart
} from '$lib/types/api';
import type { ChatMessagePromptProgress, ChatMessageTimings } from '$lib/types/chat';
import type { DatabaseMessageExtra, DatabaseMessageExtraImageFile } from '$lib/types/database';

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

export interface AgenticTurnCallbacks {
	onChunk?: (chunk: string) => void;
	onReasoningChunk?: (chunk: string) => void;
	onToolCallChunk?: (serializedToolCalls: string) => void;
	onModel?: (model: string) => void;
	onTimings?: (timings?: ChatMessageTimings, promptProgress?: ChatMessagePromptProgress) => void;
}

export interface AgenticTurnResult {
	content: string;
	reasoningContent?: string;
	toolCalls?: ApiChatCompletionToolCall[];
	timings?: ChatMessageTimings;
}

export interface ToolCallOutcome {
	toolCall: ApiChatCompletionToolCall;
	result: string;
	success: boolean;
	durationMs: number;
	extras?: DatabaseMessageExtra[];
	/** Content parts for vision model session history (includes image attachments). */
	contentParts?: ApiChatMessageContentPart[];
}

export interface ExecuteBuiltinToolFn {
	(
		name: string,
		args: string,
		conversationId: string,
		messageId: string,
		toolCallId?: string
	): Promise<{ content: string; extras?: DatabaseMessageExtra[] }>;
}

export interface ExecuteToolsOptions {
	registry: AgenticToolRegistry;
	conversationId: string;
	messageId: string;
	allTools?: OpenAIToolDefinition[];
	signal?: AbortSignal;
	effectiveModel?: string;
	mcpSummarizeOutputs: boolean;
	mcpSummarizeLineThreshold: number;
	mcpSummarizeHardCap: number;
	mcpSummarizeAllTools: boolean;
	executeBuiltinTool: ExecuteBuiltinToolFn;
}

/**
 * AgenticLoopHarness - Stateless shared harness for multi-turn agentic execution.
 *
 * Handles one turn of streaming LLM inference + parallel tool execution + result
 * processing. Does NOT manage conversation-level state, DB callbacks, MCP lifecycle,
 * or UI stores.
 *
 * Used by both the main agentic loop (agenticStore) and the subagent executor
 * (AgenticBuiltinToolExecutor.executeCallSubagent).
 */
export class AgenticLoopHarness {
	/**
	 * Run a single streaming LLM turn and return the accumulated result.
	 */
	static async runSingleTurn(
		messages: ApiChatMessageData[],
		options: {
			model?: string;
			endpoint?: string;
			apiKey?: string;
			tools?: OpenAIToolDefinition[];
			signal?: AbortSignal;
			temperature?: number;
			max_tokens?: number;
			dynatemp_range?: number;
			dynatemp_exponent?: number;
			top_k?: number;
			top_p?: number;
			min_p?: number;
			xtc_probability?: number;
			xtc_threshold?: number;
			typ_p?: number;
			repeat_last_n?: number;
			repeat_penalty?: number;
			presence_penalty?: number;
			frequency_penalty?: number;
			dry_multiplier?: number;
			dry_base?: number;
			dry_allowed_length?: number;
			dry_penalty_last_n?: number;
			samplers?: string | string[];
			backend_sampling?: boolean;
			custom?: string;
			timings_per_token?: boolean;
			disableReasoningParsing?: boolean;
			excludeReasoningFromContext?: boolean;
		},
		callbacks: AgenticTurnCallbacks
	): Promise<AgenticTurnResult> {
		let turnContent = '';
		let turnReasoningContent = '';
		let turnToolCalls: ApiChatCompletionToolCall[] = [];
		let turnTimings: ChatMessageTimings | undefined;

		await ChatService.sendMessage(
			messages,
			{
				...options,
				stream: true,
				parallel_tool_calls: true,
				tools: options.tools && options.tools.length > 0 ? options.tools : undefined,
				onChunk: (chunk: string) => {
					turnContent += chunk;
					callbacks.onChunk?.(chunk);
				},
				onReasoningChunk: (chunk: string) => {
					turnReasoningContent += chunk;
					callbacks.onReasoningChunk?.(chunk);
				},
				onToolCallChunk: (serialized: string) => {
					try {
						turnToolCalls = JSON.parse(serialized) as ApiChatCompletionToolCall[];
						callbacks.onToolCallChunk?.(serialized);
					} catch {
						/* ignore parse errors from partial chunks */
					}
				},
				onModel: callbacks.onModel,
				onTimings: (timings?: ChatMessageTimings, progress?: ChatMessagePromptProgress) => {
					callbacks.onTimings?.(timings, progress);
					if (timings) {
						turnTimings = timings;
					}
				},
				onComplete: () => {
					/* accumulated in local vars; returned after Promise resolves */
				}
			},
			undefined,
			options.signal
		);

		return {
			content: turnContent,
			reasoningContent: turnReasoningContent || undefined,
			toolCalls: turnToolCalls.length > 0 ? turnToolCalls : undefined,
			timings: turnTimings
		};
	}

	/**
	 * Execute a batch of tool calls in parallel, then process results sequentially.
	 *
	 * Returns ToolCallOutcome objects that the caller can persist to the DB and/or
	 * append to the message history.
	 */
	static async executeTools(
		toolCalls: ApiChatCompletionToolCall[],
		options: ExecuteToolsOptions
	): Promise<ToolCallOutcome[]> {
		const {
			registry,
			conversationId,
			messageId,
			signal,
			effectiveModel,
			mcpSummarizeOutputs,
			mcpSummarizeLineThreshold,
			mcpSummarizeHardCap,
			mcpSummarizeAllTools,
			executeBuiltinTool
		} = options;

		// Phase 1: Execute all tool calls in parallel
		const toolOutcomes = await Promise.all(
			toolCalls.map(async (toolCall): Promise<ToolCallOutcome> => {
				const toolStartTime = performance.now();
				const name = toolCall.function?.name ?? '';
				const args = toolCall.function?.arguments ?? '';
				const id = toolCall.id ?? '';

				let result: string;
				let extras: DatabaseMessageExtra[] | undefined;
				let success = true;

				try {
					if (registry.isBuiltin(name)) {
						const builtinResult = await executeBuiltinTool(
							name,
							args,
							conversationId,
							messageId,
							id
						);
						result = builtinResult.content;
						extras = builtinResult.extras;
						if (result.startsWith('Error:')) success = false;
					} else {
						const executionResult = await withMcpToolTimeout(
							mcpStore.executeTool({ id, function: { name, arguments: args } }, signal),
							name
						);
						result = executionResult.content;
					}
				} catch (error) {
					if (signal?.aborted) throw error;
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

		// Phase 2: Process results sequentially (summarize, extract attachments, build content parts)
		const processedOutcomes: ToolCallOutcome[] = [];

		for (const outcome of toolOutcomes) {
			const { toolCall, result, success, durationMs, extras } = outcome;
			const name = toolCall.function?.name ?? '';

			const { cleanedResult: rawCleanedResult, attachments } =
				AgenticAttachmentService.extractBase64Attachments(result);

			// MCP response length harness
			const summarizeEnabled = registry.shouldSummarize(name, {
				mcpSummarizeOutputs,
				mcpSummarizeAllTools
			});

			const {
				content: cleanedResult,
				wasSummarized,
				wasCropped
			} = await processMcpToolOutput(
				name,
				rawCleanedResult,
				summarizeEnabled,
				mcpSummarizeLineThreshold,
				mcpSummarizeHardCap,
				signal
			);

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

			// Build content parts for session history (including images for vision models)
			const contentParts: ApiChatMessageContentPart[] = [
				{ type: ContentPartType.TEXT, text: cleanedResult }
			];

			for (const attachment of attachments) {
				if (attachment.type === AttachmentType.IMAGE) {
					if (effectiveModel && modelsStore.modelSupportsVision(effectiveModel)) {
						contentParts.push({
							type: ContentPartType.IMAGE_URL,
							image_url: { url: (attachment as DatabaseMessageExtraImageFile).base64Url }
						});
					}
				}
			}

			processedOutcomes.push({
				toolCall,
				result: cleanedResult,
				success,
				durationMs,
				extras: allExtras.length > 0 ? allExtras : undefined,
				contentParts: contentParts.length === 1 ? undefined : contentParts
			});
		}

		return processedOutcomes;
	}
}
