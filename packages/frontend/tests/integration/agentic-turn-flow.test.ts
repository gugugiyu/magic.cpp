/**
 * Integration tests: Agentic turn / streaming tool-call accumulation
 *
 * ChatService.mergeToolCallDeltas is a private static method; we access it
 * via the class bracket-notation cast so we can test the accumulation logic
 * in isolation, exactly as the streaming handler does across multiple SSE chunks.
 *
 * Tested scenarios:
 *  - Single tool call accumulated across multiple chunks (name then arguments)
 *  - Multiple tool calls in the same chunk
 *  - Multiple tool calls spread across sequential chunks
 *  - Index offset for sequential tool-call batches (agentic re-use)
 *  - Empty / degenerate delta inputs
 */

import { describe, it, expect, vi } from 'vitest';

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

// Access the private static method via bracket notation
type MergeToolCallDeltasFn = (
	existing: ApiChatCompletionToolCall[],
	deltas: ApiChatCompletionToolCallDelta[],
	indexOffset?: number
) => ApiChatCompletionToolCall[];

const mergeToolCallDeltas = (
	ChatService as unknown as { mergeToolCallDeltas: MergeToolCallDeltasFn }
)['mergeToolCallDeltas'].bind(ChatService);

// ─────────────────────────────────────────────────────────────────────────────
// Single tool call accumulated across chunks
// ─────────────────────────────────────────────────────────────────────────────

describe('single tool call accumulated across multiple SSE chunks', () => {
	it('first chunk sets id and name; second chunk concatenates arguments', () => {
		// Chunk 1: tool call header (id + function name)
		let accumulated: ApiChatCompletionToolCall[] = [];
		accumulated = mergeToolCallDeltas(accumulated, [
			{
				index: 0,
				id: 'call-abc',
				type: 'function',
				function: { name: 'get_weather', arguments: '' }
			}
		]);

		expect(accumulated).toHaveLength(1);
		expect(accumulated[0].id).toBe('call-abc');
		expect(accumulated[0].function?.name).toBe('get_weather');

		// Chunk 2: partial arguments
		accumulated = mergeToolCallDeltas(accumulated, [
			{ index: 0, function: { arguments: '{"city":' } }
		]);

		expect(accumulated[0].function?.arguments).toBe('{"city":');

		// Chunk 3: rest of arguments
		accumulated = mergeToolCallDeltas(accumulated, [
			{ index: 0, function: { arguments: '"Tokyo"}' } }
		]);

		expect(accumulated[0].function?.arguments).toBe('{"city":"Tokyo"}');
	});

	it('final accumulated tool call is valid JSON in arguments', () => {
		let acc: ApiChatCompletionToolCall[] = [];
		const argChunks = ['{"x":', '1,', '"y":', '2}'];

		acc = mergeToolCallDeltas(acc, [
			{ index: 0, id: 'call-1', type: 'function', function: { name: 'calculator', arguments: '' } }
		]);

		for (const chunk of argChunks) {
			acc = mergeToolCallDeltas(acc, [{ index: 0, function: { arguments: chunk } }]);
		}

		expect(acc).toHaveLength(1);
		const parsed = JSON.parse(acc[0].function!.arguments!);
		expect(parsed).toEqual({ x: 1, y: 2 });
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Multiple tool calls in same chunk
// ─────────────────────────────────────────────────────────────────────────────

describe('multiple tool calls in the same SSE chunk', () => {
	it('two tool calls in one delta are both accumulated', () => {
		const acc = mergeToolCallDeltas(
			[],
			[
				{
					index: 0,
					id: 'call-1',
					type: 'function',
					function: { name: 'tool_a', arguments: '{"x":1}' }
				},
				{
					index: 1,
					id: 'call-2',
					type: 'function',
					function: { name: 'tool_b', arguments: '{"y":2}' }
				}
			]
		);

		expect(acc).toHaveLength(2);
		expect(acc[0].function?.name).toBe('tool_a');
		expect(acc[1].function?.name).toBe('tool_b');
		expect(acc[0].id).toBe('call-1');
		expect(acc[1].id).toBe('call-2');
	});

	it('three tool calls in one delta all land in correct positions', () => {
		const acc = mergeToolCallDeltas(
			[],
			[
				{ index: 0, id: 'c0', type: 'function', function: { name: 'fn0', arguments: '{}' } },
				{ index: 1, id: 'c1', type: 'function', function: { name: 'fn1', arguments: '{}' } },
				{ index: 2, id: 'c2', type: 'function', function: { name: 'fn2', arguments: '{}' } }
			]
		);

		expect(acc).toHaveLength(3);
		expect(acc[0].function?.name).toBe('fn0');
		expect(acc[1].function?.name).toBe('fn1');
		expect(acc[2].function?.name).toBe('fn2');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Multiple tool calls spread across sequential chunks
// ─────────────────────────────────────────────────────────────────────────────

describe('multiple tool calls across sequential chunks', () => {
	it('two tools each get their arguments filled from separate chunks', () => {
		let acc: ApiChatCompletionToolCall[] = [];

		// Chunk 1: headers for both tools
		acc = mergeToolCallDeltas(acc, [
			{ index: 0, id: 'call-a', type: 'function', function: { name: 'search', arguments: '' } },
			{ index: 1, id: 'call-b', type: 'function', function: { name: 'fetch', arguments: '' } }
		]);

		// Chunk 2: arguments for tool 0
		acc = mergeToolCallDeltas(acc, [{ index: 0, function: { arguments: '{"q":"ai"}' } }]);

		// Chunk 3: arguments for tool 1
		acc = mergeToolCallDeltas(acc, [{ index: 1, function: { arguments: '{"url":"http://"}' } }]);

		expect(acc[0].function?.arguments).toBe('{"q":"ai"}');
		expect(acc[1].function?.arguments).toBe('{"url":"http://"}');
	});

	it('arguments for both tools concatenate correctly when interleaved', () => {
		let acc: ApiChatCompletionToolCall[] = [];

		acc = mergeToolCallDeltas(acc, [
			{ index: 0, id: 'c0', type: 'function', function: { name: 'fn0', arguments: '{"a' } },
			{ index: 1, id: 'c1', type: 'function', function: { name: 'fn1', arguments: '{"b' } }
		]);

		acc = mergeToolCallDeltas(acc, [
			{ index: 0, function: { arguments: '":1}' } },
			{ index: 1, function: { arguments: '":2}' } }
		]);

		expect(acc[0].function?.arguments).toBe('{"a":1}');
		expect(acc[1].function?.arguments).toBe('{"b":2}');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Index offset for sequential agentic tool-call batches
// ─────────────────────────────────────────────────────────────────────────────

describe('index offset for sequential agentic batches', () => {
	it('second batch with offset 1 appends after the first batch', () => {
		// First batch: one tool call at index 0
		let acc = mergeToolCallDeltas(
			[],
			[{ index: 0, id: 'first-call', type: 'function', function: { name: 'fn0', arguments: '{}' } }]
		);

		expect(acc).toHaveLength(1);

		// Second agentic turn: another tool call, index starts at 0 again
		// but we apply offset = 1 (length of previous batch)
		acc = mergeToolCallDeltas(
			acc,
			[
				{
					index: 0,
					id: 'second-call',
					type: 'function',
					function: { name: 'fn1', arguments: '{}' }
				}
			],
			1 // indexOffset
		);

		expect(acc).toHaveLength(2);
		expect(acc[0].id).toBe('first-call');
		expect(acc[1].id).toBe('second-call');
		expect(acc[0].function?.name).toBe('fn0');
		expect(acc[1].function?.name).toBe('fn1');
	});

	it('multiple sequential batches with increasing offsets accumulate all tools', () => {
		let acc: ApiChatCompletionToolCall[] = [];

		// Turn 1: two tools
		acc = mergeToolCallDeltas(acc, [
			{ index: 0, id: 'c0', type: 'function', function: { name: 'fn0', arguments: '{}' } },
			{ index: 1, id: 'c1', type: 'function', function: { name: 'fn1', arguments: '{}' } }
		]);

		// Turn 2: one more tool (index 0 in the new turn, offset = 2)
		acc = mergeToolCallDeltas(
			acc,
			[{ index: 0, id: 'c2', type: 'function', function: { name: 'fn2', arguments: '{}' } }],
			2
		);

		expect(acc).toHaveLength(3);
		expect(acc[2].id).toBe('c2');
		expect(acc[2].function?.name).toBe('fn2');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Degenerate / edge-case inputs
// ─────────────────────────────────────────────────────────────────────────────

describe('edge cases for mergeToolCallDeltas', () => {
	it('empty deltas array leaves existing accumulation unchanged', () => {
		const existing: ApiChatCompletionToolCall[] = [
			{ id: 'c0', type: 'function', function: { name: 'fn0', arguments: '{}' } }
		];

		const result = mergeToolCallDeltas(existing, []);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('c0');
	});

	it('merging into empty existing with empty deltas returns empty array', () => {
		const result = mergeToolCallDeltas([], []);
		expect(result).toHaveLength(0);
	});

	it('delta with only function arguments (no id or type) concatenates to existing', () => {
		let acc = mergeToolCallDeltas(
			[],
			[{ index: 0, id: 'c0', type: 'function', function: { name: 'fn', arguments: 'start' } }]
		);

		// Delta without id/type — just more arguments
		acc = mergeToolCallDeltas(acc, [{ index: 0, function: { arguments: '_end' } }]);

		expect(acc[0].function?.arguments).toBe('start_end');
		// id and type should still be there from first delta
		expect(acc[0].id).toBe('c0');
		expect(acc[0].type).toBe('function');
	});

	it('does not mutate the existing array', () => {
		const existing: ApiChatCompletionToolCall[] = [
			{ id: 'c0', type: 'function', function: { name: 'fn', arguments: '' } }
		];

		mergeToolCallDeltas(existing, [{ index: 0, function: { arguments: '{"x":1}' } }]);

		// Original should be unchanged
		expect(existing[0].function?.arguments).toBe('');
	});
});
