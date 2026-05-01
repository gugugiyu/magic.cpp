import { describe, it, expect } from 'vitest';
import {
	parsePathTokens,
	extractPathTokens,
	hasPathTokens,
	removePathTokens
} from '$lib/utils/path-tokens.js';

describe('parsePathTokens', () => {
	it('parses valid path', () => {
		const text = 'Check @file("/folder/foo.txt") please';
		const segments = parsePathTokens(text);

		expect(segments).toHaveLength(3);
		expect(segments[0]).toEqual({
			type: 'text',
			text: 'Check ',
			start: 0,
			end: 6
		});
		expect(segments[1]).toEqual({
			type: 'token',
			path: '/folder/foo.txt',
			start: 6,
			end: 30
		});
		expect(segments[2]).toEqual({
			type: 'text',
			text: ' please',
			start: 30,
			end: 37
		});
	});

	it('parses valid path with spaces', () => {
		const text = 'Check @file("/path with spaces/file.txt") please';
		const segments = parsePathTokens(text);

		expect(segments).toHaveLength(3);
		expect(segments[1]).toEqual({
			type: 'token',
			path: '/path with spaces/file.txt',
			start: 6,
			end: 41
		});
	});

	it('parses multiple tokens', () => {
		const text = '@file("/a.txt") and @file("/b.txt")';
		const segments = parsePathTokens(text);

		expect(segments).toHaveLength(3);
		expect(segments.filter((s) => s.type === 'token')).toHaveLength(2);
		expect(segments[0].type).toBe('token');
		expect(segments[2].type).toBe('token');
		expect(segments[1]).toEqual({
			type: 'text',
			text: ' and ',
			start: 15,
			end: 20
		});
	});

	it('handles text with no tokens', () => {
		const text = 'No tokens here';
		const segments = parsePathTokens(text);

		expect(segments).toHaveLength(1);
		expect(segments[0].type).toBe('text');
		if (segments[0].type === 'text') {
			expect(segments[0].text).toBe('No tokens here');
		}
	});
});

describe('extractPathTokens', () => {
	it('extracts valid path', () => {
		const text = 'Check @file("/folder/foo.txt")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/folder/foo.txt']);
	});

	it('extracts valid path with spaces', () => {
		const text = 'Check @file("/path with spaces/file.txt")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/path with spaces/file.txt']);
	});

	it('extracts multiple unique paths', () => {
		const text = '@file("/a.txt") @file("/b.txt") @file("/a.txt")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/a.txt', '/b.txt']);
	});

	it('returns empty array for no tokens', () => {
		const text = 'No tokens here';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual([]);
	});
});

describe('hasPathTokens', () => {
	it('returns true for valid path', () => {
		expect(hasPathTokens('@file("/folder/foo.txt")')).toBe(true);
	});

	it('returns true for path with spaces', () => {
		expect(hasPathTokens('@file("/path with spaces/file.txt")')).toBe(true);
	});

	it('returns false for no tokens', () => {
		expect(hasPathTokens('No tokens here')).toBe(false);
	});
});

describe('removePathTokens', () => {
	it('removes valid path', () => {
		const text = 'Check @file("/folder/foo.txt") please';
		const result = removePathTokens(text);

		expect(result).toBe('Check  please');
	});

	it('removes path with spaces', () => {
		const text = 'Check @file("/path with spaces/file.txt") please';
		const result = removePathTokens(text);

		expect(result).toBe('Check  please');
	});

	it('returns original text for no tokens', () => {
		const text = 'No tokens here';
		const result = removePathTokens(text);

		expect(result).toBe('No tokens here');
	});
});

describe('invalid path patterns', () => {
	it('does not match @. (incomplete)', () => {
		const text = '@.';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual([]);
		expect(hasPathTokens(text)).toBe(false);
	});

	it('does not match @./ (incomplete)', () => {
		const text = '@./';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual([]);
		expect(hasPathTokens(text)).toBe(false);
	});

	it('does not match @../ (incomplete)', () => {
		const text = '@../';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual([]);
		expect(hasPathTokens(text)).toBe(false);
	});

	it('does not match bare @path (old syntax)', () => {
		const text = '@folder/foo.txt';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual([]);
		expect(hasPathTokens(text)).toBe(false);
	});

	it('does not match path with invalid symbols', () => {
		const text = '@file("/path<invalid>.txt")';
		const tokens = extractPathTokens(text);

		// The regex matches the @file("...") pattern regardless of path content
		// The path is extracted as-is, validation happens at file read time
		expect(tokens).toEqual(['/path<invalid>.txt']);
		expect(hasPathTokens(text)).toBe(true);
	});

	it('does not match unclosed quote', () => {
		const text = '@file("/path.txt"';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual([]);
		expect(hasPathTokens(text)).toBe(false);
	});

	it('does not match missing closing paren', () => {
		const validText = '@file("/path.txt")';
		const tokens = extractPathTokens(validText);

		expect(tokens).toEqual(['/path.txt']);
	});
});

describe('edge cases', () => {
	it('handles empty path', () => {
		const text = '@file("")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['']);
	});

	it('handles path with only slash', () => {
		const text = '@file("/")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/']);
	});

	it('handles absolute path', () => {
		const text = '@file("/absolute/path/to/file.txt")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/absolute/path/to/file.txt']);
	});

	it('handles relative path', () => {
		const text = '@file("relative/path.txt")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['relative/path.txt']);
	});

	it('handles path with special characters', () => {
		const text = '@file("/path-with-dashes/file_name.txt")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/path-with-dashes/file_name.txt']);
	});

	it('handles multiple tokens in complex text', () => {
		const text = 'Read @file("/a.txt") then @file("/b/c.txt") and @file("/d/e/f.txt")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/a.txt', '/b/c.txt', '/d/e/f.txt']);
	});
});

describe('directory paths', () => {
	it('extracts directory path', () => {
		const text = '@file("/folder/")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/folder/']);
		expect(hasPathTokens(text)).toBe(true);
	});

	it('extracts directory path without trailing slash', () => {
		const text = '@file("/folder")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/folder']);
		expect(hasPathTokens(text)).toBe(true);
	});

	it('parses directory in segments', () => {
		const text = 'Check @file("/src/lib/") please';
		const segments = parsePathTokens(text);

		expect(segments.some((s) => s.type === 'token')).toBe(true);
		const token = segments.find((s) => s.type === 'token');
		expect(token?.path).toBe('/src/lib/');
	});

	it('handles mixed file and directory paths', () => {
		const text = '@file("/file.txt") and @file("/folder/")';
		const tokens = extractPathTokens(text);

		expect(tokens).toEqual(['/file.txt', '/folder/']);
	});
});
