import type { ApiChatCompletionToolCall } from '$lib/types/api';
import { createModuleLogger } from './logger';

const MAX_REPAIR_LENGTH = 50_000;
const logger = createModuleLogger('JSONRepair');
function devLog(...args: unknown[]): void {
	logger.debug('[json-repair]', ...args);
}

/* ─── Markdown fences ────────────────────────────────────────────────────── */

function stripMarkdownFences(input: string): string {
	let result = input.trim();
	// Remove leading fence
	if (result.startsWith('```')) {
		const firstNewline = result.indexOf('\n');
		if (firstNewline !== -1) {
			result = result.slice(firstNewline + 1);
		} else {
			// No newline, e.g. ```json {"a":1}
			result = result.replace(/^```(?:json)?\s*/, '');
		}
	}
	// Remove trailing fence
	if (result.endsWith('```')) {
		result = result.slice(0, -3).trimEnd();
	}
	return result;
}

/* ─── Comments ───────────────────────────────────────────────────────────── */

function removeComments(input: string): string {
	let result = '';
	let inString = false;
	let escape = false;
	let i = 0;

	while (i < input.length) {
		const char = input[i];
		if (escape) {
			result += char;
			escape = false;
			i++;
			continue;
		}
		if (char === '\\') {
			result += char;
			escape = true;
			i++;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			result += char;
			i++;
			continue;
		}
		if (inString) {
			result += char;
			i++;
			continue;
		}

		// Check for // comment
		if (char === '/' && i + 1 < input.length && input[i + 1] === '/') {
			while (i < input.length && input[i] !== '\n') i++;
			continue;
		}

		// Check for /* block comment */
		if (char === '/' && i + 1 < input.length && input[i + 1] === '*') {
			i += 2;
			while (i < input.length - 1 && !(input[i] === '*' && input[i + 1] === '/')) i++;
			i += 2;
			continue;
		}

		// Check for # comment
		if (char === '#') {
			while (i < input.length && input[i] !== '\n') i++;
			continue;
		}

		result += char;
		i++;
	}
	return result;
}

/* ─── Extract first JSON object ──────────────────────────────────────────── */

function extractFirstJsonObject(input: string): string {
	const start = input.indexOf('{');
	if (start === -1) return input;

	let depth = 0;
	let inString = false;
	let escape = false;
	let end = -1;

	for (let i = start; i < input.length; i++) {
		const char = input[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (char === '\\') {
			escape = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;

		if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}

	if (end === -1) return input.slice(start);
	return input.slice(start, end + 1);
}

/* ─── Quote normalization (single → double) ──────────────────────────────── */

function normalizeQuotes(input: string): string {
	let result = '';
	let inDoubleQuote = false;
	let escape = false;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (escape) {
			result += char;
			escape = false;
			continue;
		}
		if (char === '\\') {
			result += char;
			escape = true;
			continue;
		}
		if (char === '"') {
			inDoubleQuote = !inDoubleQuote;
			result += char;
			continue;
		}
		if (char === "'" && !inDoubleQuote) {
			result += '"';
			continue;
		}
		result += char;
	}
	return result;
}

/* ─── Quote unquoted keys ────────────────────────────────────────────────── */

function quoteUnquotedKeys(input: string): string {
	let result = '';
	let inString = false;
	let escape = false;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (escape) {
			result += char;
			escape = false;
			continue;
		}
		if (char === '\\') {
			result += char;
			escape = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			result += char;
			continue;
		}

		if (!inString && /[a-zA-Z0-9_$]/.test(char)) {
			let j = i;
			while (j < input.length && /[a-zA-Z0-9_$]/.test(input[j])) j++;
			if (j < input.length && input[j] === ':') {
				// Avoid treating URL schemes like http:// as keys
				if (j + 1 < input.length && input[j + 1] === '/') {
					// Not a key — probably a URL
				} else {
					result += '"' + input.slice(i, j) + '"';
					i = j - 1;
					continue;
				}
			}
		}

		result += char;
	}
	return result;
}

/* ─── Remove trailing commas ─────────────────────────────────────────────── */

function removeTrailingCommas(input: string): string {
	let result = '';
	let inString = false;
	let escape = false;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (escape) {
			result += char;
			escape = false;
			continue;
		}
		if (char === '\\') {
			result += char;
			escape = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			result += char;
			continue;
		}
		if (!inString && char === ',') {
			let j = i + 1;
			while (j < input.length && /\s/.test(input[j])) j++;
			if (j < input.length && (input[j] === '}' || input[j] === ']')) {
				continue; // skip trailing comma
			}
		}
		result += char;
	}
	return result;
}

/* ─── Sanitize escapes / control chars ───────────────────────────────────── */

function sanitizeEscapes(input: string): string {
	let result = '';
	let inString = false;
	let escape = false;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		const code = char.charCodeAt(0);

		if (escape) {
			// Keep known escapes; preserve unknown ones (parser will catch later)
			result += char;
			escape = false;
			continue;
		}
		if (char === '\\') {
			result += char;
			escape = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			result += char;
			continue;
		}

		if (inString && code < 32 && code !== 9) {
			// Replace literal control chars inside strings with escapes or space
			if (code === 10) result += '\\n';
			else if (code === 13) result += '\\r';
			else result += ' ';
			continue;
		}

		result += char;
	}

	// Remove dangling trailing backslash
	if (escape) {
		result = result.slice(0, -1);
	}

	return result;
}

/* ─── Balance braces / brackets / strings ────────────────────────────────── */

function balanceStructures(input: string): string {
	let braceDepth = 0;
	let bracketDepth = 0;
	let inString = false;
	let escape = false;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (char === '\\') {
			escape = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;

		if (char === '{') braceDepth++;
		else if (char === '}') braceDepth--;
		else if (char === '[') bracketDepth++;
		else if (char === ']') bracketDepth--;
	}

	let result = input;
	if (inString) result += '"';
	result += ']'.repeat(Math.max(0, bracketDepth));
	result += '}'.repeat(Math.max(0, braceDepth));
	return result;
}

/* ─── Extract individual objects from a string (fallback) ────────────────── */

function extractIndividualObjects(input: string): ApiChatCompletionToolCall[] {
	const result: ApiChatCompletionToolCall[] = [];
	let i = 0;

	while (i < input.length) {
		const braceIdx = input.indexOf('{', i);
		if (braceIdx === -1) break;

		let depth = 0;
		let inString = false;
		let escape = false;
		let end = -1;

		for (let j = braceIdx; j < input.length; j++) {
			const char = input[j];
			if (escape) {
				escape = false;
				continue;
			}
			if (char === '\\') {
				escape = true;
				continue;
			}
			if (char === '"') {
				inString = !inString;
				continue;
			}
			if (inString) continue;
			if (char === '{') depth++;
			else if (char === '}') {
				depth--;
				if (depth === 0) {
					end = j;
					break;
				}
			}
		}

		if (end !== -1) {
			const objStr = input.slice(braceIdx, end + 1);
			try {
				const obj = JSON.parse(objStr);
				if (typeof obj === 'object' && obj !== null) {
					result.push(obj as ApiChatCompletionToolCall);
				}
			} catch {
				// skip unparseable object
			}
			i = end + 1;
		} else {
			break;
		}
	}

	return result;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Heuristically repair a JSON object string that may be malformed due to
 * LLM output truncation or formatting quirks.
 *
 * Conservative: only fixes structural issues (fences, comments, quotes,
 * trailing commas, unclosed braces). Does NOT guess missing values.
 *
 * @returns Valid JSON string, or `'{}'` if unrecoverable.
 */
export function repairJsonObject(input: string): string {
	if (!input || input.trim() === '') return '{}';

	if (input.length > MAX_REPAIR_LENGTH) {
		devLog('Input too long (%d chars), skipping repair', input.length);
		try {
			JSON.parse(input);
			return input;
		} catch {
			return '{}';
		}
	}

	try {
		const parsed = JSON.parse(input);
		if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
			return input;
		}
	} catch {
		// needs repair
	}

	let repaired = input;

	repaired = stripMarkdownFences(repaired);
	repaired = extractFirstJsonObject(repaired);
	repaired = removeComments(repaired);
	repaired = normalizeQuotes(repaired);
	repaired = quoteUnquotedKeys(repaired);
	repaired = removeTrailingCommas(repaired);
	repaired = sanitizeEscapes(repaired);
	repaired = balanceStructures(repaired);

	try {
		const parsed = JSON.parse(repaired);
		if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
			devLog('Repaired JSON object successfully');
			return repaired;
		}
	} catch (e) {
		devLog('Failed to repair JSON object, falling back to {}:', e);
	}
	return '{}';
}

/**
 * Sanitize a tool call name extracted from LLM output.
 *
 * Strips surrounding quotes/backticks, trims whitespace, and collapses
 * internal newlines/spaces.
 */
export function sanitizeToolName(name: string): string {
	if (!name) return '';
	let cleaned = name.trim();

	const pairs: Array<[string, string]> = [
		['"', '"'],
		["'", "'"],
		['`', '`']
	];
	for (const [open, close] of pairs) {
		if (cleaned.startsWith(open) && cleaned.endsWith(close)) {
			cleaned = cleaned.slice(1, -1);
			break;
		}
	}

	cleaned = cleaned.replace(/\s+/g, ' ').trim();
	return cleaned;
}

/**
 * Heuristically repair a JSON array of tool calls.
 *
 * Handles missing brackets, trailing commas, comments, and concatenated
 * objects. Falls back to extracting individual objects if the array
 * remains unparseable.
 *
 * @returns Parsed array of tool call objects, or `[]` if unrecoverable.
 */
export function repairToolCallsJson(input: string): ApiChatCompletionToolCall[] {
	if (!input || input.trim() === '') return [];

	if (input.length > MAX_REPAIR_LENGTH) {
		try {
			const parsed = JSON.parse(input);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	let repaired = input.trim();
	repaired = stripMarkdownFences(repaired);

	if (!repaired.startsWith('[')) {
		repaired = '[' + repaired + ']';
	}

	repaired = removeComments(repaired);
	repaired = normalizeQuotes(repaired);
	repaired = quoteUnquotedKeys(repaired);
	repaired = removeTrailingCommas(repaired);
	repaired = sanitizeEscapes(repaired);
	repaired = balanceStructures(repaired);

	try {
		const parsed = JSON.parse(repaired);
		if (Array.isArray(parsed)) return parsed as ApiChatCompletionToolCall[];
		if (typeof parsed === 'object' && parsed !== null) return [parsed as ApiChatCompletionToolCall];
		return [];
	} catch {
		return extractIndividualObjects(repaired);
	}
}
