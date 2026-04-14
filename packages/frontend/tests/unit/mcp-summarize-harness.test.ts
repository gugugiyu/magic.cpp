import { describe, it, expect } from 'vitest';
import {
	countWords,
	countLines,
	exceedsThreshold,
	isHardCapEnabled,
	cropToHardCap,
	McpSummarizeCancelledError
} from '$lib/services/mcp-summarize-harness';

describe('mcp-summarize-harness', () => {
	describe('countWords', () => {
		it('returns 0 for empty string', () => {
			expect(countWords('')).toBe(0);
		});

		it('returns 0 for whitespace-only string', () => {
			expect(countWords('   \n\t  ')).toBe(0);
		});

		it('counts single word', () => {
			expect(countWords('hello')).toBe(1);
		});

		it('counts multiple words', () => {
			expect(countWords('hello world foo bar')).toBe(4);
		});

		it('handles leading and trailing whitespace', () => {
			expect(countWords('  hello world  ')).toBe(2);
		});

		it('handles multiple spaces between words', () => {
			expect(countWords('hello    world')).toBe(2);
		});

		it('handles newlines as whitespace', () => {
			expect(countWords('hello\nworld\nfoo')).toBe(3);
		});
	});

	describe('countLines', () => {
		it('returns 1 for empty string (single line)', () => {
			expect(countLines('')).toBe(1);
		});

		it('returns 1 for string without newlines', () => {
			expect(countLines('hello world')).toBe(1);
		});

		it('counts lines separated by newlines', () => {
			expect(countLines('line1\nline2\nline3')).toBe(3);
		});

		it('includes empty lines in count', () => {
			expect(countLines('line1\n\nline3')).toBe(3);
		});

		it('counts trailing newline', () => {
			expect(countLines('line1\nline2\n')).toBe(3);
		});

		it('handles multiline string', () => {
			const input = 'a\nb\nc\nd\ne';
			expect(countLines(input)).toBe(5);
		});
	});

	describe('exceedsThreshold', () => {
		it('returns false when output has fewer lines than threshold', () => {
			expect(exceedsThreshold('a\nb\nc', 5)).toBe(false);
		});

		it('returns true when output has more lines than threshold', () => {
			expect(exceedsThreshold('a\nb\nc\nd\ne', 3)).toBe(true);
		});

		it('returns false when lines equal threshold', () => {
			expect(exceedsThreshold('a\nb\nc', 3)).toBe(false);
		});

		it('handles single line with high threshold', () => {
			expect(exceedsThreshold('hello', 100)).toBe(false);
		});

		it('handles empty string', () => {
			expect(exceedsThreshold('', 0)).toBe(true);
		});
	});

	describe('isHardCapEnabled', () => {
		it('returns true for non-negative values', () => {
			expect(isHardCapEnabled(0)).toBe(true);
			expect(isHardCapEnabled(100)).toBe(true);
			expect(isHardCapEnabled(1000)).toBe(true);
		});

		it('returns false for negative values (disabled)', () => {
			expect(isHardCapEnabled(-1)).toBe(false);
			expect(isHardCapEnabled(-100)).toBe(false);
		});
	});

	describe('cropToHardCap', () => {
		it('returns original output when under hard cap', () => {
			const output = 'line1\nline2\nline3';
			const result = cropToHardCap(output, 10);

			expect(result.content).toBe(output);
			expect(result.linesLeft).toBe(0);
		});

		it('returns original when exactly at hard cap', () => {
			const output = 'line1\nline2\nline3';
			const result = cropToHardCap(output, 3);

			expect(result.content).toBe(output);
			expect(result.linesLeft).toBe(0);
		});

		it('crops output exceeding hard cap with default tail of 100', () => {
			const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`);
			const output = lines.join('\n');
			const result = cropToHardCap(output, 50);

			expect(result.linesLeft).toBe(0);
			expect(result.content).toContain('[... 150 lines trimmed ...]');
			expect(result.content).not.toContain('line 0');
			expect(result.content).toContain('line 199');
		});

		it('uses custom tail lines', () => {
			const lines = Array.from({ length: 150 }, (_, i) => `line ${i}`);
			const output = lines.join('\n');
			const result = cropToHardCap(output, 50, 10);

			expect(result.linesLeft).toBe(0);
			expect(result.content).toContain('[... 100 lines trimmed ...]');
			expect(result.content).toContain('line 149');
		});

		it('keeps head lines minus tail space', () => {
			const lines = Array.from({ length: 120 }, (_, i) => `line ${i}`);
			const output = lines.join('\n');
			const result = cropToHardCap(output, 50, 20);

			const resultLines = result.content.split('\n');
			const markerIdx = resultLines.findIndex((l) => l.includes('trimmed'));
			expect(markerIdx).toBeGreaterThan(0);
			const markerContent = resultLines.filter((l) => l.includes('trimmed'))[0];
			expect(markerContent).toContain('70 lines trimmed');
		});

		it('handles hard cap of 0 (no lines allowed)', () => {
			const output = 'line1\nline2';
			const result = cropToHardCap(output, 0);

			expect(result.linesLeft).toBe(0);
			expect(result.content).toContain('[... 2 lines trimmed ...]');
		});

		it('handles output much larger than hard cap', () => {
			const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`);
			const output = lines.join('\n');
			const result = cropToHardCap(output, 100);

			expect(result.linesLeft).toBe(0);
			expect(result.content).toContain('[... 900 lines trimmed ...]');
		});
	});

	describe('McpSummarizeCancelledError', () => {
		it('has correct name and message', () => {
			const error = new McpSummarizeCancelledError();

			expect(error.name).toBe('McpSummarizeCancelledError');
			expect(error.message).toBe('Agentic loop cancelled by user from summarize dialog');
		});

		it('is instance of Error', () => {
			const error = new McpSummarizeCancelledError();

			expect(error instanceof Error).toBe(true);
			expect(error instanceof McpSummarizeCancelledError).toBe(true);
		});
	});
});
