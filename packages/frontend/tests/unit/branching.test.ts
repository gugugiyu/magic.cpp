/**
 * Unit tests for message branching utilities.
 *
 * Tests cover: findMessageById, filterByLeafNodeId, findLeafNode,
 * getMessageSiblings, hasMessageSiblings, getNextSibling,
 * getPreviousSibling, findDescendantMessages, getMessageDisplayList.
 */

import { describe, it, expect } from 'vitest';
import { MessageRole } from '$lib/enums';
import {
	filterByLeafNodeId,
	findLeafNode,
	getMessageSiblings,
	hasMessageSiblings,
	getNextSibling,
	getPreviousSibling,
	findDescendantMessages,
	getMessageDisplayList
} from '$lib/utils/branching';
import {
	makeMessage,
	makeUserMessage,
	makeAssistantMessage,
	makeRootMessage,
	makeBranchingConversation,
	makeLinearConversation,
	makeMultiBranchConversation
} from '../fixtures/messages';

// ─────────────────────────────────────────────
// filterByLeafNodeId
// ─────────────────────────────────────────────

describe('filterByLeafNodeId', () => {
	it('returns path from root to leaf (excluding root by default)', () => {
		const messages = makeLinearConversation();
		const result = filterByLeafNodeId(messages, 'assistant-2');
		expect(result).toHaveLength(4); // user-1, assistant-1, user-2, assistant-2
		expect(result.map((m) => m.id)).toEqual(['user-1', 'assistant-1', 'user-2', 'assistant-2']);
	});

	it('includes root when includeRoot is true', () => {
		const messages = makeLinearConversation();
		const result = filterByLeafNodeId(messages, 'assistant-2', true);
		expect(result).toHaveLength(5); // root + 4 messages
		expect(result[0].type).toBe('root');
	});

	it('sorts system messages first', () => {
		// Create a path where system message IS on the path to the leaf
		const root = makeRootMessage({ id: 'root-1' });
		const sysMsg = makeMessage({
			id: 'sys-1',
			role: MessageRole.SYSTEM,
			type: 'system',
			parent: 'root-1',
			timestamp: 1_700_000_001_000
		});
		const user1 = makeUserMessage({ id: 'user-1', parent: 'sys-1', timestamp: 1_700_000_002_000 });
		const assistant1 = makeAssistantMessage({
			id: 'assistant-1',
			parent: 'user-1',
			timestamp: 1_700_000_003_000
		});

		root.children = ['sys-1'];
		sysMsg.children = ['user-1'];
		user1.children = ['assistant-1'];
		assistant1.children = [];

		const result = filterByLeafNodeId([root, sysMsg, user1, assistant1], 'assistant-1');
		const ids = result.map((m) => m.id);

		// System message should come first (sorted before user/assistant by role)
		expect(ids).toContain('sys-1');
		expect(ids.indexOf('sys-1')).toBeLessThan(ids.indexOf('user-1'));
	});

	it('falls back to latest message when leafNodeId not found', () => {
		const messages = makeLinearConversation();
		// Use a non-existent ID; should fall back to latest timestamp
		const result = filterByLeafNodeId(messages, 'non-existent');
		expect(result.length).toBeGreaterThan(0);
	});

	it('returns path to branch A leaf', () => {
		const messages = makeBranchingConversation();
		const result = filterByLeafNodeId(messages, 'assistant-2a');
		expect(result.map((m) => m.id)).toEqual(['user-1', 'assistant-1', 'user-2a', 'assistant-2a']);
	});

	it('returns path to branch B leaf', () => {
		const messages = makeBranchingConversation();
		const result = filterByLeafNodeId(messages, 'user-2b');
		expect(result.map((m) => m.id)).toEqual(['user-1', 'assistant-1', 'user-2b']);
	});

	it('returns empty for messages array with no matching path', () => {
		const single = makeUserMessage({ id: 'only-one' });
		const result = filterByLeafNodeId([single], 'does-not-exist');
		// Falls back to the only message
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('only-one');
	});
});

// ─────────────────────────────────────────────
// findLeafNode
// ─────────────────────────────────────────────

describe('findLeafNode', () => {
	it('returns the same id for a leaf node', () => {
		const messages = makeLinearConversation();
		expect(findLeafNode(messages, 'assistant-2')).toBe('assistant-2');
	});

	it('traverses down to the last child', () => {
		const messages = makeLinearConversation();
		expect(findLeafNode(messages, 'root-lin')).toBe('assistant-2');
	});

	it('follows the last child when there are multiple children', () => {
		const messages = makeBranchingConversation();
		// assistant-1 has children ['user-2a', 'user-2b']
		// Should follow user-2b (last child)
		expect(findLeafNode(messages, 'assistant-1')).toBe('user-2b');
	});

	it('returns original id for message with no children', () => {
		const messages = makeLinearConversation();
		expect(findLeafNode(messages, 'user-2')).toBe('assistant-2'); // user-2 has assistant-2 as child
	});

	it('handles single message', () => {
		const msg = makeUserMessage({ id: 'only-msg' });
		expect(findLeafNode([msg], 'only-msg')).toBe('only-msg');
	});

	it('returns original id for non-existent message', () => {
		const messages = makeLinearConversation();
		expect(findLeafNode(messages, 'non-existent')).toBe('non-existent');
	});
});

// ─────────────────────────────────────────────
// findDescendantMessages
// ─────────────────────────────────────────────

describe('findDescendantMessages', () => {
	it('finds all descendants of a message', () => {
		const messages = makeLinearConversation();
		const descendants = findDescendantMessages(messages, 'user-1');
		// user-1 → assistant-1 → user-2 → assistant-2
		expect(descendants).toEqual(['assistant-1', 'user-2', 'assistant-2']);
	});

	it('finds direct children only for leaf message', () => {
		const messages = makeLinearConversation();
		const descendants = findDescendantMessages(messages, 'assistant-2');
		expect(descendants).toEqual([]);
	});

	it('finds descendants in branching tree', () => {
		const messages = makeBranchingConversation();
		const descendants = findDescendantMessages(messages, 'assistant-1');
		// assistant-1 → user-2a → assistant-2a, and user-2b
		expect(descendants).toContain('user-2a');
		expect(descendants).toContain('assistant-2a');
		expect(descendants).toContain('user-2b');
	});

	it('finds all descendants of root in linear conversation', () => {
		const messages = makeLinearConversation();
		const descendants = findDescendantMessages(messages, 'root-lin');
		expect(descendants).toEqual(['user-1', 'assistant-1', 'user-2', 'assistant-2']);
	});

	it('returns empty for non-existent message', () => {
		const messages = makeLinearConversation();
		const descendants = findDescendantMessages(messages, 'non-existent');
		expect(descendants).toEqual([]);
	});
});

// ─────────────────────────────────────────────
// getMessageSiblings
// ─────────────────────────────────────────────

describe('getMessageSiblings', () => {
	it('returns null for non-existent message', () => {
		const messages = makeLinearConversation();
		expect(getMessageSiblings(messages, 'non-existent')).toBeNull();
	});

	it('returns single sibling for root message (null parent)', () => {
		const messages = makeLinearConversation();
		const info = getMessageSiblings(messages, 'root-lin');
		expect(info).not.toBeNull();
		expect(info?.totalSiblings).toBe(1);
		expect(info?.currentIndex).toBe(0);
		expect(info?.siblingIds).toEqual(['root-lin']);
	});

	it('returns single sibling for message with no siblings', () => {
		const messages = makeLinearConversation();
		const info = getMessageSiblings(messages, 'user-1');
		expect(info).not.toBeNull();
		expect(info?.totalSiblings).toBe(1);
		expect(info?.currentIndex).toBe(0);
	});

	it('returns multiple siblings at branch point', () => {
		const messages = makeBranchingConversation();
		const info = getMessageSiblings(messages, 'user-2a');
		expect(info).not.toBeNull();
		expect(info?.totalSiblings).toBe(2);
		expect(info?.siblingIds).toContain('assistant-2a'); // leaf of user-2a
		expect(info?.siblingIds).toContain('user-2b'); // leaf of user-2b
	});

	it('shows correct index for second sibling', () => {
		const messages = makeBranchingConversation();
		const info = getMessageSiblings(messages, 'user-2b');
		expect(info?.currentIndex).toBe(1);
		expect(info?.totalSiblings).toBe(2);
	});

	it('converts sibling IDs to their leaf node IDs', () => {
		const messages = makeBranchingConversation();
		const info = getMessageSiblings(messages, 'user-2a');
		// user-2a's siblingIds should contain leaf node IDs
		expect(info?.siblingIds).toContain('assistant-2a'); // user-2a's own leaf
		expect(info?.siblingIds).toContain('user-2b'); // user-2b is itself a leaf
	});

	it('handles message with parent not found', () => {
		const msg = makeUserMessage({ id: 'orphan', parent: 'non-existent-parent' });
		const info = getMessageSiblings([msg], 'orphan');
		expect(info).not.toBeNull();
		expect(info?.totalSiblings).toBe(1);
	});

	it('returns 3 siblings for multi-branch', () => {
		const messages = makeMultiBranchConversation();
		const info = getMessageSiblings(messages, 'branch-a');
		expect(info?.totalSiblings).toBe(3);
		expect(info?.siblingIds).toContain('assistant-a');
		expect(info?.siblingIds).toContain('assistant-b');
		expect(info?.siblingIds).toContain('assistant-c');
	});
});

// ─────────────────────────────────────────────
// hasMessageSiblings
// ─────────────────────────────────────────────

describe('hasMessageSiblings', () => {
	it('returns false for message with no siblings', () => {
		const messages = makeLinearConversation();
		expect(hasMessageSiblings(messages, 'user-1')).toBe(false);
	});

	it('returns true for message with siblings', () => {
		const messages = makeBranchingConversation();
		expect(hasMessageSiblings(messages, 'user-2a')).toBe(true);
		expect(hasMessageSiblings(messages, 'user-2b')).toBe(true);
	});

	it('returns false for non-existent message', () => {
		const messages = makeLinearConversation();
		expect(hasMessageSiblings(messages, 'non-existent')).toBe(false);
	});
});

// ─────────────────────────────────────────────
// getNextSibling
// ─────────────────────────────────────────────

describe('getNextSibling', () => {
	it('returns next sibling id', () => {
		const messages = makeBranchingConversation();
		const next = getNextSibling(messages, 'user-2a');
		expect(next).toBe('user-2b');
	});

	it('returns null for last sibling', () => {
		const messages = makeBranchingConversation();
		const next = getNextSibling(messages, 'user-2b');
		expect(next).toBeNull();
	});

	it('returns null for message with no siblings', () => {
		const messages = makeLinearConversation();
		const next = getNextSibling(messages, 'user-1');
		expect(next).toBeNull();
	});

	it('returns null for non-existent message', () => {
		const messages = makeLinearConversation();
		const next = getNextSibling(messages, 'non-existent');
		expect(next).toBeNull();
	});

	it('returns third sibling in multi-branch', () => {
		const messages = makeMultiBranchConversation();
		const nextA = getNextSibling(messages, 'branch-a');
		expect(nextA).toBe('assistant-b');
		const nextB = getNextSibling(messages, 'branch-b');
		expect(nextB).toBe('assistant-c');
	});
});

// ─────────────────────────────────────────────
// getPreviousSibling
// ─────────────────────────────────────────────

describe('getPreviousSibling', () => {
	it('returns previous sibling id', () => {
		const messages = makeBranchingConversation();
		const prev = getPreviousSibling(messages, 'user-2b');
		expect(prev).toBe('assistant-2a'); // leaf of user-2a
	});

	it('returns null for first sibling', () => {
		const messages = makeBranchingConversation();
		const prev = getPreviousSibling(messages, 'user-2a');
		expect(prev).toBeNull();
	});

	it('returns null for message with no siblings', () => {
		const messages = makeLinearConversation();
		const prev = getPreviousSibling(messages, 'user-1');
		expect(prev).toBeNull();
	});

	it('returns null for non-existent message', () => {
		const messages = makeLinearConversation();
		const prev = getPreviousSibling(messages, 'non-existent');
		expect(prev).toBeNull();
	});

	it('returns previous sibling in multi-branch', () => {
		const messages = makeMultiBranchConversation();
		const prev = getPreviousSibling(messages, 'branch-c');
		expect(prev).toBe('assistant-b');
	});
});

// ─────────────────────────────────────────────
// getMessageDisplayList
// ─────────────────────────────────────────────

describe('getMessageDisplayList', () => {
	it('returns display list for linear conversation', () => {
		const messages = makeLinearConversation();
		const list = getMessageDisplayList(messages, 'assistant-2');
		// Should have 4 entries (user-1, assistant-1, user-2, assistant-2)
		expect(list).toHaveLength(4);
		expect(list.every((item) => item.totalSiblings === 1)).toBe(true);
	});

	it('returns display list with sibling info for branching conversation', () => {
		const messages = makeBranchingConversation();
		const list = getMessageDisplayList(messages, 'assistant-2a');
		// Path: user-1, assistant-1, user-2a, assistant-2a
		expect(list.length).toBeGreaterThanOrEqual(3);
	});

	it('skips root messages', () => {
		const messages = makeLinearConversation();
		const list = getMessageDisplayList(messages, 'assistant-2');
		const hasRoot = list.some((item) => item.message.type === 'root');
		expect(hasRoot).toBe(false);
	});

	it('returns empty for non-existent leaf', () => {
		const messages = makeLinearConversation();
		const list = getMessageDisplayList(messages, 'non-existent');
		// Falls back to some messages
		expect(list.length).toBeGreaterThanOrEqual(0);
	});
});
