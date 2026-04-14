/**
 * Integration tests: Edit-mode flow
 *
 * Simulates what happens when a user edits a message in the conversation:
 *  1. A new branch is created as a sibling of the edited message
 *  2. The display list updates to reflect the new branch as active
 *  3. findDescendantMessages identifies the messages to cascade-delete
 *     from the abandoned branch
 *  4. filterByLeafNodeId for the new branch excludes the old branch's messages
 *
 * These are pure-utility integration tests — no mocking needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	filterByLeafNodeId,
	findLeafNode,
	findDescendantMessages,
	getMessageSiblings,
	getMessageDisplayList,
	hasMessageSiblings
} from '$lib/utils/branching';
import {
	makeBranchingConversation,
	makeLinearConversation,
	makeMultiBranchConversation,
	resetIdCounter
} from '../fixtures/messages';
import { MessageRole } from '$lib/enums';

beforeEach(() => {
	resetIdCounter();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Simulate adding a new branch child to an existing message tree */
function addBranch(
	messages: DatabaseMessage[],
	parentId: string,
	newMessage: DatabaseMessage
): DatabaseMessage[] {
	return messages
		.map((m) => (m.id === parentId ? { ...m, children: [...m.children, newMessage.id] } : m))
		.concat(newMessage);
}

function makeNewBranch(id: string, parentId: string, convId: string, ts: number): DatabaseMessage {
	return {
		id,
		convId,
		type: 'text',
		role: MessageRole.USER,
		content: 'Edited message content',
		parent: parentId,
		children: [],
		timestamp: ts,
		thinking: '',
		toolCalls: undefined,
		toolCallId: undefined,
		model: undefined,
		extra: undefined,
		timings: undefined
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit creates a new sibling branch
// ─────────────────────────────────────────────────────────────────────────────

describe('edit creates new sibling branch in linear conversation', () => {
	it('new branch appears as a second sibling for the edited message', () => {
		const messages = makeLinearConversation();

		// User edits user-2 → new branch user-2-edit, sibling of user-2
		const user2Edit = makeNewBranch('user-2-edit', 'assistant-1', 'conv-linear', Date.now() + 5000);
		const updated = addBranch(messages, 'assistant-1', user2Edit);

		const siblingInfo = getMessageSiblings(updated, 'user-2');
		expect(siblingInfo?.totalSiblings).toBe(2);
		expect(siblingInfo?.currentIndex).toBe(0);
	});

	it('new branch is the active leaf after edit', () => {
		const messages = makeLinearConversation();
		const user2Edit = makeNewBranch('user-2-edit', 'assistant-1', 'conv-linear', Date.now() + 5000);
		const updated = addBranch(messages, 'assistant-1', user2Edit);

		// The display list for the new branch leaf shows user-2-edit at currentIndex 1
		const list = getMessageDisplayList(updated, 'user-2-edit');
		const entry = list.find((i) => i.message.id === 'user-2-edit');
		expect(entry).toBeDefined();
		expect(entry?.totalSiblings).toBe(2);
		expect(entry?.currentIndex).toBe(1);
	});

	it('old branch is still accessible as sibling index 0', () => {
		const messages = makeLinearConversation();
		const user2Edit = makeNewBranch('user-2-edit', 'assistant-1', 'conv-linear', Date.now() + 5000);
		const updated = addBranch(messages, 'assistant-1', user2Edit);

		// Old branch (user-2 → assistant-2) should still be navigable
		const leafOld = findLeafNode(updated, 'user-2');
		const pathOld = filterByLeafNodeId(updated, leafOld);
		expect(pathOld.map((m) => m.id)).toContain('user-2');
		expect(pathOld.map((m) => m.id)).toContain('assistant-2');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Cascade delete: findDescendantMessages after edit
// ─────────────────────────────────────────────────────────────────────────────

describe('cascade delete: identifying messages to remove from old branch', () => {
	it('findDescendantMessages finds all messages in the abandoned branch', () => {
		const messages = makeBranchingConversation();
		// Branch A: user-2a → assistant-2a
		// User edits at the level of user-2a → branch A should be deleted

		const toDelete = findDescendantMessages(messages, 'user-2a');
		// assistant-2a is the only descendant
		expect(toDelete).toContain('assistant-2a');
		expect(toDelete).toHaveLength(1);
	});

	it('cascade delete does not include ancestor messages', () => {
		const messages = makeBranchingConversation();
		const toDelete = findDescendantMessages(messages, 'user-2a');

		expect(toDelete).not.toContain('user-1');
		expect(toDelete).not.toContain('assistant-1');
		expect(toDelete).not.toContain('root-1');
	});

	it('cascade delete does not include sibling branch messages', () => {
		const messages = makeBranchingConversation();
		const toDelete = findDescendantMessages(messages, 'user-2a');

		expect(toDelete).not.toContain('user-2b');
	});

	it('cascade delete from branch point finds all branched descendants', () => {
		const messages = makeMultiBranchConversation();

		// Delete branch-a and all its children
		const toDelete = findDescendantMessages(messages, 'branch-a');
		expect(toDelete).toContain('assistant-a');
		expect(toDelete).not.toContain('branch-b');
		expect(toDelete).not.toContain('assistant-b');
	});

	it('after removing deleted messages, old branch is no longer in display list', () => {
		const messages = makeBranchingConversation();
		const toDelete = new Set(findDescendantMessages(messages, 'user-2a'));
		toDelete.add('user-2a');

		// Remove the deleted messages from the conversation
		const remaining = messages.filter((m) => !toDelete.has(m.id));
		// Also remove user-2a from assistant-1's children
		const cleaned = remaining.map((m) =>
			m.id === 'assistant-1'
				? { ...m, children: m.children.filter((c: string) => !toDelete.has(c)) }
				: m
		);

		// Branch B (user-2b) should still be accessible
		const path = filterByLeafNodeId(cleaned, 'user-2b');
		expect(path.map((m) => m.id)).toContain('user-2b');

		// Old branch leaf (assistant-2a) should not appear in any path
		const anyPath = filterByLeafNodeId(cleaned, 'user-2b');
		expect(anyPath.map((m) => m.id)).not.toContain('assistant-2a');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Deep edit: new branch deeper in the tree
// ─────────────────────────────────────────────────────────────────────────────

describe('deep edit: branching at a deeper node', () => {
	it('adding a reply branch to assistant-2a creates 1 extra sibling for assistant-2a', () => {
		const messages = makeBranchingConversation();

		// Add user-3a as a child of assistant-2a
		const user3a = makeNewBranch('user-3a', 'assistant-2a', 'conv-branch', Date.now() + 6000);
		// Add user-3b as another child (the "edit" version)
		const user3b = makeNewBranch('user-3b', 'assistant-2a', 'conv-branch', Date.now() + 7000);

		let updated = addBranch(messages, 'assistant-2a', user3a);
		updated = addBranch(updated, 'assistant-2a', user3b);

		const siblingsOf3a = getMessageSiblings(updated, 'user-3a');
		expect(siblingsOf3a?.totalSiblings).toBe(2);
	});

	it('deep edit display list shows sibling count only at the branch point', () => {
		const messages = makeBranchingConversation();
		const user3a = makeNewBranch('user-3a', 'assistant-2a', 'conv-branch', Date.now() + 6000);
		const user3b = makeNewBranch('user-3b', 'assistant-2a', 'conv-branch', Date.now() + 7000);

		let updated = addBranch(messages, 'assistant-2a', user3a);
		updated = addBranch(updated, 'assistant-2a', user3b);

		const list = getMessageDisplayList(updated, 'user-3b');

		// user-2a should still show 2 siblings (itself and user-2b)
		const user2aEntry = list.find((i) => i.message.id === 'user-2a');
		expect(user2aEntry?.totalSiblings).toBe(2);

		// user-3b should show 2 siblings (user-3a and user-3b)
		const user3bEntry = list.find((i) => i.message.id === 'user-3b');
		expect(user3bEntry?.totalSiblings).toBe(2);
		expect(user3bEntry?.currentIndex).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Edit on a node that already has siblings
// ─────────────────────────────────────────────────────────────────────────────

describe('edit on an already-branched node creates a third sibling', () => {
	it('three-way branch at assistant-1 shows totalSiblings=3', () => {
		const messages = makeBranchingConversation();
		// Existing: user-2a, user-2b are children of assistant-1
		const user2c = makeNewBranch('user-2c', 'assistant-1', 'conv-branch', Date.now() + 10_000);
		const updated = addBranch(messages, 'assistant-1', user2c);

		const info = getMessageSiblings(updated, 'user-2c');
		expect(info?.totalSiblings).toBe(3);
		expect(info?.currentIndex).toBe(2);
	});

	it('getMessageDisplayList for user-2c has sibling count 3', () => {
		const messages = makeBranchingConversation();
		const user2c = makeNewBranch('user-2c', 'assistant-1', 'conv-branch', Date.now() + 10_000);
		const updated = addBranch(messages, 'assistant-1', user2c);

		const list = getMessageDisplayList(updated, 'user-2c');
		const entry = list.find((i) => i.message.id === 'user-2c');
		expect(entry?.totalSiblings).toBe(3);
	});

	it('hasMessageSiblings returns true for all three siblings', () => {
		const messages = makeBranchingConversation();
		const user2c = makeNewBranch('user-2c', 'assistant-1', 'conv-branch', Date.now() + 10_000);
		const updated = addBranch(messages, 'assistant-1', user2c);

		expect(hasMessageSiblings(updated, 'user-2a')).toBe(true);
		expect(hasMessageSiblings(updated, 'user-2b')).toBe(true);
		expect(hasMessageSiblings(updated, 'user-2c')).toBe(true);
	});
});
