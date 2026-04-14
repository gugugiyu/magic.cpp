/**
 * Message factory fixtures for tests.
 * Creates DatabaseMessage objects with sensible defaults.
 */

import { MessageRole } from '$lib/enums';

export interface MakeMessageOptions {
	id?: string;
	convId?: string;
	type?: 'root' | 'text' | 'think' | 'system';
	role?: MessageRole;
	content?: string;
	parent?: string | null;
	children?: string[];
	timestamp?: number;
	reasoningContent?: string;
	toolCalls?: string;
	toolCallId?: string;
	model?: string;
	extra?: unknown[];
	timings?: unknown;
}

const BASE_TIMESTAMP = 1_700_000_000_000; // ~Nov 2023

let idCounter = 0;

function nextId(): string {
	return `msg-${++idCounter}`;
}

export function makeMessage(overrides: MakeMessageOptions = {}): DatabaseMessage {
	return {
		id: overrides.id ?? nextId(),
		convId: overrides.convId ?? 'conv-test',
		type: overrides.type ?? 'text',
		timestamp: overrides.timestamp ?? BASE_TIMESTAMP,
		role: overrides.role ?? MessageRole.USER,
		content: overrides.content ?? 'Test content',
		parent: overrides.parent ?? null,
		thinking: overrides.reasoningContent ?? '',
		children: overrides.children ?? [],
		toolCalls: overrides.toolCalls,
		toolCallId: overrides.toolCallId,
		model: overrides.model,
		extra: overrides.extra,
		timings: overrides.timings
	};
}

export function makeUserMessage(overrides: Partial<MakeMessageOptions> = {}): DatabaseMessage {
	return makeMessage({
		role: MessageRole.USER,
		content: 'What is the meaning of life?',
		...overrides
	});
}

export function makeAssistantMessage(overrides: Partial<MakeMessageOptions> = {}): DatabaseMessage {
	return makeMessage({
		role: MessageRole.ASSISTANT,
		content: 'The answer is 42.',
		...overrides
	});
}

export function makeSystemMessage(overrides: Partial<MakeMessageOptions> = {}): DatabaseMessage {
	return makeMessage({
		role: MessageRole.SYSTEM,
		content: 'You are a helpful assistant.',
		type: 'system',
		...overrides
	});
}

export function makeToolMessage(overrides: Partial<MakeMessageOptions> = {}): DatabaseMessage {
	return makeMessage({
		role: MessageRole.TOOL,
		content: '{"result": "tool output"}',
		toolCallId: overrides.toolCallId ?? 'tool-call-1',
		...overrides
	});
}

export function makeToolCallMessage(overrides: Partial<MakeMessageOptions> = {}): DatabaseMessage {
	const toolCalls =
		overrides.toolCalls ??
		JSON.stringify([
			{
				id: 'call-1',
				type: 'function',
				function: { name: 'calculator', arguments: '{"expression": "2+2"}' }
			}
		]);
	return makeMessage({
		role: MessageRole.ASSISTANT,
		content: 'Let me calculate that.',
		toolCalls,
		...overrides
	});
}

export function makeRootMessage(overrides: Partial<MakeMessageOptions> = {}): DatabaseMessage {
	return makeMessage({
		type: 'root',
		content: '',
		parent: null,
		children: [],
		...overrides
	});
}

/**
 * Create a branching conversation tree.
 *
 * Structure:
 *   root
 *    ├── user-1 → assistant-1 → user-2a → assistant-2a (branch A)
 *    └── user-1 → assistant-1 → user-2b (branch B)
 */
export function makeBranchingConversation(): DatabaseMessage[] {
	const root = makeRootMessage({ id: 'root-1', convId: 'conv-branch' });
	const user1 = makeUserMessage({
		id: 'user-1',
		convId: 'conv-branch',
		parent: 'root-1',
		timestamp: BASE_TIMESTAMP + 1000
	});
	const assistant1 = makeAssistantMessage({
		id: 'assistant-1',
		convId: 'conv-branch',
		parent: 'user-1',
		timestamp: BASE_TIMESTAMP + 2000
	});
	const user2a = makeUserMessage({
		id: 'user-2a',
		convId: 'conv-branch',
		parent: 'assistant-1',
		timestamp: BASE_TIMESTAMP + 3000
	});
	const assistant2a = makeAssistantMessage({
		id: 'assistant-2a',
		convId: 'conv-branch',
		parent: 'user-2a',
		timestamp: BASE_TIMESTAMP + 4000
	});
	const user2b = makeUserMessage({
		id: 'user-2b',
		convId: 'conv-branch',
		parent: 'assistant-1',
		timestamp: BASE_TIMESTAMP + 5000
	});

	// Set up children arrays
	root.children = ['user-1'];
	user1.children = ['assistant-1'];
	assistant1.children = ['user-2a', 'user-2b'];
	user2a.children = ['assistant-2a'];
	assistant2a.children = [];
	user2b.children = [];

	return [root, user1, assistant1, user2a, assistant2a, user2b];
}

/**
 * Create a simple linear conversation.
 * root → user-1 → assistant-1 → user-2 → assistant-2
 */
export function makeLinearConversation(): DatabaseMessage[] {
	const root = makeRootMessage({ id: 'root-lin', convId: 'conv-linear' });
	const user1 = makeUserMessage({
		id: 'user-1',
		convId: 'conv-linear',
		parent: 'root-lin',
		timestamp: BASE_TIMESTAMP + 1000
	});
	const assistant1 = makeAssistantMessage({
		id: 'assistant-1',
		convId: 'conv-linear',
		parent: 'user-1',
		timestamp: BASE_TIMESTAMP + 2000
	});
	const user2 = makeUserMessage({
		id: 'user-2',
		convId: 'conv-linear',
		parent: 'assistant-1',
		timestamp: BASE_TIMESTAMP + 3000
	});
	const assistant2 = makeAssistantMessage({
		id: 'assistant-2',
		convId: 'conv-linear',
		parent: 'user-2',
		timestamp: BASE_TIMESTAMP + 4000
	});

	root.children = ['user-1'];
	user1.children = ['assistant-1'];
	assistant1.children = ['user-2'];
	user2.children = ['assistant-2'];
	assistant2.children = [];

	return [root, user1, assistant1, user2, assistant2];
}

/**
 * Create a multi-branch conversation with 3+ branches at one point.
 */
export function makeMultiBranchConversation(): DatabaseMessage[] {
	const root = makeRootMessage({ id: 'root-multi', convId: 'conv-multi' });
	const user1 = makeUserMessage({
		id: 'user-1',
		convId: 'conv-multi',
		parent: 'root-multi',
		timestamp: BASE_TIMESTAMP + 1000
	});
	const assistant1 = makeAssistantMessage({
		id: 'assistant-1',
		convId: 'conv-multi',
		parent: 'user-1',
		timestamp: BASE_TIMESTAMP + 2000
	});
	const branchA = makeUserMessage({
		id: 'branch-a',
		convId: 'conv-multi',
		parent: 'assistant-1',
		timestamp: BASE_TIMESTAMP + 3000
	});
	const branchB = makeUserMessage({
		id: 'branch-b',
		convId: 'conv-multi',
		parent: 'assistant-1',
		timestamp: BASE_TIMESTAMP + 4000
	});
	const branchC = makeUserMessage({
		id: 'branch-c',
		convId: 'conv-multi',
		parent: 'assistant-1',
		timestamp: BASE_TIMESTAMP + 5000
	});
	const assistantA = makeAssistantMessage({
		id: 'assistant-a',
		convId: 'conv-multi',
		parent: 'branch-a',
		timestamp: BASE_TIMESTAMP + 6000
	});
	const assistantB = makeAssistantMessage({
		id: 'assistant-b',
		convId: 'conv-multi',
		parent: 'branch-b',
		timestamp: BASE_TIMESTAMP + 7000
	});
	const assistantC = makeAssistantMessage({
		id: 'assistant-c',
		convId: 'conv-multi',
		parent: 'branch-c',
		timestamp: BASE_TIMESTAMP + 8000
	});

	root.children = ['user-1'];
	user1.children = ['assistant-1'];
	assistant1.children = ['branch-a', 'branch-b', 'branch-c'];
	branchA.children = ['assistant-a'];
	branchB.children = ['assistant-b'];
	branchC.children = ['assistant-c'];
	assistantA.children = [];
	assistantB.children = [];
	assistantC.children = [];

	return [root, user1, assistant1, branchA, assistantA, branchB, assistantB, branchC, assistantC];
}

/**
 * Create a conversation with reasoning content.
 */
export function makeConversationWithReasoning(): DatabaseMessage[] {
	const root = makeRootMessage({ id: 'root-reason', convId: 'conv-reason' });
	const user1 = makeUserMessage({
		id: 'user-1',
		convId: 'conv-reason',
		parent: 'root-reason',
		timestamp: BASE_TIMESTAMP + 1000
	});
	const assistant1 = makeAssistantMessage({
		id: 'assistant-1',
		convId: 'conv-reason',
		parent: 'user-1',
		timestamp: BASE_TIMESTAMP + 2000,
		content: 'The answer is 42.',
		reasoningContent:
			'Let me think step by step...\n1. The user asked about meaning\n2. The answer is well known\n3. I will respond directly'
	});

	root.children = ['user-1'];
	user1.children = ['assistant-1'];
	assistant1.children = [];

	return [root, user1, assistant1];
}

/**
 * Reset the ID counter for deterministic tests.
 */
export function resetIdCounter(): void {
	idCounter = 0;
}
