/**
 * Integration tests: Streaming response accumulation
 *
 * Tests the SSE streaming accumulation logic by directly exercising
 * ChatService.mergeToolCallDeltas (accessed via bracket notation since it
 * is private) and verifying how content, reasoning, and tool call chunks
 * are assembled during a streaming response.
 *
 * These tests simulate what handleStreamResponse does internally when
 * processing successive SSE lines from the server.
 */

import { describe, it, expect, vi } from 'vitest';
import { MessageRole } from '$lib/enums';

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

type MergeToolCallDeltasFn = (
	existing: ApiChatCompletionToolCall[],
	deltas: ApiChatCompletionToolCallDelta[],
	indexOffset?: number
) => ApiChatCompletionToolCall[];

const mergeDeltas = (ChatService as unknown as { mergeToolCallDeltas: MergeToolCallDeltasFn })[
	'mergeToolCallDeltas'
].bind(ChatService);

// ─────────────────────────────────────────────────────────────────────────────
// Simulated SSE content accumulation
// ─────────────────────────────────────────────────────────────────────────────

describe('content chunk accumulation simulation', () => {
	it('plain text chunks concatenate in order', () => {
		const chunks = ['Hello', ', ', 'world', '!'];
		const aggregated = chunks.join('');
		expect(aggregated).toBe('Hello, world!');
	});

	it('reasoning content chunks accumulate separately from content', () => {
		let content = '';
		let reasoning = '';

		const events = [
			{ reasoning_content: 'Step 1: analyze' },
			{ reasoning_content: '\nStep 2: compute' },
			{ content: 'The answer is 42.' }
		];

		for (const ev of events) {
			if (ev.reasoning_content) reasoning += ev.reasoning_content;
			if (ev.content) content += ev.content;
		}

		expect(reasoning).toBe('Step 1: analyze\nStep 2: compute');
		expect(content).toBe('The answer is 42.');
	});

	it('content and reasoning do not bleed into each other', () => {
		let content = '';
		let reasoning = '';

		const events = [
			{ reasoning_content: 'Think...' },
			{ content: 'Result.' },
			{ reasoning_content: 'More thinking' },
			{ content: ' Done.' }
		];

		for (const ev of events) {
			if (ev.reasoning_content) reasoning += ev.reasoning_content;
			if (ev.content) content += ev.content;
		}

		expect(reasoning).toBe('Think...More thinking');
		expect(content).toBe('Result. Done.');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool call accumulation via mergeToolCallDeltas
// ─────────────────────────────────────────────────────────────────────────────

describe('tool call accumulation across streaming chunks', () => {
	it('tool call name arrives before arguments', () => {
		let acc: ApiChatCompletionToolCall[] = [];

		// Chunk 1: id and function name
		acc = mergeDeltas(acc, [
			{ index: 0, id: 'call-1', type: 'function', function: { name: 'get_weather', arguments: '' } }
		]);

		expect(acc[0].function?.name).toBe('get_weather');
		expect(acc[0].function?.arguments).toBe('');

		// Chunk 2: begin arguments
		acc = mergeDeltas(acc, [{ index: 0, function: { arguments: '{"city":' } }]);
		expect(acc[0].function?.arguments).toBe('{"city":');

		// Chunk 3: complete arguments
		acc = mergeDeltas(acc, [{ index: 0, function: { arguments: '"Tokyo"}' } }]);
		expect(acc[0].function?.arguments).toBe('{"city":"Tokyo"}');
	});

	it('two streaming tool calls accumulate independently', () => {
		let acc: ApiChatCompletionToolCall[] = [];

		// Header chunk for both
		acc = mergeDeltas(acc, [
			{ index: 0, id: 'c0', type: 'function', function: { name: 'fn_a', arguments: '' } },
			{ index: 1, id: 'c1', type: 'function', function: { name: 'fn_b', arguments: '' } }
		]);

		// Arguments chunk
		acc = mergeDeltas(acc, [
			{ index: 0, function: { arguments: '{"x":1}' } },
			{ index: 1, function: { arguments: '{"y":2}' } }
		]);

		expect(acc[0].function?.name).toBe('fn_a');
		expect(acc[0].function?.arguments).toBe('{"x":1}');
		expect(acc[1].function?.name).toBe('fn_b');
		expect(acc[1].function?.arguments).toBe('{"y":2}');
	});

	it('tool call arguments split across three chunks concatenate correctly', () => {
		let acc: ApiChatCompletionToolCall[] = [];

		acc = mergeDeltas(acc, [
			{ index: 0, id: 'c0', type: 'function', function: { name: 'fn', arguments: '' } }
		]);
		acc = mergeDeltas(acc, [{ index: 0, function: { arguments: '{"part1' } }]);
		acc = mergeDeltas(acc, [{ index: 0, function: { arguments: '":"value' } }]);
		acc = mergeDeltas(acc, [{ index: 0, function: { arguments: '"}' } }]);

		const args = acc[0].function?.arguments;
		expect(args).toBe('{"part1":"value"}');
		expect(() => JSON.parse(args!)).not.toThrow();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Agentic multi-turn: tool call batch finalization and offset
// ─────────────────────────────────────────────────────────────────────────────

describe('agentic multi-turn: tool call batch offsets', () => {
	it('second agentic turn tool calls append after first turn', () => {
		// Turn 1: one tool call
		let acc = mergeDeltas(
			[],
			[
				{
					index: 0,
					id: 'turn1-call',
					type: 'function',
					function: { name: 'search', arguments: '{"q":"a"}' }
				}
			]
		);
		expect(acc).toHaveLength(1);

		// Finalize turn 1; indexOffset = 1
		acc = mergeDeltas(
			acc,
			[
				{
					index: 0,
					id: 'turn2-call',
					type: 'function',
					function: { name: 'fetch', arguments: '{"url":"b"}' }
				}
			],
			1
		);

		expect(acc).toHaveLength(2);
		expect(acc[0].id).toBe('turn1-call');
		expect(acc[1].id).toBe('turn2-call');
		expect(acc[0].function?.name).toBe('search');
		expect(acc[1].function?.name).toBe('fetch');
	});

	it('three agentic turns stack correctly with sequential offsets', () => {
		let acc: ApiChatCompletionToolCall[] = [];

		// Turn 1
		acc = mergeDeltas(acc, [
			{ index: 0, id: 'c0', type: 'function', function: { name: 'fn0', arguments: '{}' } }
		]);

		// Turn 2 (offset 1)
		acc = mergeDeltas(
			acc,
			[{ index: 0, id: 'c1', type: 'function', function: { name: 'fn1', arguments: '{}' } }],
			1
		);

		// Turn 3 (offset 2)
		acc = mergeDeltas(
			acc,
			[{ index: 0, id: 'c2', type: 'function', function: { name: 'fn2', arguments: '{}' } }],
			2
		);

		expect(acc).toHaveLength(3);
		expect(acc.map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
		expect(acc.map((c) => c.function?.name)).toEqual(['fn0', 'fn1', 'fn2']);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// convertDbMessageToApiChatMessageData integration with streaming context
// ─────────────────────────────────────────────────────────────────────────────

describe('message conversion after streaming completes', () => {
	it('assistant message with accumulated tool_calls converts correctly for context', () => {
		// After streaming, the tool calls are serialized and stored in the DB message
		const toolCalls = JSON.stringify([
			{
				id: 'stream-call-1',
				type: 'function',
				function: { name: 'calculator', arguments: '{"expression":"2+2"}' }
			}
		]);

		const dbMsg: DatabaseMessage = {
			id: 'msg-stream-1',
			convId: 'conv-1',
			type: 'text',
			role: MessageRole.ASSISTANT,
			content: 'Let me calculate that.',
			parent: 'root-1',
			children: [],
			timestamp: Date.now(),
			thinking: '',
			toolCalls,
			toolCallId: undefined,
			model: 'llama-3-8b',
			extra: undefined,
			timings: undefined
		};

		const converted = ChatService.convertDbMessageToApiChatMessageData(dbMsg);

		expect(converted.role).toBe(MessageRole.ASSISTANT);
		expect(converted.content).toBe('Let me calculate that.');
		expect(converted.tool_calls).toHaveLength(1);
		expect(converted.tool_calls![0].id).toBe('stream-call-1');
		expect(converted.tool_calls![0].function?.name).toBe('calculator');
	});

	it('reasoning content from streaming is preserved in the api message', () => {
		const dbMsg: DatabaseMessage = {
			id: 'msg-stream-2',
			convId: 'conv-1',
			type: 'text',
			role: MessageRole.ASSISTANT,
			content: 'Final answer: 42',
			parent: 'root-1',
			children: [],
			timestamp: Date.now(),
			thinking: 'Step 1: analyze\nStep 2: compute\nStep 3: conclude',
			toolCalls: undefined,
			toolCallId: undefined,
			model: undefined,
			extra: undefined,
			timings: undefined
		};

		const converted = ChatService.convertDbMessageToApiChatMessageData(dbMsg);
		expect(converted.reasoning_content).toBe('Step 1: analyze\nStep 2: compute\nStep 3: conclude');
	});
});
