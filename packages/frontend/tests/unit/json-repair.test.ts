import { describe, it, expect } from 'vitest';
import { repairJsonObject, sanitizeToolName, repairToolCallsJson } from '$lib/utils/json-repair';

describe('repairJsonObject', () => {
	it('passes through valid JSON unchanged', () => {
		const input = '{"a":1,"b":"two"}';
		expect(repairJsonObject(input)).toBe(input);
	});

	it('strips markdown code fences', () => {
		const input = '```json\n{"a":1}\n```';
		expect(repairJsonObject(input)).toBe('{"a":1}');
	});

	it('strips plain markdown fences', () => {
		const input = '```\n{"a":1}\n```';
		expect(repairJsonObject(input)).toBe('{"a":1}');
	});

	it('removes trailing commas in objects', () => {
		expect(repairJsonObject('{"a":1,}')).toBe('{"a":1}');
	});

	it('removes trailing commas in arrays', () => {
		expect(repairJsonObject('{"a":[1,2,3,]}')).toBe('{"a":[1,2,3]}');
	});

	it('normalizes single quotes to double quotes', () => {
		expect(repairJsonObject("{'a':1}")).toBe('{"a":1}');
	});

	it('quotes unquoted object keys', () => {
		expect(repairJsonObject('{a:1}')).toBe('{"a":1}');
	});

	it('quotes nested unquoted keys', () => {
		expect(repairJsonObject('{outer:{inner:1}}')).toBe('{"outer":{"inner":1}}');
	});

	it('removes line comments', () => {
		expect(repairJsonObject('{"a":1 // comment\n}')).toBe('{"a":1 \n}');
	});

	it('removes block comments', () => {
		expect(repairJsonObject('{"a":1 /* comment */ }')).toBe('{"a":1  }');
	});

	it('removes hash comments', () => {
		expect(repairJsonObject('{"a":1 # comment\n}')).toBe('{"a":1 \n}');
	});

	it('balances unclosed braces', () => {
		expect(repairJsonObject('{"a":1')).toBe('{"a":1}');
	});

	it('balances unclosed strings', () => {
		expect(repairJsonObject('{"a":"1')).toBe('{"a":"1"}');
	});

	it('balances unclosed brackets', () => {
		expect(repairJsonObject('{"a":[1,2')).toBe('{"a":[1,2]}');
	});

	it('extracts first object from concatenated objects', () => {
		expect(repairJsonObject('{"a":1}{"b":2}')).toBe('{"a":1}');
	});

	it('escapes literal newlines inside strings', () => {
		const input = '{"a":"line1\nline2"}';
		expect(repairJsonObject(input)).toBe('{"a":"line1\\nline2"}');
	});

	it('returns {} for empty string', () => {
		expect(repairJsonObject('')).toBe('{}');
	});

	it('returns {} for whitespace-only string', () => {
		expect(repairJsonObject('   ')).toBe('{}');
	});

	it('returns {} for garbage input', () => {
		expect(repairJsonObject('hello world')).toBe('{}');
	});

	it('returns {} for array input (not an object)', () => {
		expect(repairJsonObject('[1,2,3]')).toBe('{}');
	});

	it('handles nested trailing commas', () => {
		expect(repairJsonObject('{"a":{"b":1,}}')).toBe('{"a":{"b":1}}');
	});

	it('handles mixed single quotes and unquoted keys', () => {
		expect(repairJsonObject('{\'key\': "val", unquoted: true}')).toBe(
			'{"key": "val", "unquoted": true}'
		);
	});

	it('does not quote bare-word values (conservative)', () => {
		expect(repairJsonObject('{"key": chat}')).toBe('{}');
	});

	it('handles numbers as keys', () => {
		expect(repairJsonObject('{123:"value"}')).toBe('{"123":"value"}');
	});

	it('handles backslash before trailing quote', () => {
		const input = '{"a":"foo\\\\"}';
		expect(repairJsonObject(input)).toBe(input);
	});

	it('removes dangling trailing backslash', () => {
		expect(repairJsonObject('{"a":"foo\\\\')).toBe('{"a":"foo\\\\"}');
	});
});

describe('sanitizeToolName', () => {
	it('trims whitespace', () => {
		expect(sanitizeToolName('  calculator  ')).toBe('calculator');
	});

	it('strips surrounding double quotes', () => {
		expect(sanitizeToolName('"calculator"')).toBe('calculator');
	});

	it('strips surrounding single quotes', () => {
		expect(sanitizeToolName("'calculator'")).toBe('calculator');
	});

	it('strips surrounding backticks', () => {
		expect(sanitizeToolName('`calculator`')).toBe('calculator');
	});

	it('collapses internal newlines to spaces', () => {
		expect(sanitizeToolName('calcu\nlator')).toBe('calcu lator');
	});

	it('returns empty string for empty input', () => {
		expect(sanitizeToolName('')).toBe('');
	});

	it('returns empty string for whitespace-only input', () => {
		expect(sanitizeToolName('   ')).toBe('');
	});

	it('does not strip unmatched quotes', () => {
		expect(sanitizeToolName('"calculator')).toBe('"calculator');
	});
});

describe('repairToolCallsJson', () => {
	it('passes through valid array', () => {
		const input = '[{"id":"1","type":"function","function":{"name":"a"}}]';
		const result = repairToolCallsJson(input);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('1');
	});

	it('wraps single object in array', () => {
		const input = '{"id":"1","type":"function","function":{"name":"a"}}';
		const result = repairToolCallsJson(input);
		expect(result).toHaveLength(1);
	});

	it('removes trailing comma in array', () => {
		const input = '[{"id":"1"},]';
		const result = repairToolCallsJson(input);
		expect(result).toHaveLength(1);
	});

	it('handles concatenated objects without brackets', () => {
		const input = '{"id":"1"},{"id":"2"}';
		const result = repairToolCallsJson(input);
		expect(result).toHaveLength(2);
	});

	it('extracts objects from mixed text', () => {
		const input = 'some text {"id":"1"} more';
		const result = repairToolCallsJson(input);
		expect(result).toHaveLength(1);
	});

	it('returns empty array for empty string', () => {
		expect(repairToolCallsJson('')).toEqual([]);
	});

	it('returns empty array for garbage input', () => {
		expect(repairToolCallsJson('hello')).toEqual([]);
	});

	it('handles single quotes in objects', () => {
		const input = "[{'id':'1','function':{'name':'a'}}]";
		const result = repairToolCallsJson(input);
		expect(result).toHaveLength(1);
		expect(result[0].function?.name).toBe('a');
	});

	it('handles comments inside array', () => {
		const input = '[{"id":"1"} // comment\n]';
		const result = repairToolCallsJson(input);
		expect(result).toHaveLength(1);
	});

	it('balances unclosed array', () => {
		const input = '[{"id":"1"}';
		const result = repairToolCallsJson(input);
		expect(result).toHaveLength(1);
	});
});
