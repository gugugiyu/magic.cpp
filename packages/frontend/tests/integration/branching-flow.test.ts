/**
 * Integration tests: Branching flow
 *
 * Multi-step navigation flows that compose several branching utilities,
 * simulating what the UI does when a user navigates branches or edits messages.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	filterByLeafNodeId,
	findLeafNode,
	findDescendantMessages,
	getMessageSiblings,
	getMessageDisplayList,
	getNextSibling,
	getPreviousSibling,
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
// getNextSibling → filterByLeafNodeId chain
// ─────────────────────────────────────────────────────────────────────────────

describe('navigate forward: getNextSibling → filterByLeafNodeId', () => {
	it('navigating to next sibling yields a path that excludes the previous branch leaf', () => {
		const messages = makeBranchingConversation();

		// Current view: branch A (leaf = assistant-2a)
		const pathA = filterByLeafNodeId(messages, 'assistant-2a');
		expect(pathA.map((m) => m.id)).toContain('assistant-2a');

		// Navigate forward from user-2a
		const nextLeaf = getNextSibling(messages, 'user-2a');
		expect(nextLeaf).not.toBeNull();

		const pathB = filterByLeafNodeId(messages, nextLeaf!);
		expect(pathB.map((m) => m.id)).not.toContain('assistant-2a');
		expect(pathB.map((m) => m.id)).toContain('user-2b');
	});

	it('shared ancestors appear in both branch paths', () => {
		const messages = makeBranchingConversation();

		const pathA = filterByLeafNodeId(messages, 'assistant-2a');
		const nextLeaf = getNextSibling(messages, 'user-2a')!;
		const pathB = filterByLeafNodeId(messages, nextLeaf);

		const idsA = pathA.map((m) => m.id);
		const idsB = pathB.map((m) => m.id);

		expect(idsA).toContain('user-1');
		expect(idsA).toContain('assistant-1');
		expect(idsB).toContain('user-1');
		expect(idsB).toContain('assistant-1');
	});

	it('navigating to the last sibling returns null for next', () => {
		const messages = makeBranchingConversation();
		const nextFromB = getNextSibling(messages, 'user-2b');
		expect(nextFromB).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// getPreviousSibling → filterByLeafNodeId chain
// ─────────────────────────────────────────────────────────────────────────────

describe('navigate backward: getPreviousSibling → filterByLeafNodeId', () => {
	it('navigating back restores the path of the earlier branch', () => {
		const messages = makeBranchingConversation();

		// Start at branch B
		const pathB = filterByLeafNodeId(messages, 'user-2b');
		expect(pathB.map((m) => m.id)).toContain('user-2b');

		// Navigate back
		const prevLeaf = getPreviousSibling(messages, 'user-2b');
		expect(prevLeaf).not.toBeNull();

		const pathA = filterByLeafNodeId(messages, prevLeaf!);
		expect(pathA.map((m) => m.id)).toContain('assistant-2a');
		expect(pathA.map((m) => m.id)).not.toContain('user-2b');
	});

	it('navigating to the first sibling returns null for previous', () => {
		const messages = makeBranchingConversation();
		const prevFromA = getPreviousSibling(messages, 'user-2a');
		expect(prevFromA).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Three-way branch navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('three-way branch forward/backward cycle', () => {
	it('can navigate forward through all three branches', () => {
		const messages = makeMultiBranchConversation();

		const nextA = getNextSibling(messages, 'branch-a');
		expect(nextA).toBe('assistant-b');

		const nextB = getNextSibling(messages, 'branch-b');
		expect(nextB).toBe('assistant-c');

		const nextC = getNextSibling(messages, 'branch-c');
		expect(nextC).toBeNull();
	});

	it('can navigate backward through all three branches', () => {
		const messages = makeMultiBranchConversation();

		const prevC = getPreviousSibling(messages, 'branch-c');
		expect(prevC).toBe('assistant-b');

		const prevB = getPreviousSibling(messages, 'branch-b');
		expect(prevB).toBe('assistant-a');

		const prevA = getPreviousSibling(messages, 'branch-a');
		expect(prevA).toBeNull();
	});

	it('each branch path contains only its own divergent messages', () => {
		const messages = makeMultiBranchConversation();

		const paths = ['branch-a', 'branch-b', 'branch-c'].map((id) => {
			const leaf = findLeafNode(messages, id);
			return filterByLeafNodeId(messages, leaf).map((m) => m.id);
		});

		// Shared ancestors present in all
		for (const path of paths) {
			expect(path).toContain('user-1');
			expect(path).toContain('assistant-1');
		}

		// Each path has its own branch message, not others
		expect(paths[0]).toContain('branch-a');
		expect(paths[0]).not.toContain('branch-b');
		expect(paths[0]).not.toContain('branch-c');

		expect(paths[1]).toContain('branch-b');
		expect(paths[1]).not.toContain('branch-a');
		expect(paths[1]).not.toContain('branch-c');

		expect(paths[2]).toContain('branch-c');
		expect(paths[2]).not.toContain('branch-a');
		expect(paths[2]).not.toContain('branch-b');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// getMessageDisplayList completeness
// ─────────────────────────────────────────────────────────────────────────────

describe('getMessageDisplayList sibling counts', () => {
	it('linear conversation: every message has totalSiblings=1', () => {
		const messages = makeLinearConversation();
		const list = getMessageDisplayList(messages, 'assistant-2');

		expect(list).toHaveLength(4);
		for (const item of list) {
			expect(item.totalSiblings).toBe(1);
		}
	});

	it('branching conversation: branch-point messages show 2 siblings', () => {
		const messages = makeBranchingConversation();
		const list = getMessageDisplayList(messages, 'assistant-2a');

		const user2aEntry = list.find((i) => i.message.id === 'user-2a');
		expect(user2aEntry?.totalSiblings).toBe(2);
		expect(user2aEntry?.currentIndex).toBe(0);
	});

	it('branching conversation branch B: currentIndex is 1', () => {
		const messages = makeBranchingConversation();
		const list = getMessageDisplayList(messages, 'user-2b');

		const user2bEntry = list.find((i) => i.message.id === 'user-2b');
		expect(user2bEntry?.totalSiblings).toBe(2);
		expect(user2bEntry?.currentIndex).toBe(1);
	});

	it('multi-branch: branch-c shows totalSiblings=3 and currentIndex=2', () => {
		const messages = makeMultiBranchConversation();
		const list = getMessageDisplayList(messages, findLeafNode(messages, 'branch-c'));

		const branchCEntry = list.find((i) => i.message.id === 'branch-c');
		expect(branchCEntry?.totalSiblings).toBe(3);
		expect(branchCEntry?.currentIndex).toBe(2);
	});

	it('root messages are excluded from display list', () => {
		const messages = makeBranchingConversation();
		const list = getMessageDisplayList(messages, 'assistant-2a');
		expect(list.some((i) => i.message.type === 'root')).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Edit-mode flow: new branch, then descendant cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe('edit-mode: branch creation and descendant identification', () => {
	it('newly added branch appears as a third sibling in the display list', () => {
		const messages = makeBranchingConversation();

		// Simulate user edit: add user-2c as a new child of assistant-1
		const user2c: DatabaseMessage = {
			id: 'user-2c',
			convId: 'conv-branch',
			type: 'text',
			role: MessageRole.USER,
			content: 'Third branch',
			parent: 'assistant-1',
			children: [],
			timestamp: Date.now() + 10_000,
			thinking: '',
			toolCalls: undefined,
			toolCallId: undefined,
			model: undefined,
			extra: undefined,
			timings: undefined
		};

		const updated = messages
			.map((m) => (m.id === 'assistant-1' ? { ...m, children: [...m.children, 'user-2c'] } : m))
			.concat(user2c);

		const list = getMessageDisplayList(updated, 'user-2c');
		const entry = list.find((i) => i.message.id === 'user-2c');
		expect(entry?.totalSiblings).toBe(3);
		expect(entry?.currentIndex).toBe(2);
	});

	it('findDescendantMessages identifies only messages in the target branch', () => {
		const messages = makeBranchingConversation();

		// Discard branch A → descendants of user-2a
		const descendants = findDescendantMessages(messages, 'user-2a');
		expect(descendants).toContain('assistant-2a');
		expect(descendants).not.toContain('user-2b');
		expect(descendants).not.toContain('user-1');
		expect(descendants).not.toContain('assistant-1');
	});

	it('findDescendantMessages on multi-branch isolates only one arm', () => {
		const messages = makeMultiBranchConversation();

		const descendants = findDescendantMessages(messages, 'branch-b');
		expect(descendants).toContain('assistant-b');
		expect(descendants).not.toContain('assistant-a');
		expect(descendants).not.toContain('assistant-c');
		expect(descendants).not.toContain('branch-a');
		expect(descendants).not.toContain('branch-c');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// findLeafNode → filterByLeafNodeId chain
// ─────────────────────────────────────────────────────────────────────────────

describe('findLeafNode chained with filterByLeafNodeId', () => {
	it('findLeafNode(root) → filterByLeafNodeId returns full path', () => {
		const messages = makeLinearConversation();

		const leaf = findLeafNode(messages, 'root-lin');
		expect(leaf).toBe('assistant-2');

		const path = filterByLeafNodeId(messages, leaf);
		expect(path).toHaveLength(4);
		expect(path[path.length - 1].id).toBe('assistant-2');
	});

	it('findLeafNode follows last child in multi-branch tree', () => {
		const messages = makeMultiBranchConversation();

		// assistant-1's last child is branch-c; branch-c's leaf is assistant-c
		const leaf = findLeafNode(messages, 'assistant-1');
		expect(leaf).toBe('assistant-c');

		const path = filterByLeafNodeId(messages, leaf);
		expect(path.map((m) => m.id)).toContain('branch-c');
		expect(path.map((m) => m.id)).toContain('assistant-c');
		expect(path.map((m) => m.id)).not.toContain('branch-a');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// siblingIds in getMessageSiblings point to leaf nodes
// ─────────────────────────────────────────────────────────────────────────────

describe('getMessageSiblings siblingIds are leaf node IDs', () => {
	it('siblingIds contain leaf IDs, not the sibling message IDs themselves', () => {
		const messages = makeBranchingConversation();

		// user-2a's sibling is user-2b; user-2a's own leaf is assistant-2a
		const info = getMessageSiblings(messages, 'user-2a');
		expect(info).not.toBeNull();
		expect(info!.siblingIds).toContain('assistant-2a');
		expect(info!.siblingIds).toContain('user-2b');
		expect(info!.siblingIds).not.toContain('user-2a');
	});

	it('navigating via siblingIds gives the correct display list position', () => {
		const messages = makeBranchingConversation();

		const info = getMessageSiblings(messages, 'user-2a');
		const targetLeaf = info!.siblingIds[1]; // user-2b
		expect(targetLeaf).toBe('user-2b');

		const list = getMessageDisplayList(messages, targetLeaf);
		const entry = list.find((i) => i.message.id === 'user-2b');
		expect(entry?.currentIndex).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// hasMessageSiblings integration
// ─────────────────────────────────────────────────────────────────────────────

describe('hasMessageSiblings across conversation types', () => {
	it('all messages in a linear conversation have no siblings', () => {
		const messages = makeLinearConversation();
		for (const m of messages) {
			if (m.type === 'root') continue;
			expect(hasMessageSiblings(messages, m.id)).toBe(false);
		}
	});

	it('only branch-point messages return true in a branching conversation', () => {
		const messages = makeBranchingConversation();

		expect(hasMessageSiblings(messages, 'user-2a')).toBe(true);
		expect(hasMessageSiblings(messages, 'user-2b')).toBe(true);
		expect(hasMessageSiblings(messages, 'user-1')).toBe(false);
		expect(hasMessageSiblings(messages, 'assistant-1')).toBe(false);
	});

	it('all three children of a 3-way branch return true', () => {
		const messages = makeMultiBranchConversation();
		expect(hasMessageSiblings(messages, 'branch-a')).toBe(true);
		expect(hasMessageSiblings(messages, 'branch-b')).toBe(true);
		expect(hasMessageSiblings(messages, 'branch-c')).toBe(true);
	});
});
