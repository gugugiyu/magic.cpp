import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseService } from '$lib/services/database.service';
import * as conversationsApi from '$lib/api/conversations.api';
import * as messagesApi from '$lib/api/messages.api';
import type { DatabaseConversation, DatabaseMessage } from '$lib/types/database';

vi.mock('$lib/api/conversations.api');
vi.mock('$lib/api/messages.api');

const mockConversationsApi = conversationsApi as typeof conversationsApi & {
	[K in keyof typeof conversationsApi]: ReturnType<typeof vi.fn>;
};

const mockMessagesApi = messagesApi as typeof messagesApi & {
	[K in keyof typeof messagesApi]: ReturnType<typeof vi.fn>;
};

function makeConv(overrides: Partial<DatabaseConversation> = {}): DatabaseConversation {
	return {
		id: 'conv-1',
		name: 'Test',
		currNode: 'node-1',
		lastModified: Date.now(),
		...overrides
	} as DatabaseConversation;
}

function makeMsg(overrides: Partial<DatabaseMessage> = {}): DatabaseMessage {
	return {
		id: 'msg-1',
		convId: 'conv-1',
		type: 'text',
		role: 'user',
		content: 'Hello',
		parent: 'parent-1',
		children: [],
		timestamp: Date.now(),
		...overrides
	} as DatabaseMessage;
}

describe('DatabaseService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Conversation operations', () => {
		it('createConversation calls conversationsAPI.createConversation', async () => {
			const mockConv = makeConv({ id: 'conv-new', name: 'New Conv' });
			mockConversationsApi.createConversation.mockResolvedValue(mockConv);

			const result = await DatabaseService.createConversation('New Conv');

			expect(mockConversationsApi.createConversation).toHaveBeenCalledWith({
				name: 'New Conv'
			});
			expect(result).toEqual(mockConv);
		});

		it('getConversation returns conversation on success', async () => {
			const mockConv = makeConv();
			mockConversationsApi.getConversation.mockResolvedValue(mockConv);

			const result = await DatabaseService.getConversation('conv-1');

			expect(mockConversationsApi.getConversation).toHaveBeenCalledWith('conv-1');
			expect(result).toEqual(mockConv);
		});

		it('getConversation returns undefined on error', async () => {
			mockConversationsApi.getConversation.mockRejectedValue(new Error('Not found'));

			const result = await DatabaseService.getConversation('nonexistent');

			expect(result).toBeUndefined();
		});

		it('getAllConversations returns all conversations', async () => {
			const mockConvs = [makeConv({ id: 'conv-1' }), makeConv({ id: 'conv-2' })];
			mockConversationsApi.getAllConversations.mockResolvedValue(mockConvs);

			const result = await DatabaseService.getAllConversations();

			expect(mockConversationsApi.getAllConversations).toHaveBeenCalled();
			expect(result).toEqual(mockConvs);
		});

		it('updateConversation sends partial updates', async () => {
			mockConversationsApi.updateConversation.mockResolvedValue(makeConv());

			await DatabaseService.updateConversation('conv-1', { name: 'New Name' });

			expect(mockConversationsApi.updateConversation).toHaveBeenCalledWith('conv-1', {
				name: 'New Name'
			});
		});

		it('deleteConversation calls API without options', async () => {
			mockConversationsApi.deleteConversation.mockResolvedValue(undefined);

			await DatabaseService.deleteConversation('conv-1');

			expect(mockConversationsApi.deleteConversation).toHaveBeenCalledWith('conv-1', undefined);
		});

		it('deleteConversation passes deleteWithForks option', async () => {
			mockConversationsApi.deleteConversation.mockResolvedValue(undefined);

			await DatabaseService.deleteConversation('conv-1', { deleteWithForks: true });

			expect(mockConversationsApi.deleteConversation).toHaveBeenCalledWith('conv-1', {
				deleteWithForks: true
			});
		});

		it('forkConversation transforms options format', async () => {
			const mockConv = makeConv({ id: 'conv-forked', name: 'Forked' });
			mockConversationsApi.forkConversation.mockResolvedValue(mockConv);

			const result = await DatabaseService.forkConversation('conv-1', 'msg-1', {
				name: 'Forked',
				includeAttachments: true
			});

			expect(mockConversationsApi.forkConversation).toHaveBeenCalledWith('conv-1', {
				messageId: 'msg-1',
				name: 'Forked',
				includeAttachments: true
			});
			expect(result).toEqual(mockConv);
		});

		it('importConversations passes data through', async () => {
			const importResult = { imported: 5, skipped: 2 };
			mockConversationsApi.importConversations.mockResolvedValue(importResult);

			const data = [{ conv: makeConv(), messages: [] }];
			const result = await DatabaseService.importConversations(data);

			expect(mockConversationsApi.importConversations).toHaveBeenCalledWith(data);
			expect(result).toEqual(importResult);
		});

		it('exportConversations returns exported data', async () => {
			const exportData = [{ conv: makeConv(), messages: [] }];
			mockConversationsApi.exportConversations.mockResolvedValue(exportData);

			const result = await DatabaseService.exportConversations();

			expect(mockConversationsApi.exportConversations).toHaveBeenCalled();
			expect(result).toEqual(exportData);
		});
	});

	describe('Message operations', () => {
		it('createRootMessage returns message', async () => {
			const mockMsg = makeMsg({ id: 'msg-root', type: 'root' });
			mockMessagesApi.createRootMessage.mockResolvedValue(mockMsg);

			const result = await DatabaseService.createRootMessage('conv-1');

			expect(mockMessagesApi.createRootMessage).toHaveBeenCalledWith('conv-1');
			expect(result).toBe('msg-root');
		});

		it('createSystemMessage passes parameters correctly', async () => {
			const mockMsg = makeMsg({ id: 'msg-sys', type: 'system' });
			mockMessagesApi.createSystemMessage.mockResolvedValue(mockMsg);

			const result = await DatabaseService.createSystemMessage(
				'conv-1',
				'You are a helpful assistant',
				'parent-1'
			);

			expect(mockMessagesApi.createSystemMessage).toHaveBeenCalledWith(
				'conv-1',
				'You are a helpful assistant',
				'parent-1'
			);
			expect(result).toEqual(mockMsg);
		});

		it('createMessageBranch passes message data and parentId', async () => {
			const mockMsg = makeMsg({ id: 'msg-branch' });
			mockMessagesApi.createMessageBranch.mockResolvedValue(mockMsg);

			const msgData = {
				convId: 'conv-1',
				type: 'text' as const,
				role: 'user' as const,
				content: 'Hello'
			};
			const result = await DatabaseService.createMessageBranch(msgData, 'parent-1');

			expect(mockMessagesApi.createMessageBranch).toHaveBeenCalled();
			const [passedMsgData, passedConvId, passedParentId] =
				mockMessagesApi.createMessageBranch.mock.calls[0]!;
			expect(passedConvId).toBe('conv-1');
			expect(passedParentId).toBe('parent-1');
			expect((passedMsgData as typeof msgData).content).toBe('Hello');
			expect(result).toEqual(mockMsg);
		});

		it('createMessageBranch handles null parentId', async () => {
			const mockMsg = makeMsg({ id: 'msg-root' });
			mockMessagesApi.createMessageBranch.mockResolvedValue(mockMsg);

			const msgData = { convId: 'conv-1', type: 'text', role: 'user', content: 'Hello' };
			await DatabaseService.createMessageBranch(msgData, null);

			expect(mockMessagesApi.createMessageBranch).toHaveBeenCalled();
			const [, passedConvId, passedParentId] = mockMessagesApi.createMessageBranch.mock.calls[0]!;
			expect(passedConvId).toBe('conv-1');
			expect(passedParentId).toBeNull();
		});

		it('getConversationMessages returns messages array', async () => {
			const mockMessages = [makeMsg({ id: 'msg-1' }), makeMsg({ id: 'msg-2' })];
			mockMessagesApi.getConversationMessages.mockResolvedValue(mockMessages);

			const result = await DatabaseService.getConversationMessages('conv-1');

			expect(mockMessagesApi.getConversationMessages).toHaveBeenCalledWith('conv-1');
			expect(result).toEqual(mockMessages);
		});

		it('getMessageById returns message on success', async () => {
			const mockMsg = makeMsg();
			mockMessagesApi.getMessageById.mockResolvedValue(mockMsg);

			const result = await DatabaseService.getMessageById('msg-1');

			expect(mockMessagesApi.getMessageById).toHaveBeenCalledWith('msg-1');
			expect(result).toEqual(mockMsg);
		});

		it('getMessageById returns undefined on error', async () => {
			mockMessagesApi.getMessageById.mockRejectedValue(new Error('Not found'));

			const result = await DatabaseService.getMessageById('nonexistent');

			expect(result).toBeUndefined();
		});

		it('updateMessage sends correct parameters', async () => {
			mockMessagesApi.updateMessage.mockResolvedValue(makeMsg());

			await DatabaseService.updateMessage('msg-1', { content: 'Updated content' });

			expect(mockMessagesApi.updateMessage).toHaveBeenCalledWith('msg-1', {
				content: 'Updated content'
			});
		});

		it('deleteMessage calls API with id', async () => {
			mockMessagesApi.deleteMessage.mockResolvedValue(undefined);

			await DatabaseService.deleteMessage('msg-1');

			expect(mockMessagesApi.deleteMessage).toHaveBeenCalledWith('msg-1', {
				newParentId: undefined
			});
		});

		it('deleteMessage passes newParentId option', async () => {
			mockMessagesApi.deleteMessage.mockResolvedValue(undefined);

			await DatabaseService.deleteMessage('msg-1', 'new-parent-1');

			expect(mockMessagesApi.deleteMessage).toHaveBeenCalledWith('msg-1', {
				newParentId: 'new-parent-1'
			});
		});

		it('deleteMessageCascading calls API correctly', async () => {
			const deletedIds = ['msg-1', 'msg-2', 'msg-3'];
			mockMessagesApi.deleteMessageCascading.mockResolvedValue(deletedIds);

			const result = await DatabaseService.deleteMessageCascading('conv-1', 'msg-1');

			expect(mockMessagesApi.deleteMessageCascading).toHaveBeenCalledWith('msg-1', 'conv-1');
			expect(result).toEqual(deletedIds);
		});

		it('updateCurrentNode calls API correctly', async () => {
			mockMessagesApi.updateCurrentNode.mockResolvedValue(makeConv());

			await DatabaseService.updateCurrentNode('conv-1', 'node-2');

			expect(mockMessagesApi.updateCurrentNode).toHaveBeenCalledWith('conv-1', 'node-2');
		});

		it('addMessageToDatabase transforms and calls createMessage', async () => {
			const mockMsg = makeMsg({ id: 'msg-new' });
			mockMessagesApi.createMessage.mockResolvedValue(mockMsg);

			const inputMsg = makeMsg({
				id: 'msg-new',
				parent: 'parent-1',
				toolCalls: '[]',
				model: 'gpt-4'
			});
			const result = await DatabaseService.addMessageToDatabase(inputMsg);

			expect(mockMessagesApi.createMessage).toHaveBeenCalledWith(
				'conv-1',
				expect.objectContaining({
					content: 'Hello',
					role: 'user',
					type: 'text',
					parentId: 'parent-1',
					reasoningContent: undefined,
					toolCalls: '[]',
					toolCallId: undefined,
					extra: undefined,
					timings: undefined,
					model: 'gpt-4',
					timestamp: inputMsg.timestamp
				}),
				{ parentId: 'parent-1' }
			);
			expect(result).toEqual(mockMsg);
		});

		it('compactMessageTree calls conversationsAPI.compactConversation', async () => {
			mockConversationsApi.compactConversation.mockResolvedValue({ success: true });

			const summaryMsg = makeMsg({ id: 'summary-1', content: 'Summary' });
			const messagesToCompact = [makeMsg({ id: 'old-1' }), makeMsg({ id: 'old-2' })];

			await DatabaseService.compactMessageTree('conv-1', summaryMsg, messagesToCompact, 'anchor-1');

			expect(mockConversationsApi.compactConversation).toHaveBeenCalledWith('conv-1', {
				summaryMessage: summaryMsg,
				messagesToCompact: messagesToCompact,
				anchorMessageId: 'anchor-1'
			});
		});
	});
});
