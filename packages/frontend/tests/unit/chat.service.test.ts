import { describe, it, expect, vi } from 'vitest';
import { MessageRole, ContentPartType, AttachmentType } from '$lib/enums';
import type { DatabaseMessage } from '$lib/types';

vi.mock('$lib/stores/models.svelte', () => ({
	modelsStore: {
		modelSupportsVision: () => true
	}
}));

vi.mock('$lib/stores/settings.svelte', () => ({
	settingsStore: {
		config: {
			filterLanguagePinner: false
		}
	}
}));

vi.mock('$lib/stores/server-endpoint.svelte', () => ({
	serverEndpointStore: {
		isDefault: () => true,
		getBaseUrl: () => ''
	}
}));

vi.mock('$lib/utils/api-headers', () => ({
	getJsonHeaders: () => ({ 'Content-Type': 'application/json' })
}));

vi.mock('$lib/utils/api-fetch', () => ({
	apiPost: vi.fn()
}));

vi.mock('$lib/utils/abort', () => ({
	isAbortError: vi.fn().mockReturnValue(false)
}));

vi.mock('$lib/utils/filters', () => ({
	detectLanguagePinner: vi.fn().mockReturnValue(null)
}));

const { ChatService } = await import('$lib/services/chat.service');

function makeDbMessage(overrides: Partial<DatabaseMessage> = {}): DatabaseMessage {
	return {
		id: 'msg-1',
		convId: 'conv-1',
		type: 'text',
		role: MessageRole.USER,
		content: 'Hello',
		parent: 'root-1',
		children: [],
		timestamp: Date.now(),
		toolCalls: undefined,
		toolCallId: undefined,
		model: undefined,
		timings: undefined,
		reasoningContent: undefined,
		...overrides
	} as DatabaseMessage;
}

describe('ChatService', () => {
	describe('convertDbMessageToApiChatMessageData', () => {
		it('converts simple text message', () => {
			const dbMsg = makeDbMessage({ content: 'Hello world', role: MessageRole.USER });
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			expect(result.role).toBe(MessageRole.USER);
			expect(result.content).toBe('Hello world');
		});

		it('converts assistant message with reasoning_content', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.ASSISTANT,
				content: 'The answer is 42',
				reasoningContent: 'Let me think...'
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			expect(result.role).toBe(MessageRole.ASSISTANT);
			expect(result.content).toBe('The answer is 42');
			expect(result.reasoning_content).toBe('Let me think...');
		});

		it('converts tool result message with tool_call_id', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.TOOL,
				content: '{"result": 42}',
				toolCallId: 'call-abc123'
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			expect(result.role).toBe(MessageRole.TOOL);
			expect(result.content).toBe('{"result": 42}');
			expect(result.tool_call_id).toBe('call-abc123');
		});

		it('parses and includes tool_calls from JSON string', () => {
			const toolCalls = [
				{
					id: 'call-1',
					type: 'function',
					function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' }
				}
			];
			const dbMsg = makeDbMessage({
				role: MessageRole.ASSISTANT,
				content: 'Let me check the weather',
				toolCalls: JSON.stringify(toolCalls)
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			expect(result.tool_calls).toHaveLength(1);
			expect(result.tool_calls![0].function!.name).toBe('get_weather');
		});

		it('handles message with image attachment', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.USER,
				content: 'Look at this',
				extra: [
					{
						type: AttachmentType.IMAGE,
						name: 'photo.png',
						base64Url: 'data:image/png;base64,abc123'
					} as NonNullable<DatabaseMessage['extra']>[0]
				]
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			const content = result.content as typeof result.content;
			expect(Array.isArray(content)).toBe(true);
			const contentArr = content as Array<{
				type: string;
				text?: string;
				image_url?: { url: string };
			}>;
			expect(
				contentArr.some((p) => p.type === ContentPartType.TEXT && p.text === 'Look at this')
			).toBe(true);
			expect(contentArr.some((p) => p.type === ContentPartType.IMAGE_URL)).toBe(true);
		});

		it('handles message with text file attachment', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.USER,
				content: 'Here is the file',
				extra: [
					{
						type: AttachmentType.TEXT,
						name: 'notes.txt',
						content: 'Important notes here'
					} as NonNullable<DatabaseMessage['extra']>[0]
				]
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			const content = result.content as typeof result.content;
			expect(Array.isArray(content)).toBe(true);
			const contentArr = content as Array<{ type: string; text?: string }>;
			expect(
				contentArr.some(
					(p) => p.type === ContentPartType.TEXT && p.text && p.text.includes('notes.txt')
				)
			).toBe(true);
		});

		it('handles message with PDF attachment', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.USER,
				content: 'See document',
				extra: [
					{
						type: AttachmentType.PDF,
						name: 'doc.pdf',
						content: 'PDF content here',
						processedAsImages: false
					} as NonNullable<DatabaseMessage['extra']>[0]
				]
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			const content = result.content as typeof result.content;
			expect(Array.isArray(content)).toBe(true);
			const contentArr = content as Array<{ type: string; text?: string }>;
			expect(contentArr.some((p) => p.text && p.text.includes('doc.pdf'))).toBe(true);
		});

		it('handles PDF processed as images', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.USER,
				content: 'PDF pages',
				extra: [
					{
						type: AttachmentType.PDF,
						name: 'doc.pdf',
						content: '',
						processedAsImages: true,
						images: ['data:image/png;base64,page1', 'data:image/png;base64,page2']
					} as NonNullable<DatabaseMessage['extra']>[0]
				]
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			const content = result.content as typeof result.content;
			expect(Array.isArray(content)).toBe(true);
			const contentArr = content as Array<{ type: string; image_url?: { url: string } }>;
			expect(
				contentArr.some(
					(p) =>
						p.type === ContentPartType.IMAGE_URL &&
						p.image_url?.url === 'data:image/png;base64,page1'
				)
			).toBe(true);
			expect(
				contentArr.some(
					(p) =>
						p.type === ContentPartType.IMAGE_URL &&
						p.image_url?.url === 'data:image/png;base64,page2'
				)
			).toBe(true);
		});

		it('handles message with audio attachment', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.USER,
				content: 'Listen to this',
				extra: [
					{
						type: AttachmentType.AUDIO,
						name: 'recording.wav',
						base64Data: 'audiobase64data',
						mimeType: 'audio/wav'
					} as NonNullable<DatabaseMessage['extra']>[0]
				]
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			const content = result.content as typeof result.content;
			expect(Array.isArray(content)).toBe(true);
			const contentArr = content as Array<{
				type: string;
				input_audio?: { data: string; format: string };
			}>;
			expect(
				contentArr.some(
					(p) => p.type === ContentPartType.INPUT_AUDIO && p.input_audio?.data === 'audiobase64data'
				)
			).toBe(true);
		});

		it('handles message with MCP prompt attachment', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.USER,
				content: 'Using MCP tool',
				extra: [
					{
						type: AttachmentType.MCP_PROMPT,
						name: 'mcp_tool',
						content: 'prompt content',
						serverName: 'my-server'
					} as NonNullable<DatabaseMessage['extra']>[0]
				]
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			const content = result.content as typeof result.content;
			expect(Array.isArray(content)).toBe(true);
			const contentArr = content as Array<{ type: string; text?: string }>;
			expect(contentArr.some((p) => p.text && p.text.includes('mcp_tool'))).toBe(true);
		});

		it('handles message with MCP resource attachment', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.USER,
				content: 'Reading resource',
				extra: [
					{
						type: AttachmentType.MCP_RESOURCE,
						name: 'resource.txt',
						content: 'resource content',
						serverName: 'my-server'
					} as NonNullable<DatabaseMessage['extra']>[0]
				]
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			const content = result.content as typeof result.content;
			expect(Array.isArray(content)).toBe(true);
			const contentArr = content as Array<{ type: string; text?: string }>;
			expect(contentArr.some((p) => p.text && p.text.includes('resource.txt'))).toBe(true);
		});

		it('handles message with multiple attachment types', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.USER,
				content: 'Mixed content',
				extra: [
					{
						type: AttachmentType.IMAGE,
						name: 'img.png',
						base64Url: 'data:image/png;base64,img'
					} as NonNullable<DatabaseMessage['extra']>[0],
					{
						type: AttachmentType.TEXT,
						name: 'notes.txt',
						content: 'Some notes'
					} as NonNullable<DatabaseMessage['extra']>[0],
					{
						type: AttachmentType.PDF,
						name: 'doc.pdf',
						content: 'PDF text',
						processedAsImages: false
					} as NonNullable<DatabaseMessage['extra']>[0]
				]
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			const content = result.content as typeof result.content;
			expect(Array.isArray(content)).toBe(true);
			const contentArr = content as Array<{ type: string }>;
			expect(contentArr.some((p) => p.type === ContentPartType.TEXT)).toBe(true);
			expect(contentArr.some((p) => p.type === ContentPartType.IMAGE_URL)).toBe(true);
		});

		it('handles empty extra array', () => {
			const dbMsg = makeDbMessage({ content: 'No extras', extra: [] });
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			expect(result.content).toBe('No extras');
		});

		it('handles legacy context attachment as TEXT', () => {
			const dbMsg = makeDbMessage({
				role: MessageRole.USER,
				content: 'Pasted content',
				extra: [
					{
						type: AttachmentType.LEGACY_CONTEXT,
						name: 'context.txt',
						content: 'Legacy pasted content'
					} as unknown as NonNullable<DatabaseMessage['extra']>[0]
				]
			});
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			const content = result.content as typeof result.content;
			expect(Array.isArray(content)).toBe(true);
			const contentArr = content as Array<{ type: string; text?: string }>;
			expect(contentArr.some((p) => p.text && p.text.includes('context.txt'))).toBe(true);
		});

		it('returns message without extra when extra is undefined', () => {
			const dbMsg = makeDbMessage({ content: 'Simple message' });
			const result = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

			expect(result.content).toBe('Simple message');
			expect(result.reasoning_content).toBeUndefined();
			expect(result.tool_calls).toBeUndefined();
		});
	});

	describe('extractModelName', () => {
		const chatService = ChatService as unknown as {
			extractModelName: any;
		};

		it('extracts model from root level', () => {
			const data = { model: 'llama-3.1-8b', choices: [] };
			const result = chatService.extractModelName(data);
			expect(result).toBe('llama-3.1-8b');
		});

		it('extracts model from delta', () => {
			const data = {
				choices: [{ delta: { model: 'gemma-2b' }, index: 0 }]
			};
			const result = chatService.extractModelName(data);
			expect(result).toBe('gemma-2b');
		});

		it('extracts model from message', () => {
			const data = {
				choices: [{ message: { model: 'mistral-7b', role: 'assistant' }, index: 0 }]
			};
			const result = chatService.extractModelName(data);
			expect(result).toBe('mistral-7b');
		});

		it('prioritizes delta over message model', () => {
			const data = {
				choices: [
					{ delta: { model: 'delta-model' }, message: { model: 'message-model' }, index: 0 }
				]
			};
			const result = chatService.extractModelName(data);
			expect(result).toBe('delta-model');
		});

		it('returns undefined for non-object data', () => {
			expect(chatService.extractModelName(null)).toBeUndefined();
			expect(chatService.extractModelName('string')).toBeUndefined();
			expect(chatService.extractModelName(123)).toBeUndefined();
		});

		it('returns undefined when no model present', () => {
			const data = { choices: [{ delta: {}, index: 0 }] };
			const result = chatService.extractModelName(data);
			expect(result).toBeUndefined();
		});

		it('trims whitespace from model name', () => {
			const data = { model: '  trimmed-model  ' };
			const result = chatService.extractModelName(data);
			expect(result).toBe('trimmed-model');
		});
	});

	describe('parseErrorResponse', () => {
		const chatService = ChatService as unknown as {
			parseErrorResponse: any;
		};

		it('parses JSON error response with message', async () => {
			const response = {
				status: 500,
				statusText: 'Internal Server Error',
				text: async () => '{"error":{"message":"Model not found"}}'
			} as Response;

			const error = await chatService.parseErrorResponse(response);

			expect(error.message).toBe('Model not found');
			expect(error.name).toBe('HttpError');
		});

		it('sets ServerError name for 400 status', async () => {
			const response = {
				status: 400,
				statusText: 'Bad Request',
				text: async () => '{"error":{"message":"Invalid request"}}'
			} as Response;

			const error = await chatService.parseErrorResponse(response);

			expect(error.name).toBe('ServerError');
		});

		it('extracts context info from error response', async () => {
			const response = {
				status: 400,
				statusText: 'Bad Request',
				text: async () =>
					'{"error":{"message":"Context overflow","n_prompt_tokens":1000,"n_ctx":2048}}'
			} as Response;

			const error = await chatService.parseErrorResponse(response);

			expect(error.contextInfo).toEqual({ n_prompt_tokens: 1000, n_ctx: 2048 });
		});

		it('returns fallback error for non-JSON response', async () => {
			const response = {
				status: 503,
				statusText: 'Service Unavailable',
				text: async () => 'Service temporarily unavailable'
			} as Response;

			const error = await chatService.parseErrorResponse(response);

			expect(error.message).toBe('Server error (503): Service Unavailable');
			expect(error.name).toBe('HttpError');
			expect(error.contextInfo).toBeUndefined();
		});

		it('handles empty error response body', async () => {
			const response = {
				status: 500,
				statusText: 'Internal Server Error',
				text: async () => ''
			} as Response;

			const error = await chatService.parseErrorResponse(response);

			expect(error.message).toBe('Server error (500): Internal Server Error');
			expect(error.name).toBe('HttpError');
		});
	});
});
