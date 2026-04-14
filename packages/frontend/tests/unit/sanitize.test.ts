import { describe, it, expect } from 'vitest';
import { sanitizeKeyValuePairKey, sanitizeKeyValuePairValue } from '$lib/utils/sanitize';
import { KEY_VALUE_PAIR_KEY_MAX_LENGTH, KEY_VALUE_PAIR_VALUE_MAX_LENGTH } from '$lib/constants';

describe('sanitizeKeyValuePairKey', () => {
	it('passes through safe alphanumeric strings', () => {
		expect(sanitizeKeyValuePairKey('hello')).toBe('hello');
		expect(sanitizeKeyValuePairKey('Hello123')).toBe('Hello123');
		expect(sanitizeKeyValuePairKey('API_KEY')).toBe('API_KEY');
		expect(sanitizeKeyValuePairKey('my-var.name')).toBe('my-var.name');
	});

	it('passes through spaces and common punctuation', () => {
		expect(sanitizeKeyValuePairKey('hello world')).toBe('hello world');
		expect(sanitizeKeyValuePairKey('key=value')).toBe('key=value');
	});

	it('strips null bytes', () => {
		expect(sanitizeKeyValuePairKey('hello\x00world')).toBe('helloworld');
	});

	it('strips tab characters', () => {
		expect(sanitizeKeyValuePairKey('hello\tworld')).toBe('helloworld');
	});

	it('strips newline characters', () => {
		expect(sanitizeKeyValuePairKey('hello\nworld')).toBe('helloworld');
		expect(sanitizeKeyValuePairKey('hello\r\nworld')).toBe('helloworld');
	});

	it('strips carriage return characters', () => {
		expect(sanitizeKeyValuePairKey('hello\rworld')).toBe('helloworld');
	});

	it('strips all C0 control characters (0x00-0x1F)', () => {
		const input = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('');
		const result = sanitizeKeyValuePairKey(input);
		expect(result).toBe('');
	});

	it('strips DEL character (0x7F)', () => {
		expect(sanitizeKeyValuePairKey('hello\x7Fworld')).toBe('helloworld');
	});

	it('preserves TAB in values but strips in keys', () => {
		// Keys should strip TAB
		expect(sanitizeKeyValuePairKey('key\tname')).toBe('keyname');
	});

	it('caps length to KEY_VALUE_PAIR_KEY_MAX_LENGTH', () => {
		const longKey = 'a'.repeat(KEY_VALUE_PAIR_KEY_MAX_LENGTH + 100);
		const result = sanitizeKeyValuePairKey(longKey);
		expect(result.length).toBe(KEY_VALUE_PAIR_KEY_MAX_LENGTH);
		expect(result).toBe('a'.repeat(KEY_VALUE_PAIR_KEY_MAX_LENGTH));
	});

	it('handles empty strings', () => {
		expect(sanitizeKeyValuePairKey('')).toBe('');
	});

	it('handles strings that become empty after sanitization', () => {
		expect(sanitizeKeyValuePairKey('\x00\x01\x02')).toBe('');
	});

	it('handles mixed safe and unsafe characters', () => {
		expect(sanitizeKeyValuePairKey('API\x00_KEY\x01')).toBe('API_KEY');
	});

	it('strips multiple consecutive unsafe characters', () => {
		expect(sanitizeKeyValuePairKey('hello\x00\x01\x02world')).toBe('helloworld');
	});

	it('strips unsafe characters at boundaries', () => {
		expect(sanitizeKeyValuePairKey('\x00hello\x7F')).toBe('hello');
	});
});

describe('sanitizeKeyValuePairValue', () => {
	it('passes through safe alphanumeric strings', () => {
		expect(sanitizeKeyValuePairValue('hello')).toBe('hello');
		expect(sanitizeKeyValuePairValue('Hello123')).toBe('Hello123');
		expect(sanitizeKeyValuePairValue('some_value')).toBe('some_value');
	});

	it('preserves TAB characters in values (unlike keys)', () => {
		expect(sanitizeKeyValuePairValue('hello\tworld')).toBe('hello\tworld');
	});

	it('strips null bytes', () => {
		expect(sanitizeKeyValuePairValue('hello\x00world')).toBe('helloworld');
	});

	it('strips newline characters', () => {
		expect(sanitizeKeyValuePairValue('hello\nworld')).toBe('helloworld');
		expect(sanitizeKeyValuePairValue('hello\r\nworld')).toBe('helloworld');
	});

	it('strips carriage return characters', () => {
		expect(sanitizeKeyValuePairValue('hello\rworld')).toBe('helloworld');
	});

	it('strips C0 control characters except TAB', () => {
		// Build input with all C0 controls, only TAB (0x09) should survive
		const input =
			'before\t' +
			Array.from({ length: 32 }, (_, i) => (i === 9 ? '' : String.fromCharCode(i))).join('') +
			'after';
		const result = sanitizeKeyValuePairValue(input);
		// TAB (0x09) should be preserved, all others stripped
		expect(result).toBe('before\tafter');
	});

	it('strips DEL character (0x7F)', () => {
		expect(sanitizeKeyValuePairValue('hello\x7Fworld')).toBe('helloworld');
	});

	it('caps length to KEY_VALUE_PAIR_VALUE_MAX_LENGTH', () => {
		const longValue = 'a'.repeat(KEY_VALUE_PAIR_VALUE_MAX_LENGTH + 100);
		const result = sanitizeKeyValuePairValue(longValue);
		expect(result.length).toBe(KEY_VALUE_PAIR_VALUE_MAX_LENGTH);
		expect(result).toBe('a'.repeat(KEY_VALUE_PAIR_VALUE_MAX_LENGTH));
	});

	it('handles empty strings', () => {
		expect(sanitizeKeyValuePairValue('')).toBe('');
	});

	it('handles multiline values with newlines', () => {
		const multiline = 'line1\nline2\nline3';
		expect(sanitizeKeyValuePairValue(multiline)).toBe('line1line2line3');
	});

	it('handles JSON-like values', () => {
		const json = '{"key": "value"}';
		expect(sanitizeKeyValuePairValue(json)).toBe(json);
	});

	it('handles base64-like values', () => {
		const base64 = 'SGVsbG8gV29ybGQ=';
		expect(sanitizeKeyValuePairValue(base64)).toBe(base64);
	});

	it('strips unsafe characters at boundaries', () => {
		expect(sanitizeKeyValuePairValue('\x00hello\x7F')).toBe('hello');
	});

	it('difference from key sanitization: TAB is preserved', () => {
		const input = 'value\twith\ttabs';
		const sanitizedValue = sanitizeKeyValuePairValue(input);
		const sanitizedKey = sanitizeKeyValuePairKey(input);

		expect(sanitizedValue).toBe('value\twith\ttabs');
		expect(sanitizedKey).toBe('valuewithtabs');
	});
});
