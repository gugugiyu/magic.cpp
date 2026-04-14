import { describe, it, expect } from 'vitest';
import {
	formatFileSize,
	formatParameters,
	formatNumber,
	formatJsonPretty,
	formatTime,
	formatPerformanceTime,
	formatAttachmentText,
	formatAgenticTurn
} from '$lib/utils/formatters';
import { MessageRole } from '$lib/enums';
import type { DatabaseMessage } from '@shared/types';

describe('formatFileSize', () => {
	it('returns "Unknown" for non-number input', () => {
		expect(formatFileSize(null as unknown as number)).toBe('Unknown');
		expect(formatFileSize(undefined as unknown as number)).toBe('Unknown');
		expect(formatFileSize('1024' as unknown as number)).toBe('Unknown');
	});

	it('returns "0 Bytes" for zero', () => {
		expect(formatFileSize(0)).toBe('0 Bytes');
	});

	it('formats bytes correctly', () => {
		expect(formatFileSize(500)).toBe('500 Bytes');
	});

	it('formats KB correctly', () => {
		expect(formatFileSize(1024)).toBe('1 KB');
		expect(formatFileSize(1536)).toBe('1.5 KB');
	});

	it('formats MB correctly', () => {
		expect(formatFileSize(1048576)).toBe('1 MB');
		expect(formatFileSize(2621440)).toBe('2.5 MB');
	});

	it('formats GB correctly', () => {
		expect(formatFileSize(1073741824)).toBe('1 GB');
		expect(formatFileSize(1610612736)).toBe('1.5 GB');
	});

	it('handles edge cases near boundaries', () => {
		expect(formatFileSize(1023)).toMatch(/Bytes/);
		expect(formatFileSize(1025)).toMatch(/KB/);
		expect(formatFileSize(1048575)).toMatch(/KB/);
		expect(formatFileSize(1048577)).toMatch(/MB/);
	});
});

describe('formatParameters', () => {
	it('returns "Unknown" for non-number input', () => {
		expect(formatParameters(null as unknown as number)).toBe('Unknown');
		expect(formatParameters(undefined as unknown as number)).toBe('Unknown');
	});

	it('returns raw number for small values', () => {
		expect(formatParameters(100)).toBe('100');
		expect(formatParameters(999)).toBe('999');
	});

	it('formats thousands as K', () => {
		expect(formatParameters(1000)).toBe('1.00K');
		expect(formatParameters(1500)).toBe('1.50K');
	});

	it('formats millions as M', () => {
		expect(formatParameters(1000000)).toBe('1.00M');
		expect(formatParameters(7500000)).toBe('7.50M');
	});

	it('formats billions as B', () => {
		expect(formatParameters(1000000000)).toBe('1.00B');
		expect(formatParameters(1750000000)).toBe('1.75B');
	});

	it('handles boundary values', () => {
		expect(formatParameters(999)).toBe('999');
		expect(formatParameters(1000)).toBe('1.00K');
		expect(formatParameters(999999)).toBe('1000.00K');
		expect(formatParameters(1000000)).toBe('1.00M');
	});
});

describe('formatNumber', () => {
	it('returns "Unknown" for non-number input', () => {
		expect(formatNumber(null as unknown as number)).toBe('Unknown');
		expect(formatNumber(undefined as unknown as number)).toBe('Unknown');
	});

	it('formats integers with thousands separators', () => {
		expect(formatNumber(1000)).toBe('1,000');
		expect(formatNumber(1000000)).toBe('1,000,000');
	});

	it('formats decimals correctly', () => {
		expect(formatNumber(1234.56)).toBe('1,234.56');
	});

	it('handles zero and negative numbers', () => {
		expect(formatNumber(0)).toBe('0');
		expect(formatNumber(-1000)).toBe('-1,000');
	});
});

describe('formatJsonPretty', () => {
	it('pretty-prints valid JSON', () => {
		const input = '{"name":"test","value":42}';
		const result = formatJsonPretty(input);
		expect(result).toBe('{\n  "name": "test",\n  "value": 42\n}');
	});

	it('handles nested JSON', () => {
		const input = '{"a":{"b":{"c":1}}}';
		const result = formatJsonPretty(input);
		expect(result).toBe('{\n  "a": {\n    "b": {\n      "c": 1\n    }\n  }\n}');
	});

	it('handles JSON arrays', () => {
		const input = '[1,2,3]';
		const result = formatJsonPretty(input);
		expect(result).toBe('[\n  1,\n  2,\n  3\n]');
	});

	it('returns original string for invalid JSON', () => {
		const invalid = '{invalid json}';
		expect(formatJsonPretty(invalid)).toBe(invalid);
	});

	it('returns original string for non-JSON strings', () => {
		expect(formatJsonPretty('hello world')).toBe('hello world');
	});

	it('handles already-formatted JSON (idempotent for valid JSON)', () => {
		const formatted = '{\n  "name": "test"\n}';
		const result = formatJsonPretty(formatted);
		expect(result).toBe('{\n  "name": "test"\n}');
	});

	it('handles empty object and array', () => {
		expect(formatJsonPretty('{}')).toBe('{}');
		expect(formatJsonPretty('[]')).toBe('[]');
	});

	it('handles null and primitive JSON values', () => {
		expect(formatJsonPretty('null')).toBe('null');
		expect(formatJsonPretty('"hello"')).toBe('"hello"');
		expect(formatJsonPretty('42')).toBe('42');
	});
});

describe('formatTime', () => {
	it('returns 24-hour format HH:MM:SS', () => {
		const date = new Date(2024, 0, 1, 14, 30, 45);
		const result = formatTime(date);
		expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});

	it('pads single-digit hours', () => {
		const date = new Date(2024, 0, 1, 1, 5, 9);
		const result = formatTime(date);
		expect(result).toMatch(/^0\d:/);
	});

	it('handles noon', () => {
		const date = new Date(2024, 0, 1, 12, 0, 0);
		const result = formatTime(date);
		expect(result).toMatch(/^12:00:/);
	});

	it('includes seconds', () => {
		const date = new Date(2024, 0, 1, 10, 30, 45);
		const result = formatTime(date);
		expect(result).toMatch(/:45$/);
	});
});

describe('formatPerformanceTime', () => {
	it('returns "0s" for negative values', () => {
		expect(formatPerformanceTime(-1)).toBe('0s');
		expect(formatPerformanceTime(-1000)).toBe('0s');
	});

	it('formats sub-second values with decimal', () => {
		expect(formatPerformanceTime(500)).toBe('0.5s');
		expect(formatPerformanceTime(100)).toBe('0.1s');
	});

	it('formats short durations (< 1s) with decimal', () => {
		expect(formatPerformanceTime(999)).toBe('1.0s');
	});

	it('formats medium durations (< 10s) with decimal', () => {
		expect(formatPerformanceTime(5000)).toBe('5.0s');
		expect(formatPerformanceTime(9999)).toBe('10.0s');
	});

	it('formats durations in seconds (10s - 60s)', () => {
		expect(formatPerformanceTime(10000)).toBe('10s');
		expect(formatPerformanceTime(30000)).toBe('30s');
		expect(formatPerformanceTime(59999)).toBe('59s');
	});

	it('formats durations in minutes', () => {
		expect(formatPerformanceTime(60000)).toBe('1min');
		expect(formatPerformanceTime(120000)).toBe('2min');
		expect(formatPerformanceTime(125000)).toBe('2min 5s');
	});

	it('formats durations in hours', () => {
		expect(formatPerformanceTime(3600000)).toBe('1h');
		expect(formatPerformanceTime(7200000)).toBe('2h');
		expect(formatPerformanceTime(7265000)).toBe('2h 1min 5s');
	});

	it('formats hours and minutes without seconds', () => {
		expect(formatPerformanceTime(3660000)).toBe('1h 1min');
		expect(formatPerformanceTime(7260000)).toBe('2h 1min');
	});

	it('formats complex durations', () => {
		expect(formatPerformanceTime(4500000)).toBe('1h 15min');
		expect(formatPerformanceTime(4530000)).toBe('1h 15min 30s');
		expect(formatPerformanceTime(4565432)).toBe('1h 16min 5s');
	});
});

describe('formatAttachmentText', () => {
	it('formats attachment without extra info', () => {
		const result = formatAttachmentText('File', 'document.txt', 'file content');
		expect(result).toBe('\n\n--- File: document.txt ---\nfile content');
	});

	it('formats attachment with extra info', () => {
		const result = formatAttachmentText('MCP Prompt', 'prompt1', 'prompt content', 'server1');
		expect(result).toBe('\n\n--- MCP Prompt: prompt1 (server1) ---\nprompt content');
	});

	it('handles empty content', () => {
		const result = formatAttachmentText('File', 'empty.txt', '');
		expect(result).toBe('\n\n--- File: empty.txt ---\n');
	});

	it('handles multiline content', () => {
		const content = 'line1\nline2\nline3';
		const result = formatAttachmentText('File', 'multiline.txt', content);
		expect(result).toBe('\n\n--- File: multiline.txt ---\nline1\nline2\nline3');
	});
});

describe('formatAgenticTurn', () => {
	const makeMessage = (overrides: Partial<DatabaseMessage>): DatabaseMessage => ({
		id: 'msg-1',
		convId: 'conv-1',
		type: 'message',
		timestamp: Date.now(),
		role: MessageRole.ASSISTANT,
		content: '',
		parent: null,
		children: [],
		...overrides
	});

	it('returns empty string for empty message', () => {
		const message = makeMessage({ content: '' });
		expect(formatAgenticTurn(message, [])).toBe('');
	});

	it('formats TEXT sections', () => {
		const message = makeMessage({ content: 'Hello, how can I help?' });
		const result = formatAgenticTurn(message, []);
		expect(result).toBe('Hello, how can I help?');
	});

	it('formats REASONING sections with thinking tags', () => {
		const message = makeMessage({
			content: 'Answer',
			reasoningContent: 'Let me think about this...'
		});
		const result = formatAgenticTurn(message, []);
		expect(result).toContain('<thinking>');
		expect(result).toContain('Let me think about this...');
		expect(result).toContain('</thinking>');
	});

	it('formats tool calls with name and args', () => {
		const toolCalls = JSON.stringify([
			{ id: 'tc-1', function: { name: 'search', arguments: '{"query":"test"}' } }
		]);
		const message = makeMessage({ content: 'Using tool', toolCalls });
		const toolResult = makeMessage({
			id: 'tool-res-1',
			role: MessageRole.TOOL,
			content: 'Search results here',
			toolCallId: 'tc-1'
		});
		const result = formatAgenticTurn(message, [toolResult]);
		expect(result).toContain('<tool_call name="search">');
		expect(result).toContain('{"query":"test"}');
		expect(result).toContain('<tool_result>');
		expect(result).toContain('Search results here');
		expect(result).toContain('</tool_result>');
	});

	it('formats sequential_thinking tool calls with step attributes', () => {
		const toolCalls = JSON.stringify([
			{
				id: 'tc-1',
				function: {
					name: 'sequential_thinking',
					arguments: JSON.stringify({
						thought: 'First thought',
						thoughtNumber: 1,
						totalThoughts: 3
					})
				}
			}
		]);
		const message = makeMessage({ content: 'Thinking...', toolCalls });
		const result = formatAgenticTurn(message, []);
		expect(result).toContain('<thinking step="1/3">');
		expect(result).toContain('First thought');
		expect(result).toContain('</thinking>');
	});

	it('handles tool calls without arguments', () => {
		const toolCalls = JSON.stringify([
			{ id: 'tc-1', function: { name: 'simple_tool', arguments: '{}' } }
		]);
		const message = makeMessage({ content: 'Using simple tool', toolCalls });
		const result = formatAgenticTurn(message, []);
		expect(result).toContain('<tool_call name="simple_tool">');
		expect(result).not.toContain('\n{');
	});

	it('handles malformed tool arguments gracefully', () => {
		const toolCalls = JSON.stringify([
			{ id: 'tc-1', function: { name: 'sequential_thinking', arguments: 'not valid json' } }
		]);
		const message = makeMessage({ content: 'Bad args', toolCalls });
		const result = formatAgenticTurn(message, []);
		// Should not crash, should still render content
		expect(typeof result).toBe('string');
	});

	it('combines text, reasoning, and tool calls', () => {
		const toolCalls = JSON.stringify([
			{ id: 'tc-1', function: { name: 'get_weather', arguments: '{"location":"NYC"}' } }
		]);
		const message = makeMessage({
			content: 'Let me check the weather.',
			reasoningContent: 'User asked about weather',
			toolCalls
		});
		const toolResult = makeMessage({
			id: 'tool-res-1',
			role: MessageRole.TOOL,
			content: 'Sunny, 72F',
			toolCallId: 'tc-1'
		});
		const result = formatAgenticTurn(message, [toolResult]);
		expect(result).toContain('Let me check the weather.');
		expect(result).toContain('<thinking>');
		expect(result).toContain('User asked about weather');
		expect(result).toContain('<tool_call name="get_weather">');
		expect(result).toContain('<tool_result>');
		expect(result).toContain('Sunny, 72F');
	});

	it('handles multiple tool calls in sequence', () => {
		const toolCalls = JSON.stringify([
			{ id: 'tc-1', function: { name: 'tool_a', arguments: '{}' } },
			{ id: 'tc-2', function: { name: 'tool_b', arguments: '{}' } }
		]);
		const message = makeMessage({ content: '', toolCalls });
		const toolResultA = makeMessage({
			id: 'tool-res-a',
			role: MessageRole.TOOL,
			content: 'Result A',
			toolCallId: 'tc-1'
		});
		const toolResultB = makeMessage({
			id: 'tool-res-b',
			role: MessageRole.TOOL,
			content: 'Result B',
			toolCallId: 'tc-2'
		});
		const result = formatAgenticTurn(message, [toolResultA, toolResultB]);
		expect(result).toContain('<tool_call name="tool_a">');
		expect(result).toContain('<tool_call name="tool_b">');
		expect(result).toContain('Result A');
		expect(result).toContain('Result B');
	});

	it('trims whitespace from content', () => {
		const message = makeMessage({ content: '  Hello  \n  World  ' });
		const result = formatAgenticTurn(message, []);
		expect(result).toBe('Hello  \n  World');
	});

	it('skips empty reasoning content', () => {
		const message = makeMessage({
			content: 'Answer',
			reasoningContent: '   '
		});
		const result = formatAgenticTurn(message, []);
		expect(result).toBe('Answer');
		expect(result).not.toContain('<thinking>');
	});
});
