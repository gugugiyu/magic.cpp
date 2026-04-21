/**
 * mcpSummarizeHarness - MCP Response Length Harness (pure TS)
 *
 * Intercepts tool outputs, checks word count against configurable thresholds,
 * and provides a pause/resume mechanism for the user to choose between keeping
 * raw output or auto-summarizing via the subagent endpoint.
 *
 * Flow:
 * 1. Tool output exceeds soft threshold → harness pauses agentic loop
 * 2. Shows modal with "Keep Raw" / "Auto-Summarize" / "Cancel" buttons
 * 3. If "Auto-Summarize" → dialog calls subagent endpoint, then resolves with content
 * 4. If "Cancel" → throws McpSummarizeCancelledError (agentic loop stops cleanly)
 * 5. Resumes agentic loop with chosen output
 *
 * Hard cap: if output exceeds hard cap (and enabled), output is immediately
 * truncated with a "[trimmed output, X lines left]" suffix, no modal shown.
 */

import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
import { TOOL_OUTPUT_SUMMARIZER_PROMPT } from '@shared/constants/prompts-and-tools';
import { toast } from 'svelte-sonner';

export const MCP_SUMMARIZE_LINE_THRESHOLD = 400;

/**
 * Thrown when the user clicks "Cancel" in the summarize dialog.
 * Caught in the agentic loop to exit cleanly without an error state.
 */
export class McpSummarizeCancelledError extends Error {
	constructor() {
		super('Agentic loop cancelled by user from summarize dialog');
		this.name = 'McpSummarizeCancelledError';
	}
}

export interface SummarizeDecision {
	summarize: boolean;
	content: string;
	wasSummarized: boolean;
	wasCropped: boolean;
	linesLeft: number;
}

/**
 * Count words in a string (splits on whitespace)
 */
export function countWords(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	return trimmed.split(/\s+/).length;
}

/**
 * Count lines in a string (including empty lines)
 */
export function countLines(text: string): number {
	return text.split('\n').length;
}

/**
 * Check if tool output exceeds the line threshold
 */
export function exceedsThreshold(output: string, threshold: number): boolean {
	return countLines(output) > threshold;
}

/**
 * Check if hard cap is enabled (negative = disabled)
 */
export function isHardCapEnabled(hardCap: number): boolean {
	return hardCap >= 0;
}

/**
 * Crop output to the hard cap line limit using a head + tail approach.
 * Keeps the first (hardCap - tailLines) lines and the last tailLines lines,
 * with a "[... X lines trimmed ...]" marker in the middle.
 * Default tail is 100 lines.
 */
export function cropToHardCap(
	output: string,
	hardCap: number,
	tailLines: number = 100
): { content: string; linesLeft: number } {
	const lines = output.split('\n');
	const totalLines = lines.length;

	if (totalLines <= hardCap) {
		return { content: output, linesLeft: 0 };
	}

	const headLines = Math.max(0, hardCap - tailLines);
	const trimmedCount = totalLines - hardCap;

	const head = lines.slice(0, headLines);
	const tail = lines.slice(totalLines - tailLines);

	return {
		content: [...head, `\n[... ${trimmedCount} lines trimmed ...]\n`, ...tail].join('\n'),
		linesLeft: 0
	};
}

/**
 * Summarize tool output via the subagent endpoint.
 * Returns the summarized string, or null if summarization could not be performed
 * (subagent not configured, HTTP error, or malformed response).
 */
export async function summarizeToolOutput(
	output: string,
	signal?: AbortSignal
): Promise<string | null> {
	if (!subagentConfigStore.isConfigured) {
		toast.warning('Subagent endpoint not configured — keeping raw tool output.');
		return null;
	}

	const subagentModelId = subagentConfigStore.getModel();
	const endpoint = subagentConfigStore.getEndpoint();
	const apiKey = subagentConfigStore.getApiKey();
	const url = `${endpoint}/v1/chat/completions`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

	const messages = [
		{ role: 'system' as const, content: TOOL_OUTPUT_SUMMARIZER_PROMPT },
		{ role: 'user' as const, content: `Please summarize the following tool output:\n\n${output}` }
	];

	const requestBody: Record<string, unknown> = {
		model: subagentModelId,
		messages,
		stream: false
	};

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(requestBody),
			signal
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			console.error(
				`[McpSummarizeHarness] Summarization failed (${response.status}): ${errorText}`
			);
			return null;
		}

		const data = (await response.json()) as {
			choices?: {
				message?: {
					content?: string | { type: string; text?: string }[] | null;
				};
			}[];
		};

		const choice = data.choices?.[0];
		if (!choice?.message) {
			console.warn('[McpSummarizeHarness] Invalid summarization response format');
			return null;
		}

		const content = choice.message.content;
		if (typeof content === 'string') {
			return content;
		}
		if (Array.isArray(content)) {
			return content
				.map((c) =>
					typeof c === 'object' && c !== null && 'text' in c
						? ((c as { text?: string }).text ?? '')
						: ''
				)
				.join('');
		}

		return null;
	} catch (error) {
		console.error('[McpSummarizeHarness] Summarization request failed:', error);
		return null;
	}
}

/**
 * Pending pause request that the UI will consume.
 * resolve receives:
 *   false        → keep raw output
 *   'cancel'     → user cancelled (agentic loop will throw McpSummarizeCancelledError)
 *   string       → pre-summarized content produced by the dialog
 */
export interface PendingSummarizeRequest {
	id: string;
	toolName: string;
	rawOutput: string;
	lineCount: number;
	hardCap: number;
	resolve: (result: false | 'cancel' | string) => void;
}

// Plain Map-based registry for pending requests (one at a time in practice)
const pendingRequests = new Map<string, PendingSummarizeRequest>();

// Subscriber set for reactive UI notification
type PendingListener = (req: PendingSummarizeRequest | null) => void;
const _listeners = new Set<PendingListener>();

function _notify(): void {
	const req = getPendingRequest();
	for (const fn of _listeners) fn(req);
}

/**
 * Subscribe to pending request changes. Fires immediately with the current
 * first pending request, then again whenever a request is added or resolved.
 * Returns an unsubscribe function suitable for Svelte $effect cleanup.
 */
export function subscribePendingRequest(fn: PendingListener): () => void {
	try {
		fn(getPendingRequest());
	} catch (error) {
		console.warn('[McpSummarizeHarness] subscribePendingRequest initial callback error:', error);
	}
	_listeners.add(fn);
	return () => _listeners.delete(fn);
}

/**
 * Get the current pending summarize request (if any) — returns the earliest
 * pending request (FIFO). Use getAllPendingRequests() for the full queue.
 */
export function getPendingRequest(): PendingSummarizeRequest | null {
	for (const request of pendingRequests.values()) {
		return request;
	}
	return null;
}

/**
 * Get all pending requests in order (earliest first).
 */
export function getAllPendingRequests(): PendingSummarizeRequest[] {
	return Array.from(pendingRequests.values());
}

/**
 * Get the number of pending requests.
 */
export function getPendingCount(): number {
	return pendingRequests.size;
}

/**
 * Resolve a pending request by ID (called from UI).
 *
 * result:
 *   false        → keep raw output
 *   'cancel'     → cancel the agentic loop
 *   string       → use this as the final (summarized) content
 */
export function resolveRequest(id: string, result: false | 'cancel' | string): void {
	const request = pendingRequests.get(id);
	if (!request) return;
	try {
		request.resolve(result);
	} catch (error) {
		console.warn('[McpSummarizeHarness] resolveRequest: resolver threw:', error);
	}
	pendingRequests.delete(id);
	_notify();
}

/**
 * Main entry point: check if output needs pausing, and wait for user decision.
 * Returns the final content (raw, summarized, or auto-cropped).
 *
 * This is called from the agentic loop and will await until the user makes
 * a choice in the UI — unless the hard cap is exceeded, in which case it
 * crops immediately without waiting.
 *
 * If the abort signal fires while the modal is open, the promise resolves
 * immediately with raw output and the pending request is cleaned up.
 *
 * If the user clicks "Cancel", throws McpSummarizeCancelledError so the
 * agentic loop can exit cleanly.
 */
export async function processToolOutput(
	toolName: string,
	output: string,
	enabled: boolean,
	wordThreshold: number,
	hardCap: number,
	signal?: AbortSignal
): Promise<{ content: string; wasSummarized: boolean; wasCropped: boolean; linesLeft: number }> {
	// Hard cap check: auto-crop immediately (bypasses soft threshold / modal)
	if (isHardCapEnabled(hardCap) && exceedsThreshold(output, hardCap)) {
		const { content, linesLeft } = cropToHardCap(output, hardCap);
		return { content, wasSummarized: false, wasCropped: true, linesLeft };
	}

	// Soft threshold check: show modal only when enabled and threshold exceeded
	if (!enabled || !exceedsThreshold(output, wordThreshold)) {
		return { content: output, wasSummarized: false, wasCropped: false, linesLeft: 0 };
	}

	// Already aborted before we try to show the modal
	if (signal?.aborted) {
		return { content: output, wasSummarized: false, wasCropped: false, linesLeft: 0 };
	}

	const lineCount = countLines(output);
	const id = `summarize_${Date.now()}_${Math.random().toString(36).slice(2)}`;

	// result:
	//   false    → keep raw
	//   'cancel' → user cancelled the agentic loop
	//   string   → pre-summarized content from the dialog
	const result = await new Promise<false | 'cancel' | string>((resolve) => {
		let settled = false;
		const request: PendingSummarizeRequest = {
			id,
			toolName,
			rawOutput: output,
			lineCount,
			hardCap,
			resolve: (r) => {
				if (!settled) {
					settled = true;
					resolve(r);
				}
			}
		};
		pendingRequests.set(id, request);
		_notify();

		// If the agentic loop is aborted while the modal is open, clean up and resolve false
		if (signal) {
			signal.addEventListener(
				'abort',
				() => {
					if (!settled) {
						settled = true;
						pendingRequests.delete(id);
						_notify();
						try {
							resolve(false);
						} catch (error) {
							console.warn('[McpSummarizeHarness] abort handler: resolve threw:', error);
						}
					}
				},
				{ once: true }
			);
		}
	});

	if (result === 'cancel') {
		throw new McpSummarizeCancelledError();
	}

	if (typeof result === 'string') {
		return { content: result, wasSummarized: true, wasCropped: false, linesLeft: 0 };
	}

	return { content: output, wasSummarized: false, wasCropped: false, linesLeft: 0 };
}
