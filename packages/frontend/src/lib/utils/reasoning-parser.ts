/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from './logger';

export type NormalizedDelta = {
	role?: string;
	content?: string;
	reasoning?: string;
	raw?: any; // keep original for debugging
};

export type NormalizedMessage = {
	role?: string;
	content?: string;
	reasoning?: string;
	raw?: any;
};

export function parseReasoningMessage(data: any): NormalizedMessage {
	const message = data?.choices?.[0]?.message ?? {};

	const result: NormalizedMessage = {
		role: message.role,
		content: '',
		reasoning: '',
		raw: data
	};

	// Explicit reasoning fields
	const explicit =
		message?.reasoning_content ??
		message?.reasoning ??
		message?.analysis ??
		message?.thinking ??
		message?.thought ??
		message?.scratchpad;

	if (explicit) {
		result.reasoning += explicit;
	}

	// Handle content field (string | array | object)
	const { contentText, reasoningText } = extractFromContent(message.content);

	if (contentText) result.content += contentText;
	if (reasoningText) result.reasoning += reasoningText;

	// Inline tag fallback (<think>, etc.)
	if (!result.reasoning && typeof message.content === 'string') {
		const inline = extractInlineReasoning(message.content);

		if (inline.reasoning) result.reasoning += inline.reasoning;
		if (inline.cleanedContent) result.content = inline.cleanedContent;
	}

	// If still no content but reasoning exists → avoid empty UI
	if (!result.content && result.reasoning) {
		result.content = ''; // or keep empty intentionally
	}

	// Final fallback
	if (!result.content && typeof message.content === 'string') {
		result.content = message.content;
	}

	return result;
}

export function parseReasoningChunk(parsed: any): NormalizedDelta {
	const delta = parsed?.choices?.[0]?.delta ?? {};

	const result: NormalizedDelta = {
		role: delta.role,
		content: '',
		reasoning: '',
		raw: parsed
	};

	// Extract explicit reasoning fields
	const explicitReasoning = extractExplicitReasoning(delta);
	if (explicitReasoning) {
		result.reasoning += explicitReasoning;
	}

	// Handle structured / typed content (array or object)
	const { contentText, reasoningText } = extractFromContent(delta.content);

	if (contentText) result.content += contentText;
	if (reasoningText) result.reasoning += reasoningText;

	// Fallback: inline tag extraction from content string
	if (!result.reasoning && typeof delta.content === 'string') {
		const inline = extractInlineReasoning(delta.content);
		if (inline.reasoning) result.reasoning += inline.reasoning;
		if (inline.cleanedContent) result.content = inline.cleanedContent;
	}

	// Final fallback: if still nothing, treat content as content
	if (!result.content && typeof delta.content === 'string') {
		result.content = delta.content;
	}

	if (!explicitReasoning && typeof delta.content !== 'string') {
		logger.warn('Unknown delta format:', JSON.stringify(delta));
	}

	return result;
}

/* ---------------------------------- */
/* -------- Helper functions --------- */
/* ---------------------------------- */

function extractExplicitReasoning(delta: any): string {
	return (
		delta?.reasoning_content ??
		delta?.reasoning ??
		delta?.thinking ??
		delta?.analysis ??
		delta?.thought ??
		delta?.scratchpad ??
		''
	);
}

function extractFromContent(content: any): {
	contentText: string;
	reasoningText: string;
} {
	let contentText = '';
	let reasoningText = '';

	if (!content) return { contentText, reasoningText };

	// Case 1: string
	if (typeof content === 'string') {
		return { contentText: content, reasoningText };
	}

	// Case 2: array of typed blocks
	if (Array.isArray(content)) {
		for (const part of content) {
			if (!part) continue;

			const type = part.type ?? part.role ?? '';

			if (isReasoningType(type)) {
				reasoningText += part.text ?? part.content ?? '';
			} else {
				contentText += part.text ?? part.content ?? '';
			}
		}
		return { contentText, reasoningText };
	}

	// Case 3: object (rare but happens)
	if (typeof content === 'object') {
		const type = content.type ?? '';

		if (isReasoningType(type)) {
			reasoningText += content.text ?? content.content ?? '';
		} else {
			contentText += content.text ?? content.content ?? '';
		}
	}

	return { contentText, reasoningText };
}

function isReasoningType(type: string): boolean {
	const t = type.toLowerCase();

	return (
		t === 'reasoning' ||
		t === 'analysis' ||
		t === 'thinking' ||
		t === 'thought' ||
		t === 'scratchpad'
	);
}

/**
 * Extract <think>, <analysis>, etc. from raw text
 */
function extractInlineReasoning(text: string): {
	reasoning: string;
	cleanedContent: string;
} {
	let reasoning = '';
	let cleaned = text;

	const patterns = [
		/<think>([\s\S]*?)<\/think>/gi,
		/<analysis>([\s\S]*?)<\/analysis>/gi,
		/<reasoning>([\s\S]*?)<\/reasoning>/gi
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(text)) !== null) {
			reasoning += match[1] ?? '';
		}
		cleaned = cleaned.replace(pattern, '');
	}

	return {
		reasoning: reasoning.trim(),
		cleanedContent: cleaned.trim()
	};
}
