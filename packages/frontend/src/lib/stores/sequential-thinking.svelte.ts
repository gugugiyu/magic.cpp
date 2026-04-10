/**
 * sequentialThinkingStore - Ephemeral store for sequential thinking tool results.
 *
 * Records thoughts produced by the `sequential_thinking` built-in tool during
 * an agentic loop. Data is memory-only and intentionally not persisted to
 * IndexedDB — it is only needed for the current session's UI rendering.
 *
 * Each thought is keyed by (conversationId, messageId) so that the chat
 * renderer can look up the thought sequence for a specific assistant message.
 */

export interface ThoughtEntry {
	thoughtNumber: number;
	totalThoughts: number;
	thought: string;
	nextThoughtNeeded: boolean;
	done: boolean;
	/** Timestamp (ms) when this thought started. Store-only, not persisted. */
	startedAt?: number;
	/** Timestamp (ms) when this thought completed. Store-only, not persisted. */
	completedAt?: number;
}

export interface ThinkingTurn {
	messageId: string;
	conversationId: string;
	thoughts: ThoughtEntry[];
}

class SequentialThinkingStore {
	private _turns = $state<ThinkingTurn[]>([]);

	/**
	 * Record a thought for a given (conversationId, messageId) pair.
	 * Appends to an existing turn or creates a new one.
	 */
	recordThought(payload: {
		conversationId: string;
		messageId: string;
		thought: ThoughtEntry;
	}): void {
		const { conversationId, messageId, thought } = payload;
		const existing = this._turns.find(
			(t) => t.conversationId === conversationId && t.messageId === messageId
		);
		if (existing) {
			existing.thoughts.push(thought);
		} else {
			this._turns.push({ conversationId, messageId, thoughts: [thought] });
		}
	}

	/** Get the thinking turn for a specific (conversationId, messageId), or undefined. */
	getTurn(conversationId: string, messageId: string): ThinkingTurn | undefined {
		return this._turns.find(
			(t) => t.conversationId === conversationId && t.messageId === messageId
		);
	}

	/** Get all thoughts for a specific message, in order. Returns empty array if none. */
	getThoughtsForMessage(conversationId: string, messageId: string): ThoughtEntry[] {
		const turn = this._turns.find(
			(t) => t.conversationId === conversationId && t.messageId === messageId
		);
		return turn?.thoughts ?? [];
	}

	/** Get all thinking turns for a conversation, in order of insertion. */
	getTurnsForConversation(conversationId: string): ThinkingTurn[] {
		return this._turns.filter((t) => t.conversationId === conversationId);
	}

	/** Remove all thinking turns for a conversation (e.g. when conversation is deleted). */
	clearConversation(conversationId: string): void {
		this._turns = this._turns.filter((t) => t.conversationId !== conversationId);
	}

	/**
	 * Remove thinking turns for specific message IDs.
	 * Used during compaction: messages (and their toolCalls) are removed,
	 * so corresponding ephemeral thought data should also be cleared.
	 */
	clearMessages(conversationId: string, messageIds: Set<string>): void {
		this._turns = this._turns.filter(
			(t) => t.conversationId !== conversationId || !messageIds.has(t.messageId)
		);
	}

	/**
	 * Check if a sequential_thinking tool call is pending (invoked by model but no thought recorded yet).
	 * This detects the window between the model calling the tool and the thought being registered.
	 */
	hasPendingInvocation(conversationId: string, messageId: string): boolean {
		const existing = this.getTurn(conversationId, messageId);
		return !existing;
	}

	/**
	 * Get hybrid turns that merge store data with persisted message toolCalls.
	 * Prefers store data (real-time), falls back to persisted data from message toolCalls.
	 */
	getHybridTurns(
		conversationId: string,
		messageId: string,
		persistedToolCalls?: Array<{ function?: { name: string; arguments: string }; id?: string }>
	): ThinkingTurn[] {
		const storeTurn = this.getTurn(conversationId, messageId);

		// If we have store data, use it as primary source
		if (storeTurn) {
			return [storeTurn];
		}

		// Fallback: derive thoughts from persisted toolCalls
		if (!persistedToolCalls || persistedToolCalls.length === 0) {
			return [];
		}

		const seqThinkingCalls = persistedToolCalls.filter(
			(tc) => tc.function?.name === 'sequential_thinking'
		);

		if (seqThinkingCalls.length === 0) {
			return [];
		}

		const thoughts: ThoughtEntry[] = [];
		for (const call of seqThinkingCalls) {
			try {
				const args = JSON.parse(call.function?.arguments || '{}');
				thoughts.push({
					thoughtNumber: Number(args.thoughtNumber ?? thoughts.length + 1),
					totalThoughts: Number(args.totalThoughts ?? 1),
					thought: String(args.thought ?? ''),
					nextThoughtNeeded: Boolean(args.nextThoughtNeeded ?? false),
					done: true
				});
			} catch {
				// skip malformed entries
			}
		}

		if (thoughts.length === 0) return [];

		return [{ messageId, conversationId, thoughts }];
	}

	/**
	 * Update the text of a specific thought in-place.
	 * Used by ChatThinkingDrawer to apply per-step edits that propagate to the inline stepper.
	 */
	updateThought(
		conversationId: string,
		messageId: string,
		thoughtIndex: number,
		newText: string
	): void {
		const turn = this._turns.find(
			(t) => t.conversationId === conversationId && t.messageId === messageId
		);
		if (turn && thoughtIndex >= 0 && thoughtIndex < turn.thoughts.length) {
			// Replace the entry so Svelte's fine-grained reactivity picks up the change
			turn.thoughts[thoughtIndex] = { ...turn.thoughts[thoughtIndex], thought: newText };
		}
	}

	/**
	 * Calculate duration in ms for a thought. Returns undefined if timestamps not set.
	 */
	getThoughtDuration(thought: ThoughtEntry, nextThoughtStartedAt?: number): number | undefined {
		if (thought.completedAt) {
			return thought.completedAt - (thought.startedAt ?? 0);
		}
		// If this thought doesn't have completedAt but next thought has startedAt,
		// use that as an approximation
		if (nextThoughtStartedAt && thought.startedAt) {
			return nextThoughtStartedAt - thought.startedAt;
		}
		return undefined;
	}
}

export const sequentialThinkingStore = new SequentialThinkingStore();
