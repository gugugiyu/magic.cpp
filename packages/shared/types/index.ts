import type { AttachmentType } from '../enums/attachment';
import type { MessageRole, MessageType } from '../enums/chat';

// Re-export enums for convenience
export type { MessageRole, MessageType } from '../enums/chat';
export type { AttachmentType } from '../enums/attachment';

// Re-export skill types
export type { SkillDefinition, SkillFrontmatter, SkillListEntry, SkillReadResult } from './skills';

// ========================
// API types (minimal subset needed for shared types)
// ========================

export interface ApiChatCompletionToolCallFunction {
	name?: string | null;
	arguments?: string | null;
}

export interface ApiChatCompletionToolCall {
	index: number;
	id: string;
	type: 'function';
	function: ApiChatCompletionToolCallFunction;
}

export interface OpenAIToolDefinition {
	type: 'function';
	function: {
		name: string;
		description?: string;
		parameters: Record<string, unknown>;
	};
}

// ========================
// Chat timing types
// ========================

export interface ChatMessagePromptProgress {
	cache: number;
	processed: number;
	time_ms: number;
	total: number;
}

export interface ChatMessageToolCallTiming {
	name: string;
	duration_ms: number;
	success: boolean;
}

export interface ChatMessageAgenticTurnStats {
	turn: number;
	llm: {
		predicted_n: number;
		predicted_ms: number;
		prompt_n: number;
		prompt_ms: number;
	};
	toolCalls: ChatMessageToolCallTiming[];
	toolsMs: number;
}

export interface ChatMessageAgenticTimings {
	turns: number;
	toolCallsCount: number;
	toolsMs: number;
	toolCalls?: ChatMessageToolCallTiming[];
	perTurn?: ChatMessageAgenticTurnStats[];
	llm: {
		predicted_n: number;
		predicted_ms: number;
		prompt_n: number;
		prompt_ms: number;
	};
}

export interface ChatMessageTimings {
	cache_n?: number;
	predicted_ms?: number;
	predicted_n?: number;
	prompt_ms?: number;
	prompt_n?: number;
	agentic?: ChatMessageAgenticTimings;
}

// ========================
// Database conversation types
// ========================

export interface McpServerOverride {
	serverId: string;
	enabled: boolean;
}

export interface TodoItem {
	text: string;
	done: boolean;
}

export interface DatabaseConversation {
	currNode: string | null;
	id: string;
	lastModified: number;
	name: string;
	mcpServerOverrides?: McpServerOverride[];
	forkedFromConversationId?: string | null;
	pinned?: boolean | null;
	todos?: TodoItem[];
}

// ========================
// Database message extra types
// ========================

export interface DatabaseMessageExtraAudioFile {
	type: AttachmentType.AUDIO;
	name: string;
	base64Data: string;
	mimeType: string;
}

export interface DatabaseMessageExtraImageFile {
	type: AttachmentType.IMAGE;
	name: string;
	base64Url: string;
}

/**
 * Legacy format from old webui - pasted content was stored as "context" type
 * @deprecated Use DatabaseMessageExtraTextFile instead
 */
export interface DatabaseMessageExtraLegacyContext {
	type: AttachmentType.LEGACY_CONTEXT;
	name: string;
	content: string;
}

export interface DatabaseMessageExtraPdfFile {
	type: AttachmentType.PDF;
	base64Data: string;
	name: string;
	content: string;
	images?: string[];
	processedAsImages: boolean;
}

export interface DatabaseMessageExtraTextFile {
	type: AttachmentType.TEXT;
	name: string;
	content: string;
}

export interface DatabaseMessageExtraMcpPrompt {
	type: AttachmentType.MCP_PROMPT;
	name: string;
	serverName: string;
	promptName: string;
	content: string;
	arguments?: Record<string, string>;
}

export interface DatabaseMessageExtraMcpResource {
	type: AttachmentType.MCP_RESOURCE;
	name: string;
	uri: string;
	serverName: string;
	content: string;
	mimeType?: string;
}

export interface DatabaseMessageExtraMcpSummary {
	type: AttachmentType.MCP_SUMMARY;
	name: string;
	originalLineCount: number;
}

export interface DatabaseMessageExtraTruncated {
	type: AttachmentType.TRUNCATED;
	name: string;
	originalLength: number;
}

export interface DatabaseMessageExtraCompactionSummary {
	type: AttachmentType.COMPACTION_SUMMARY;
	name: string;
	/** Token count saved from the compaction operation */
	tokensSaved: number;
}

export type DatabaseMessageExtra =
	| DatabaseMessageExtraImageFile
	| DatabaseMessageExtraTextFile
	| DatabaseMessageExtraAudioFile
	| DatabaseMessageExtraPdfFile
	| DatabaseMessageExtraMcpPrompt
	| DatabaseMessageExtraMcpResource
	| DatabaseMessageExtraMcpSummary
	| DatabaseMessageExtraTruncated
	| DatabaseMessageExtraCompactionSummary
	| DatabaseMessageExtraLegacyContext;

// ========================
// Database message types
// ========================

export interface DatabaseMessage {
	id: string;
	convId: string;
	type: string;
	timestamp: number;
	role: string;
	content: string;
	parent: string | null;
	/**
	 * @deprecated - left for backward compatibility
	 */
	thinking?: string;
	/** Reasoning content produced by the model (separate from visible content) */
	reasoningContent?: string;
	/** Serialized JSON array of tool calls made by assistant messages */
	toolCalls?: string;
	/** Tool call ID for tool result messages (role: 'tool') */
	toolCallId?: string;
	children: string[];
	extra?: DatabaseMessageExtra[];
	timings?: ChatMessageTimings;
	model?: string;
}

export type ExportedConversation = {
	conv: DatabaseConversation;
	messages: DatabaseMessage[];
};

export type ExportedConversations = ExportedConversation | ExportedConversation[];

// ========================
// Chat sibling types
// ========================

export interface ChatMessageSiblingInfo {
	message: DatabaseMessage;
	siblingIds: string[];
	currentIndex: number;
	totalSiblings: number;
}

// ========================
// Chat stream callbacks
// ========================

/**
 * Callbacks for streaming chat responses (used by both agentic and non-agentic paths)
 * Note: Uses generic API types that both frontend and backend can work with
 */
export interface ChatStreamCallbacks<TToolCall = unknown> {
	onChunk?: (chunk: string) => void;
	onReasoningChunk?: (chunk: string) => void;
	onToolCallsStreaming?: (toolCalls: TToolCall[]) => void;
	onAttachments?: (messageId: string, extras: DatabaseMessageExtra[]) => void;
	onModel?: (model: string) => void;
	onTimings?: (timings?: ChatMessageTimings, promptProgress?: ChatMessagePromptProgress) => void;
	onAssistantTurnComplete?: (
		content: string,
		reasoningContent: string | undefined,
		timings: ChatMessageTimings | undefined,
		toolCalls: TToolCall[] | undefined
	) => Promise<string>;
	createToolResultMessage?: (
		toolCallId: string,
		content: string,
		extras?: DatabaseMessageExtra[]
	) => Promise<DatabaseMessage>;
	createAssistantMessage?: () => Promise<DatabaseMessage>;
	onFlowComplete?: (timings?: ChatMessageTimings) => void;
	onError?: (error: Error) => void;
	onTurnComplete?: (intermediateTimings: ChatMessageTimings) => void;
}
