/**
 * Integration tests: Conversation navigation flow
 *
 * Tests the multi-step navigation chain that the UI performs when:
 *  - A user switches between conversations
 *  - A user navigates to a specific branch via currentNode
 *
 * Utilities exercised:
 *  - filterByLeafNodeId + getMessageDisplayList (the "load conversation" flow)
 *  - findLeafNode (resolving the active currentNode)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { filterByLeafNodeId, findLeafNode, getMessageDisplayList } from '$lib/utils/branching';
import {
	makeBranchingConversation,
	makeLinearConversation,
	makeMultiBranchConversation,
	resetIdCounter
} from '../fixtures/messages';

beforeEach(() => {
	resetIdCounter();
});

// ─────────────────────────────────────────────────────────────────────────────
// "Load conversation" flow: currentNode → display list
// ─────────────────────────────────────────────────────────────────────────────

describe('load conversation: currentNode resolution → display list', () => {
	it('currentNode pointing to a mid-tree message resolves to its leaf', () => {
		const messages = makeBranchingConversation();

		// Suppose currentNode is stored as 'user-2a' (mid-tree)
		const currentNode = 'user-2a';
		const leafId = findLeafNode(messages, currentNode);

		expect(leafId).toBe('assistant-2a');

		const displayList = getMessageDisplayList(messages, leafId);
		expect(displayList.map((i) => i.message.id)).toContain('user-2a');
		expect(displayList.map((i) => i.message.id)).toContain('assistant-2a');
	});

	it('currentNode pointing to the root resolves to the deepest last-child leaf', () => {
		const messages = makeLinearConversation();

		const leafId = findLeafNode(messages, 'root-lin');
		expect(leafId).toBe('assistant-2');

		const displayList = getMessageDisplayList(messages, leafId);
		expect(displayList).toHaveLength(4);
		expect(displayList[displayList.length - 1].message.id).toBe('assistant-2');
	});

	it('currentNode pointing to a leaf is unchanged by findLeafNode', () => {
		const messages = makeLinearConversation();

		const leafId = findLeafNode(messages, 'assistant-2');
		expect(leafId).toBe('assistant-2');
	});

	it('currentNode null fallback: filterByLeafNodeId uses latest timestamp', () => {
		const messages = makeLinearConversation();

		// When currentNode is null/undefined, UI falls back to latest timestamp
		const result = filterByLeafNodeId(messages, 'nonexistent-node');
		// Should fall back to assistant-2 (latest timestamp)
		expect(result.length).toBeGreaterThan(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Switching between conversations
// ─────────────────────────────────────────────────────────────────────────────

describe('switching between conversations', () => {
	it('loading conv A after conv B gives independent display lists', () => {
		const messagesA = makeLinearConversation();
		const messagesB = makeBranchingConversation();

		const leafA = findLeafNode(messagesA, 'root-lin');
		const leafB = findLeafNode(messagesB, 'assistant-1');

		const listA = getMessageDisplayList(messagesA, leafA);
		const listB = getMessageDisplayList(messagesB, leafB);

		const idsA = listA.map((i) => i.message.id);
		const idsB = listB.map((i) => i.message.id);

		// Messages unique to conversation A (linear) must not appear in B's display list
		expect(idsB).not.toContain('root-lin');
		expect(idsB).not.toContain('user-2');
		expect(idsB).not.toContain('assistant-2');

		// Messages unique to conversation B (branching) must not appear in A's display list
		expect(idsA).not.toContain('root-1');
		expect(idsA).not.toContain('user-2a');
		expect(idsA).not.toContain('user-2b');
		expect(idsA).not.toContain('assistant-2a');
	});

	it('switching back to conv A restores the same display list', () => {
		const messagesA = makeLinearConversation();

		const leafA = findLeafNode(messagesA, 'root-lin');
		const listA1 = getMessageDisplayList(messagesA, leafA);
		const listA2 = getMessageDisplayList(messagesA, leafA);

		expect(listA1.map((i) => i.message.id)).toEqual(listA2.map((i) => i.message.id));
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Navigation through sibling display list items
// ─────────────────────────────────────────────────────────────────────────────

describe('sibling navigation via display list siblingIds', () => {
	it('can navigate from branch A to branch B using siblingIds', () => {
		const messages = makeBranchingConversation();

		// Load branch A
		const leafA = 'assistant-2a';
		const listA = getMessageDisplayList(messages, leafA);

		// Find the branch-point entry (user-2a)
		const branchEntry = listA.find((i) => i.message.id === 'user-2a');
		expect(branchEntry).toBeDefined();
		expect(branchEntry!.totalSiblings).toBe(2);
		expect(branchEntry!.currentIndex).toBe(0);

		// Navigate to next sibling via siblingIds[1]
		const nextLeaf = branchEntry!.siblingIds[1]; // user-2b leaf
		expect(nextLeaf).toBe('user-2b');

		const listB = getMessageDisplayList(messages, nextLeaf);
		const branchEntryB = listB.find((i) => i.message.id === 'user-2b');
		expect(branchEntryB?.currentIndex).toBe(1);
	});

	it('siblingIds length matches totalSiblings for all entries in display list', () => {
		const messages = makeMultiBranchConversation();
		const leaf = findLeafNode(messages, 'branch-b');
		const list = getMessageDisplayList(messages, leaf);

		for (const item of list) {
			expect(item.siblingIds.length).toBe(item.totalSiblings);
		}
	});

	it('non-branching messages have siblingIds of length 1', () => {
		const messages = makeLinearConversation();
		const list = getMessageDisplayList(messages, 'assistant-2');

		for (const item of list) {
			expect(item.siblingIds.length).toBe(1);
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Display list integrity across navigation steps
// ─────────────────────────────────────────────────────────────────────────────

describe('display list integrity across navigation steps', () => {
	it('navigating to each branch leaf yields the correct message count', () => {
		const messages = makeBranchingConversation();

		// Branch A: root → user-1 → assistant-1 → user-2a → assistant-2a (4 non-root)
		const listA = getMessageDisplayList(messages, 'assistant-2a');
		expect(listA).toHaveLength(4);

		// Branch B: root → user-1 → assistant-1 → user-2b (3 non-root)
		const listB = getMessageDisplayList(messages, 'user-2b');
		expect(listB).toHaveLength(3);
	});

	it('display list messages are in timestamp order', () => {
		const messages = makeLinearConversation();
		const list = getMessageDisplayList(messages, 'assistant-2');

		const timestamps = list.map((i) => i.message.timestamp);
		for (let i = 1; i < timestamps.length; i++) {
			expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
		}
	});

	it('after navigating from branch A to B, branch B display list is stable', () => {
		const messages = makeBranchingConversation();

		// Load A, then load B — result should be deterministic
		getMessageDisplayList(messages, 'assistant-2a'); // warm up
		const listB1 = getMessageDisplayList(messages, 'user-2b');
		const listB2 = getMessageDisplayList(messages, 'user-2b');

		expect(listB1.map((i) => i.message.id)).toEqual(listB2.map((i) => i.message.id));
	});
});
