/**
 * Integration tests: ChatService message conversion pipeline
 *
 * Tests the full chain from DatabaseMessage → ApiChatMessageData conversion,
 * including multi-message pipelines that simulate what sendMessage does before
 * sending to the server. Mocks: stores, api-fetch, abort, filters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageRole, ContentPartType, AttachmentType } from '$lib/enums';
import {
	makeUserMessage,
	makeAssistantMessage,
	makeSystemMessage,
	makeToolMessage,
	makeToolCallMessage,
	makeBranchingConversation,
	makeLinearConversation,
	resetIdCounter
} from '../fixtures/messages';

vi.mock('$lib/stores/models.svelte', () => ({
	modelsStore: { modelSupportsVision: () => true }
}));

vi.mock('$lib/stores/settings.svelte', () => ({
	settingsStore: { config: { filterLanguagePinner: false } }
}));

vi.mock('$lib/stores/server-endpoint.svelte', () => ({
	serverEndpointStore: { isDefault: () => true, getBaseUrl: () => '' }
}));

vi.mock('$lib/utils/api-headers', () => ({
	getJsonHeaders: () => ({ 'Content-Type': 'application/json' })
}));

vi.mock('$lib/utils/api-fetch', () => ({ apiPost: vi.fn() }));

vi.mock('$lib/utils/abort', () => ({ isAbortError: vi.fn().mockReturnValue(false) }));

vi.mock('$lib/utils/filters', () => ({ detectLanguagePinner: vi.fn().mockReturnValue(null) }));

// Prevent lucide icon .svelte files from being compiled in Node env
// ($lib/constants barrel imports @lucide/svelte icons via settings-config.ts and mcp.ts)
vi.mock('@lucide/svelte', () => ({}));

const { ChatService } = await import('$lib/services/chat.service');

beforeEach(() => {
	resetIdCounter();
});

// ─────────────────────────────────────────────────────────────────────────────
// Single message conversion
// ─────────────────────────────────────────────────────────────────────────────

describe('convertDbMessageToApiChatMessageData: basic role mapping', () => {
	it('user message maps to user role with string content', () => {
		const msg = makeUserMessage({ content: 'Hello, world!' });
		const result = ChatService.convertDbMessageToApiChatMessageData(msg);

		expect(result.role).toBe(MessageRole.USER);
		expect(result.content).toBe('Hello, world!');
	});

	it('assistant message maps to assistant role', () => {
		const msg = makeAssistantMessage({ content: 'The answer is 42.' });
		const result = ChatService.convertDbMessageToApiChatMessageData(msg);

		expect(result.role).toBe(MessageRole.ASSISTANT);
		expect(result.content).toBe('The answer is 42.');
	});

	it('system message maps to system role', () => {
		const msg = makeSystemMessage({ content: 'You are a coding assistant.' });
		const result = ChatService.convertDbMessageToApiChatMessageData(msg);

		expect(result.role).toBe(MessageRole.SYSTEM);
		expect(result.content).toBe('You are a coding assistant.');
	});

	it('tool message maps to tool role with tool_call_id', () => {
		const msg = makeToolMessage({ content: '{"result":42}', toolCallId: 'call-xyz' });
		const result = ChatService.convertDbMessageToApiChatMessageData(msg);

		expect(result.role).toBe(MessageRole.TOOL);
		expect(result.tool_call_id).toBe('call-xyz');
		expect(result.content).toBe('{"result":42}');
	});

	it('assistant message with reasoning_content includes it in api format', () => {
		const msg = makeAssistantMessage({
			content: 'The answer.',
			reasoningContent: 'I reasoned about it.'
		});
		const result = ChatService.convertDbMessageToApiChatMessageData(msg);

		expect(result.reasoning_content).toBe('I reasoned about it.');
	});

	it('tool call message includes parsed tool_calls array', () => {
		const msg = makeToolCallMessage({});
		const result = ChatService.convertDbMessageToApiChatMessageData(msg);

		expect(result.tool_calls).toBeDefined();
		expect(result.tool_calls!.length).toBeGreaterThan(0);
		expect(result.tool_calls![0].function?.name).toBe('calculator');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-message pipeline: linear conversation
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-message pipeline: linear conversation messages', () => {
	it('converts all messages in a linear conversation preserving order', () => {
		const messages = makeLinearConversation().filter((m) => m.type !== 'root');

		const converted = messages.map((m) => ChatService.convertDbMessageToApiChatMessageData(m));

		expect(converted).toHaveLength(4);
		expect(converted[0].role).toBe(MessageRole.USER);
		expect(converted[1].role).toBe(MessageRole.ASSISTANT);
		expect(converted[2].role).toBe(MessageRole.USER);
		expect(converted[3].role).toBe(MessageRole.ASSISTANT);
	});

	it('converted messages alternate user/assistant', () => {
		const messages = makeLinearConversation().filter((m) => m.type !== 'root');
		const converted = messages.map((m) => ChatService.convertDbMessageToApiChatMessageData(m));

		for (let i = 0; i < converted.length; i++) {
			if (i % 2 === 0) {
				expect(converted[i].role).toBe(MessageRole.USER);
			} else {
				expect(converted[i].role).toBe(MessageRole.ASSISTANT);
			}
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-message pipeline: branching conversation path
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-message pipeline: branching conversation path', () => {
	it('branch A path messages convert without including branch B messages', async () => {
		const { filterByLeafNodeId } = await import('$lib/utils/branching');
		const allMessages = makeBranchingConversation();

		// Branch A path: user-1, assistant-1, user-2a, assistant-2a
		const branchAPath = filterByLeafNodeId(allMessages, 'assistant-2a');
		const converted = branchAPath.map((m) => ChatService.convertDbMessageToApiChatMessageData(m));

		expect(converted).toHaveLength(4);
		// None should be from branch B
		const ids = branchAPath.map((m) => m.id);
		expect(ids).not.toContain('user-2b');
	});

	it('branch B path messages convert without including branch A messages', async () => {
		const { filterByLeafNodeId } = await import('$lib/utils/branching');
		const allMessages = makeBranchingConversation();

		const branchBPath = filterByLeafNodeId(allMessages, 'user-2b');
		const ids = branchBPath.map((m) => m.id);
		expect(ids).not.toContain('assistant-2a');
		expect(ids).not.toContain('user-2a');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Image attachment conversion
// ─────────────────────────────────────────────────────────────────────────────

describe('attachment conversion: image', () => {
	it('image attachment produces IMAGE_URL content part', () => {
		const msg = makeUserMessage({
			content: 'Look at this',
			extra: [
				{
					type: AttachmentType.IMAGE,
					name: 'photo.png',
					base64Url: 'data:image/png;base64,iVBORw0KGgo='
				}
			] as DatabaseMessage['extra']
		});

		const result = ChatService.convertDbMessageToApiChatMessageData(msg);
		const parts = result.content as Array<{
			type: string;
			image_url?: { url: string };
			text?: string;
		}>;

		expect(Array.isArray(parts)).toBe(true);
		const imgPart = parts.find((p) => p.type === ContentPartType.IMAGE_URL);
		expect(imgPart).toBeDefined();
		expect(imgPart!.image_url!.url).toBe('data:image/png;base64,iVBORw0KGgo=');

		const textPart = parts.find((p) => p.type === ContentPartType.TEXT);
		expect(textPart?.text).toBe('Look at this');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Text file attachment conversion
// ─────────────────────────────────────────────────────────────────────────────

describe('attachment conversion: text file', () => {
	it('text attachment produces TEXT content part referencing the file name', () => {
		const msg = makeUserMessage({
			content: 'Here is the file',
			extra: [
				{
					type: AttachmentType.TEXT,
					name: 'notes.txt',
					content: 'Important notes here'
				}
			] as DatabaseMessage['extra']
		});

		const result = ChatService.convertDbMessageToApiChatMessageData(msg);
		const parts = result.content as Array<{ type: string; text?: string }>;

		expect(Array.isArray(parts)).toBe(true);
		const textParts = parts.filter((p) => p.type === ContentPartType.TEXT);
		const combined = textParts.map((p) => p.text ?? '').join('\n');
		expect(combined).toContain('notes.txt');
		expect(combined).toContain('Important notes here');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool call chain: tool-call message followed by tool result
// ─────────────────────────────────────────────────────────────────────────────

describe('tool call chain: tool-call message followed by tool result', () => {
	it('tool call and its result convert to the correct API format sequence', () => {
		const toolCallMsg = makeToolCallMessage({
			toolCalls: JSON.stringify([
				{
					id: 'call-weather',
					type: 'function',
					function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' }
				}
			])
		});

		const toolResultMsg = makeToolMessage({
			content: '{"temperature": 22, "condition": "sunny"}',
			toolCallId: 'call-weather'
		});

		const convertedCall = ChatService.convertDbMessageToApiChatMessageData(toolCallMsg);
		const convertedResult = ChatService.convertDbMessageToApiChatMessageData(toolResultMsg);

		expect(convertedCall.role).toBe(MessageRole.ASSISTANT);
		expect(convertedCall.tool_calls![0].id).toBe('call-weather');
		expect(convertedCall.tool_calls![0].function?.name).toBe('get_weather');

		expect(convertedResult.role).toBe(MessageRole.TOOL);
		expect(convertedResult.tool_call_id).toBe('call-weather');
		expect(convertedResult.content).toContain('22');
	});

	it('multiple tool calls in one message all appear in tool_calls array', () => {
		const toolCallMsg = makeToolCallMessage({
			toolCalls: JSON.stringify([
				{
					id: 'call-1',
					type: 'function',
					function: { name: 'search', arguments: '{"q":"ai"}' }
				},
				{
					id: 'call-2',
					type: 'function',
					function: { name: 'calculator', arguments: '{"expr":"2+2"}' }
				}
			])
		});

		const converted = ChatService.convertDbMessageToApiChatMessageData(toolCallMsg);

		expect(converted.tool_calls).toHaveLength(2);
		expect(converted.tool_calls![0].id).toBe('call-1');
		expect(converted.tool_calls![1].id).toBe('call-2');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Mixed message pipeline: system + user + assistant + tool
// ─────────────────────────────────────────────────────────────────────────────

describe('mixed message pipeline: system + user + assistant + tool call chain', () => {
	it('full agent turn sequence converts without losing any roles', () => {
		const system = makeSystemMessage({ content: 'You are a helpful assistant.' });
		const user = makeUserMessage({ content: 'What is the weather in Tokyo?' });
		const toolCall = makeToolCallMessage({
			toolCalls: JSON.stringify([
				{
					id: 'c1',
					type: 'function',
					function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' }
				}
			])
		});
		const toolResult = makeToolMessage({
			content: '{"temp":22}',
			toolCallId: 'c1'
		});
		const assistant = makeAssistantMessage({ content: 'It is 22°C in Tokyo.' });

		const messages = [system, user, toolCall, toolResult, assistant];
		const converted = messages.map((m) => ChatService.convertDbMessageToApiChatMessageData(m));

		expect(converted[0].role).toBe(MessageRole.SYSTEM);
		expect(converted[1].role).toBe(MessageRole.USER);
		expect(converted[2].role).toBe(MessageRole.ASSISTANT);
		expect(converted[2].tool_calls).toBeDefined();
		expect(converted[3].role).toBe(MessageRole.TOOL);
		expect(converted[3].tool_call_id).toBe('c1');
		expect(converted[4].role).toBe(MessageRole.ASSISTANT);
		expect(converted[4].content).toBe('It is 22°C in Tokyo.');
	});
});
