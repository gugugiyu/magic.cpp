/**
 * Integration tests: DatabaseService fork conversation flow
 *
 * Verifies that DatabaseService.forkConversation correctly delegates to
 * conversationsAPI.forkConversation with the right parameter shape,
 * and that the returned conversation is forwarded as-is.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/api/conversations.api', () => ({
	createConversation: vi.fn(),
	getConversation: vi.fn(),
	getAllConversations: vi.fn(),
	updateConversation: vi.fn(),
	deleteConversation: vi.fn(),
	forkConversation: vi.fn(),
	importConversations: vi.fn(),
	exportConversations: vi.fn()
}));

vi.mock('$lib/api/messages.api', () => ({
	createRootMessage: vi.fn(),
	createSystemMessage: vi.fn(),
	createMessageBranch: vi.fn(),
	getConversationMessages: vi.fn(),
	getMessageById: vi.fn(),
	addMessageToDatabase: vi.fn(),
	updateMessage: vi.fn(),
	deleteMessage: vi.fn(),
	deleteMessageCascading: vi.fn(),
	updateCurrentNode: vi.fn(),
	compactMessageTree: vi.fn()
}));

import * as conversationsAPI from '$lib/api/conversations.api';
import * as messagesAPI from '$lib/api/messages.api';
import { DatabaseService } from '$lib/services/database.service';

const mockConvAPI = conversationsAPI as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockMsgAPI = messagesAPI as unknown as Record<string, ReturnType<typeof vi.fn>>;

function makeConversation(overrides: Partial<DatabaseConversation> = {}): DatabaseConversation {
	return {
		id: 'conv-1',
		name: 'Test Conversation',
		timestamp: Date.now(),
		currentNode: null,
		parentId: null,
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// forkConversation delegation
// ─────────────────────────────────────────────────────────────────────────────

describe('DatabaseService.forkConversation', () => {
	it('delegates to conversationsAPI.forkConversation with correct params', async () => {
		const forkedConv = makeConversation({
			id: 'conv-forked',
			name: 'Fork of conv-1',
			parentId: 'conv-1'
		});
		mockConvAPI.forkConversation.mockResolvedValue(forkedConv);

		const result = await DatabaseService.forkConversation('conv-1', 'msg-5', {
			name: 'Fork of conv-1',
			includeAttachments: true
		});

		expect(mockConvAPI.forkConversation).toHaveBeenCalledOnce();
		expect(mockConvAPI.forkConversation).toHaveBeenCalledWith('conv-1', {
			messageId: 'msg-5',
			name: 'Fork of conv-1',
			includeAttachments: true
		});
		expect(result.id).toBe('conv-forked');
		expect(result.name).toBe('Fork of conv-1');
	});

	it('passes includeAttachments: false correctly', async () => {
		const forkedConv = makeConversation({
			id: 'conv-fork-2',
			name: 'Slim Fork',
			parentId: 'conv-1'
		});
		mockConvAPI.forkConversation.mockResolvedValue(forkedConv);

		await DatabaseService.forkConversation('conv-1', 'msg-3', {
			name: 'Slim Fork',
			includeAttachments: false
		});

		const callArgs = mockConvAPI.forkConversation.mock.calls[0];
		expect(callArgs[1].includeAttachments).toBe(false);
	});

	it('returns the conversation object returned by the API', async () => {
		const expected = makeConversation({ id: 'fork-xyz', name: 'My Fork', parentId: 'conv-abc' });
		mockConvAPI.forkConversation.mockResolvedValue(expected);

		const result = await DatabaseService.forkConversation('conv-abc', 'msg-10', {
			name: 'My Fork',
			includeAttachments: true
		});

		expect(result).toEqual(expected);
	});

	it('propagates API errors to the caller', async () => {
		mockConvAPI.forkConversation.mockRejectedValue(new Error('Fork failed'));

		await expect(
			DatabaseService.forkConversation('conv-1', 'msg-1', {
				name: 'Bad Fork',
				includeAttachments: false
			})
		).rejects.toThrow('Fork failed');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// createConversation delegation
// ─────────────────────────────────────────────────────────────────────────────

describe('DatabaseService.createConversation', () => {
	it('delegates to conversationsAPI.createConversation', async () => {
		const newConv = makeConversation({ id: 'conv-new', name: 'New Chat' });
		mockConvAPI.createConversation.mockResolvedValue(newConv);

		const result = await DatabaseService.createConversation('New Chat');

		expect(mockConvAPI.createConversation).toHaveBeenCalledWith({ name: 'New Chat' });
		expect(result.id).toBe('conv-new');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// getConversation delegation
// ─────────────────────────────────────────────────────────────────────────────

describe('DatabaseService.getConversation', () => {
	it('returns conversation when API resolves', async () => {
		const conv = makeConversation({ id: 'conv-5' });
		mockConvAPI.getConversation.mockResolvedValue(conv);

		const result = await DatabaseService.getConversation('conv-5');
		expect(result?.id).toBe('conv-5');
	});

	it('returns undefined when API throws (not found)', async () => {
		mockConvAPI.getConversation.mockRejectedValue(new Error('Not found'));

		const result = await DatabaseService.getConversation('nonexistent');
		expect(result).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// getAllConversations delegation
// ─────────────────────────────────────────────────────────────────────────────

describe('DatabaseService.getAllConversations', () => {
	it('returns all conversations from API', async () => {
		const convs = [
			makeConversation({ id: 'conv-1' }),
			makeConversation({ id: 'conv-2' }),
			makeConversation({ id: 'conv-3' })
		];
		mockConvAPI.getAllConversations.mockResolvedValue(convs);

		const result = await DatabaseService.getAllConversations();
		expect(result).toHaveLength(3);
		expect(result[0].id).toBe('conv-1');
	});

	it('returns empty array when no conversations exist', async () => {
		mockConvAPI.getAllConversations.mockResolvedValue([]);

		const result = await DatabaseService.getAllConversations();
		expect(result).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteConversation delegation
// ─────────────────────────────────────────────────────────────────────────────

describe('DatabaseService.deleteConversation', () => {
	it('delegates to conversationsAPI.deleteConversation', async () => {
		mockConvAPI.deleteConversation.mockResolvedValue(undefined);

		await DatabaseService.deleteConversation('conv-1');

		expect(mockConvAPI.deleteConversation).toHaveBeenCalledWith('conv-1', undefined);
	});

	it('passes deleteWithForks option when provided', async () => {
		mockConvAPI.deleteConversation.mockResolvedValue(undefined);

		await DatabaseService.deleteConversation('conv-1', { deleteWithForks: true });

		expect(mockConvAPI.deleteConversation).toHaveBeenCalledWith('conv-1', {
			deleteWithForks: true
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// createRootMessage delegation
// ─────────────────────────────────────────────────────────────────────────────

describe('DatabaseService.createRootMessage', () => {
	it('delegates to messagesAPI.createRootMessage and returns the message id', async () => {
		mockMsgAPI.createRootMessage.mockResolvedValue({ id: 'root-msg-1' });

		const id = await DatabaseService.createRootMessage('conv-1');

		expect(mockMsgAPI.createRootMessage).toHaveBeenCalledWith('conv-1');
		expect(id).toBe('root-msg-1');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// importConversations / exportConversations delegation
// ─────────────────────────────────────────────────────────────────────────────

describe('DatabaseService import/export delegation', () => {
	it('importConversations passes data to the API', async () => {
		mockConvAPI.importConversations.mockResolvedValue({ imported: 2, skipped: 0 });

		const data = [
			{ conv: makeConversation({ id: 'c1' }), messages: [] },
			{ conv: makeConversation({ id: 'c2' }), messages: [] }
		];

		const result = await DatabaseService.importConversations(data);

		expect(mockConvAPI.importConversations).toHaveBeenCalledWith(data);
		expect(result.imported).toBe(2);
		expect(result.skipped).toBe(0);
	});

	it('exportConversations returns data from the API', async () => {
		const exported = [{ conv: makeConversation({ id: 'c1' }), messages: [] }];
		mockConvAPI.exportConversations.mockResolvedValue(exported);

		const result = await DatabaseService.exportConversations();

		expect(mockConvAPI.exportConversations).toHaveBeenCalledOnce();
		expect(result).toEqual(exported);
	});
});
