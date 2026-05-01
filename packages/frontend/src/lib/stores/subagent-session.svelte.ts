/**
 * subagentSessionStore - Reactive state store for subagent execution sessions.
 *
 * Each subagent invocation (call_subagent tool call) gets a session keyed by
 * its toolCallId, which is also used as subagent_session_id in the database.
 *
 * Tracks streaming progress, tool execution steps, token usage, and completion
 * state for UI visualization.
 */

export interface SubagentStep {
	toolName: string;
	status: 'calling' | 'done';
}

export interface SubagentSession {
	/** The toolCallId that spawned this subagent; also the DB subagent_session_id. */
	sessionId: string;
	conversationId: string;
	isRunning: boolean;
	isComplete: boolean;
	currentTurn: number;
	modelName: string;
	/** Accumulated assistant content for the current/final turn. */
	content: string;
	/** Accumulated reasoning content for the current/final turn. */
	reasoningContent: string;
	/** Ordered list of tool calls executed during this session. */
	steps: SubagentStep[];
	/** Running token totals (only available when the upstream reports usage). */
	totalTokens: number;
	promptTokens: number;
	completionTokens: number;
	toolCallsCount: number;
	/** The skill name that triggered this subagent, if applicable. */
	originSkill?: string;
	/** Terminal error message, if the session failed. */
	error: string | null;
}

class SubagentSessionStore {
	#sessions = $state<Map<string, SubagentSession>>(new Map());

	getSession(sessionId: string): SubagentSession | undefined {
		return this.#sessions.get(sessionId);
	}

	isRunning(sessionId: string): boolean {
		return this.#sessions.get(sessionId)?.isRunning ?? false;
	}

	isComplete(sessionId: string): boolean {
		return this.#sessions.get(sessionId)?.isComplete ?? false;
	}

	getSessionsForConversation(conversationId: string): SubagentSession[] {
		const result: SubagentSession[] = [];
		for (const session of this.#sessions.values()) {
			if (session.conversationId === conversationId) {
				result.push(session);
			}
		}
		return result;
	}

	startSession(params: {
		sessionId: string;
		conversationId: string;
		modelName: string;
		originSkill?: string;
	}): void {
		this.#sessions.set(params.sessionId, {
			sessionId: params.sessionId,
			conversationId: params.conversationId,
			isRunning: true,
			isComplete: false,
			currentTurn: 0,
			modelName: params.modelName,
			content: '',
			reasoningContent: '',
			steps: [],
			totalTokens: 0,
			promptTokens: 0,
			completionTokens: 0,
			toolCallsCount: 0,
			originSkill: params.originSkill,
			error: null
		});
	}

	appendContent(sessionId: string, chunk: string): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.content += chunk;
		this.#sessions.set(sessionId, { ...session });
	}

	appendReasoning(sessionId: string, chunk: string): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.reasoningContent += chunk;
		this.#sessions.set(sessionId, { ...session });
	}

	setModel(sessionId: string, modelName: string): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.modelName = modelName;
		this.#sessions.set(sessionId, { ...session });
	}

	setTurn(sessionId: string, turn: number): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.currentTurn = turn;
		this.#sessions.set(sessionId, { ...session });
	}

	addStep(sessionId: string, toolName: string, status: 'calling' | 'done' = 'calling'): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.steps.push({ toolName, status });
		this.#sessions.set(sessionId, { ...session });
	}

	updateStep(sessionId: string, toolName: string, status: 'calling' | 'done'): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		const step = session.steps.find((s) => s.toolName === toolName);
		if (step) {
			step.status = status;
			this.#sessions.set(sessionId, { ...session });
		}
	}

	incrementToolCallsCount(sessionId: string): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.toolCallsCount += 1;
		this.#sessions.set(sessionId, { ...session });
	}

	addUsage(sessionId: string, prompt: number, completion: number, total: number): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.promptTokens += prompt;
		session.completionTokens += completion;
		session.totalTokens += total;
		this.#sessions.set(sessionId, { ...session });
	}

	setError(sessionId: string, error: string): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.error = error;
		session.isRunning = false;
		this.#sessions.set(sessionId, { ...session });
	}

	completeSession(sessionId: string): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.isRunning = false;
		session.isComplete = true;
		this.#sessions.set(sessionId, { ...session });
	}

	clearSession(sessionId: string): void {
		this.#sessions.delete(sessionId);
	}

	clearAll(): void {
		this.#sessions.clear();
	}

	clearSessionsForConversation(conversationId: string): void {
		for (const [sessionId, session] of this.#sessions) {
			if (session.conversationId === conversationId) {
				this.#sessions.delete(sessionId);
			}
		}
	}
}

export const subagentSessionStore = new SubagentSessionStore();
