import { describe, expect, it } from 'vitest';
import { buildConversationTree } from '$lib/stores/conversations.svelte';

function makeConv(id: string, overrides: Partial<DatabaseConversation> = {}): DatabaseConversation {
	return {
		id,
		name: `Conversation ${id}`,
		lastModified: 1000,
		currNode: null,
		...overrides
	};
}

describe('buildConversationTree', () => {
	it('places roots at depth 0', () => {
		const convs = [makeConv('a'), makeConv('b')];
		const tree = buildConversationTree(convs);

		expect(tree).toHaveLength(2);
		expect(tree[0].depth).toBe(0);
		expect(tree[1].depth).toBe(0);
	});

	it('nests forks under their parent', () => {
		const convs = [makeConv('parent'), makeConv('child', { forkedFromConversationId: 'parent' })];
		const tree = buildConversationTree(convs);

		expect(tree).toHaveLength(2);
		expect(tree[0].conversation.id).toBe('parent');
		expect(tree[0].depth).toBe(0);
		expect(tree[1].conversation.id).toBe('child');
		expect(tree[1].depth).toBe(1);
	});

	it('sorts pinned conversations before unpinned ones', () => {
		const convs = [
			makeConv('b', { pinned: true, lastModified: 500 }),
			makeConv('a', { pinned: false, lastModified: 1000 })
		];
		const tree = buildConversationTree(convs);

		expect(tree[0].conversation.id).toBe('b');
		expect(tree[1].conversation.id).toBe('a');
	});

	it('renders orphaned forks at depth 0 when parent is missing', () => {
		const convs = [makeConv('orphan', { forkedFromConversationId: 'deleted-parent' })];
		const tree = buildConversationTree(convs);

		expect(tree).toHaveLength(1);
		expect(tree[0].conversation.id).toBe('orphan');
		expect(tree[0].depth).toBe(0);
	});

	it('renders orphan chains at depth 0 when ancestors are missing', () => {
		const convs = [
			makeConv('a', { forkedFromConversationId: 'deleted-root' }),
			makeConv('b', { forkedFromConversationId: 'a' })
		];
		const tree = buildConversationTree(convs);

		expect(tree).toHaveLength(2);
		expect(tree[0].conversation.id).toBe('a');
		expect(tree[0].depth).toBe(0);
		expect(tree[1].conversation.id).toBe('b');
		expect(tree[1].depth).toBe(1); // b's parent a IS in the list, so it gets depth 1 under a
	});

	it('keeps pinned orphans at depth 0', () => {
		const convs = [
			makeConv('unpinned-root', { lastModified: 2000 }),
			makeConv('pinned-orphan', {
				pinned: true,
				lastModified: 500,
				forkedFromConversationId: 'deleted-parent'
			})
		];
		const tree = buildConversationTree(convs);

		// Orphans are processed in input order, not re-sorted
		expect(tree[0].conversation.id).toBe('unpinned-root');
		expect(tree[0].depth).toBe(0);
		expect(tree[1].conversation.id).toBe('pinned-orphan');
		expect(tree[1].depth).toBe(0);
	});
});
