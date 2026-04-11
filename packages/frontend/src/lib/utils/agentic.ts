import { AgenticSectionType, MessageRole, AttachmentType } from '$lib/enums';
import { ATTACHMENT_SAVED_REGEX, NEWLINE_SEPARATOR } from '$lib/constants';
import { DATA_URI_BASE64_REGEX } from '$lib/constants/mcp-resource';
import type { ApiChatCompletionToolCall } from '$lib/types/api';
import type {
	DatabaseMessage,
	DatabaseMessageExtra,
	DatabaseMessageExtraImageFile
} from '$lib/types/database';

/**
 * Represents a parsed section of agentic content for display
 */
export interface AgenticSection {
	type: AgenticSectionType;
	content: string;
	toolName?: string;
	toolArgs?: string;
	toolResult?: string;
	toolResultExtras?: DatabaseMessageExtra[];
	/** Whether this tool result was summarized via the MCP harness */
	wasSummarized?: boolean;
	/** Whether this tool result was auto-cropped by the hard cap */
	wasCropped?: boolean;
	/** The message ID this section's content originated from. Used for per-section editing. */
	sourceMessageId?: string;
}

/**
 * Represents a tool result line that may reference an image attachment
 */
export type ToolResultLine = {
	text: string;
	image?: DatabaseMessageExtraImageFile;
	/** Raw data URI for inline images not going through the attachment system */
	dataUri?: string;
};

/**
 * Derives display sections from a single assistant message and its direct tool results.
 *
 * @param message - The assistant message
 * @param toolMessages - Tool result messages for this assistant's tool_calls
 * @param streamingToolCalls - Partial tool calls during streaming (not yet persisted)
 */
function deriveSingleTurnSections(
	message: DatabaseMessage,
	toolMessages: DatabaseMessage[] = [],
	streamingToolCalls: ApiChatCompletionToolCall[] = [],
	isStreaming: boolean = false
): AgenticSection[] {
	const sections: AgenticSection[] = [];

	// 1. Reasoning content (from dedicated field)
	if (message.reasoningContent) {
		const toolCalls = parseToolCalls(message.toolCalls);
		const hasContentAfterReasoning =
			!!message.content?.trim() || toolCalls.length > 0 || streamingToolCalls.length > 0;
		const isPending = isStreaming && !hasContentAfterReasoning;
		sections.push({
			type: isPending ? AgenticSectionType.REASONING_PENDING : AgenticSectionType.REASONING,
			content: message.reasoningContent,
			sourceMessageId: message.id
		});
	}

	// 2. Text content
	if (message.content?.trim()) {
		sections.push({
			type: AgenticSectionType.TEXT,
			content: message.content,
			sourceMessageId: message.id
		});
	}

	// 3. Persisted tool calls (from message.toolCalls field)
	const toolCalls = parseToolCalls(message.toolCalls);
	for (const tc of toolCalls) {
		const resultMsg = toolMessages.find((m) => m.toolCallId === tc.id);
		const wasSummarized =
			resultMsg?.extra?.some(
				(e) => e.type === AttachmentType.MCP_SUMMARY && e.name === 'summarized'
			) ?? false;
		const wasCropped =
			resultMsg?.extra?.some(
				(e) => e.type === AttachmentType.MCP_SUMMARY && e.name === 'cropped'
			) ?? false;
		sections.push({
			type: resultMsg ? AgenticSectionType.TOOL_CALL : AgenticSectionType.TOOL_CALL_PENDING,
			content: resultMsg?.content || '',
			toolName: tc.function?.name,
			toolArgs: tc.function?.arguments,
			toolResult: resultMsg?.content,
			toolResultExtras: resultMsg?.extra,
			wasSummarized,
			wasCropped,
			sourceMessageId: message.id
		});
	}

	// 4. Streaming tool calls (not yet persisted - currently being received)
	for (const tc of streamingToolCalls) {
		// Skip if already in persisted tool calls
		if (tc.id && toolCalls.find((t) => t.id === tc.id)) continue;
		sections.push({
			type: AgenticSectionType.TOOL_CALL_STREAMING,
			content: '',
			toolName: tc.function?.name,
			toolArgs: tc.function?.arguments,
			sourceMessageId: message.id
		});
	}

	return sections;
}

/**
 * Derives display sections from structured message data.
 *
 * Handles both single-turn (one assistant + its tool results) and multi-turn
 * agentic sessions (multiple assistant + tool messages grouped together).
 *
 * When `toolMessages` contains continuation assistant messages (from multi-turn
 * agentic flows), they are processed in order to produce sections across all turns.
 *
 * @param message - The first/anchor assistant message
 * @param toolMessages - Tool result messages and continuation assistant messages
 * @param streamingToolCalls - Partial tool calls during streaming (not yet persisted)
 * @param isStreaming - Whether the message is currently being streamed
 */
export function deriveAgenticSections(
	message: DatabaseMessage,
	toolMessages: DatabaseMessage[] = [],
	streamingToolCalls: ApiChatCompletionToolCall[] = [],
	isStreaming: boolean = false
): AgenticSection[] {
	const hasAssistantContinuations = toolMessages.some((m) => m.role === MessageRole.ASSISTANT);

	if (!hasAssistantContinuations) {
		return deriveSingleTurnSections(message, toolMessages, streamingToolCalls, isStreaming);
	}

	const sections: AgenticSection[] = [];

	const firstTurnToolMsgs = collectToolMessages(toolMessages, 0);
	sections.push(...deriveSingleTurnSections(message, firstTurnToolMsgs));

	let i = firstTurnToolMsgs.length;

	while (i < toolMessages.length) {
		const msg = toolMessages[i];

		if (msg.role === MessageRole.ASSISTANT) {
			const turnToolMsgs = collectToolMessages(toolMessages, i + 1);
			const isLastTurn = i + 1 + turnToolMsgs.length >= toolMessages.length;

			sections.push(
				...deriveSingleTurnSections(
					msg,
					turnToolMsgs,
					isLastTurn ? streamingToolCalls : [],
					isLastTurn && isStreaming
				)
			);

			i += 1 + turnToolMsgs.length;
		} else {
			i++;
		}
	}

	return sections;
}

/**
 * Collect consecutive tool messages starting at `startIndex`.
 */
function collectToolMessages(messages: DatabaseMessage[], startIndex: number): DatabaseMessage[] {
	const result: DatabaseMessage[] = [];

	for (let i = startIndex; i < messages.length; i++) {
		if (messages[i].role === MessageRole.TOOL) {
			result.push(messages[i]);
		} else {
			break;
		}
	}

	return result;
}

/**
 * Parse tool result text into lines, matching image attachments by name.
 * Also detects base64 data URIs directly embedded in tool result text.
 */
export function parseToolResultWithImages(
	toolResult: string,
	extras?: DatabaseMessageExtra[]
): ToolResultLine[] {
	const lines = toolResult.split(NEWLINE_SEPARATOR);
	return lines.map((line) => {
		// First, check for [Attachment saved: <name>] pattern
		const attachmentMatch = line.match(ATTACHMENT_SAVED_REGEX);
		if (attachmentMatch && extras) {
			const attachmentName = attachmentMatch[1];
			const image = extras.find(
				(e): e is DatabaseMessageExtraImageFile =>
					e.type === AttachmentType.IMAGE && e.name === attachmentName
			);
			if (image) return { text: line, image };
		}

		// Fallback: check if the line itself is a base64 data URI
		const trimmedLine = line.trim();
		const dataUriMatch = trimmedLine.match(DATA_URI_BASE64_REGEX);
		if (dataUriMatch) {
			const mimeType = dataUriMatch[1];
			// Only render image types
			if (mimeType.startsWith('image/')) {
				return { text: line, dataUri: trimmedLine };
			}
		}

		return { text: line };
	});
}

/**
 * Safely parse the toolCalls JSON string from a DatabaseMessage.
 */
function parseToolCalls(toolCallsJson?: string): ApiChatCompletionToolCall[] {
	if (!toolCallsJson) return [];

	try {
		const parsed = JSON.parse(toolCallsJson);

		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/**
 * Check if a message has agentic content (tool calls or is part of an agentic flow).
 */
export function hasAgenticContent(
	message: DatabaseMessage,
	toolMessages: DatabaseMessage[] = []
): boolean {
	if (message.toolCalls) {
		const tc = parseToolCalls(message.toolCalls);

		if (tc.length > 0) return true;
	}

	return toolMessages.length > 0;
}
