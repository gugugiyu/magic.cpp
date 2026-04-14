import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as messagesApi from '$lib/api/messages.api';
import type { DatabaseMessage } from '$lib/types/database';

vi.mock('$app/paths', () => ({ base: '/app' }));

vi.mock('$lib/stores/server-endpoint.svelte', () => ({
	serverEndpointStore: {
		isDefault: () => true,
		getBaseUrl: () => 'http://localhost:3000'
	}
}));

vi.mock('$lib/utils/api-headers', () => ({
	getJsonHeaders: () => ({ 'Content-Type': 'application/json' })
}));

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

function mockFetch(response: unknown, options: { ok?: boolean; status?: number } = {}) {
	const { ok = true, status = 200 } = options;
	return vi.mocked(global.fetch).mockResolvedValueOnce({
		ok,
		status,
		json: () => Promise.resolve(response)
	} as Response);
}

function parseRequestBody(fetchCall: unknown[]): Record<string, unknown> {
	const bodyStr = (fetchCall[1] as { body?: string })?.body;
	return bodyStr ? JSON.parse(bodyStr) : {};
}

describe('messages.api', () => {
	beforeEach(() => {
		vi.resetModules();
		global.fetch = vi.fn();
	});

	describe('getMessageById', () => {
		it('makes GET request to /api/messages/:id', async () => {
			const mockMsg = makeMsg();
			mockFetch(mockMsg);

			const result = await messagesApi.getMessageById('msg-1');

			expect(global.fetch).toHaveBeenCalledWith('/app/api/messages/msg-1', expect.any(Object));
			expect(result).toEqual(mockMsg);
		});
	});

	describe('getConversationMessages', () => {
		it('makes GET request to /api/conversations/:id/messages', async () => {
			const mockMessages = [makeMsg({ id: 'msg-1' }), makeMsg({ id: 'msg-2' })];
			mockFetch(mockMessages);

			const result = await messagesApi.getConversationMessages('conv-1');

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1/messages',
				expect.any(Object)
			);
			expect(result).toEqual(mockMessages);
		});
	});

	describe('updateMessage', () => {
		it('makes PUT request to /api/messages/:id', async () => {
			const mockMsg = makeMsg({ content: 'Updated content' });
			mockFetch(mockMsg);

			const result = await messagesApi.updateMessage('msg-1', { content: 'Updated content' });

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/messages/msg-1',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ content: 'Updated content' })
				})
			);
			expect(result).toEqual(mockMsg);
		});

		it('handles partial updates', async () => {
			mockFetch(makeMsg());

			await messagesApi.updateMessage('msg-1', { role: 'assistant' });

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/messages/msg-1',
				expect.objectContaining({
					body: JSON.stringify({ role: 'assistant' })
				})
			);
		});
	});

	describe('deleteMessage', () => {
		it('makes DELETE request to /api/messages/:id', async () => {
			mockFetch(undefined, { status: 204 });

			await messagesApi.deleteMessage('msg-1');

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/messages/msg-1',
				expect.objectContaining({ method: 'DELETE' })
			);
		});

		it('appends newParentId query param when provided', async () => {
			mockFetch(undefined, { status: 204 });

			await messagesApi.deleteMessage('msg-1', { newParentId: 'new-parent-1' });

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/messages/msg-1?newParentId=new-parent-1',
				expect.objectContaining({ method: 'DELETE' })
			);
		});

		it('handles 204 No Content response', async () => {
			mockFetch(undefined, { status: 204 });

			const result = await messagesApi.deleteMessage('msg-1');

			expect(result).toBeUndefined();
		});
	});

	describe('deleteMessageCascading', () => {
		it('makes POST request to /api/messages/:id/delete-cascading', async () => {
			const deletedIds = ['msg-1', 'msg-2', 'msg-3'];
			mockFetch(deletedIds);

			const result = await messagesApi.deleteMessageCascading('msg-1', 'conv-1');

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/messages/msg-1/delete-cascading',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ conversationId: 'conv-1' })
				})
			);
			expect(result).toEqual(deletedIds);
		});
	});

	describe('createMessage', () => {
		it('makes POST request to /api/conversations/:id/messages', async () => {
			const mockMsg = makeMsg({ id: 'msg-new' });
			mockFetch(mockMsg);

			const result = await messagesApi.createMessage('conv-1', {
				type: 'text',
				role: 'user',
				content: 'Hello'
			});

			expect(global.fetch).toHaveBeenCalled();
			const body = parseRequestBody(vi.mocked(global.fetch).mock.calls[0]!);
			expect(body.type).toBe('text');
			expect(body.role).toBe('user');
			expect(body.content).toBe('Hello');
			expect(result).toEqual(mockMsg);
		});

		it('appends parentId query param when provided', async () => {
			const mockMsg = makeMsg();
			mockFetch(mockMsg);

			await messagesApi.createMessage(
				'conv-1',
				{ type: 'text', role: 'user', content: 'Hello' },
				{ parentId: 'parent-1' }
			);

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1/messages?parentId=parent-1',
				expect.any(Object)
			);
		});

		it('appends type query param for root messages', async () => {
			const mockMsg = makeMsg();
			mockFetch(mockMsg);

			await messagesApi.createMessage(
				'conv-1',
				{ type: 'root', role: 'system', content: '' },
				{ type: 'root' }
			);

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1/messages?type=root',
				expect.any(Object)
			);
		});

		it('combines multiple query params', async () => {
			const mockMsg = makeMsg();
			mockFetch(mockMsg);

			await messagesApi.createMessage(
				'conv-1',
				{ type: 'text', role: 'user', content: 'Hello' },
				{ parentId: 'parent-1', type: 'system' }
			);

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1/messages?parentId=parent-1&type=system',
				expect.any(Object)
			);
		});

		it('handles empty parentId (becomes empty string in query)', async () => {
			const mockMsg = makeMsg();
			mockFetch(mockMsg);

			await messagesApi.createMessage(
				'conv-1',
				{ type: 'text', role: 'user', content: 'Hello' },
				{ parentId: '' }
			);

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1/messages?parentId=',
				expect.any(Object)
			);
		});
	});

	describe('createRootMessage', () => {
		it('makes POST request with root type', async () => {
			const mockMsg = makeMsg({ id: 'msg-root', type: 'root' });
			mockFetch(mockMsg);

			const result = await messagesApi.createRootMessage('conv-1');

			expect(global.fetch).toHaveBeenCalled();
			const body = parseRequestBody(vi.mocked(global.fetch).mock.calls[0]!);
			expect(body.type).toBe('root');
			expect(body.role).toBe('system');
			expect(result).toEqual(mockMsg);
		});
	});

	describe('createSystemMessage', () => {
		it('makes POST request with system type and parentId', async () => {
			const mockMsg = makeMsg({ id: 'msg-sys', type: 'system' });
			mockFetch(mockMsg);

			const result = await messagesApi.createSystemMessage('conv-1', 'You are helpful', 'parent-1');

			expect(global.fetch).toHaveBeenCalled();
			const body = parseRequestBody(vi.mocked(global.fetch).mock.calls[0]!);
			expect(body.type).toBe('system');
			expect(body.role).toBe('system');
			expect(body.content).toBe('You are helpful');
			expect(result).toEqual(mockMsg);
		});
	});

	describe('createMessageBranch', () => {
		it('makes POST request with parentId', async () => {
			const mockMsg = makeMsg({ id: 'msg-branch' });
			mockFetch(mockMsg);

			const result = await messagesApi.createMessageBranch(
				{ type: 'text', role: 'user', content: 'Reply' },
				'conv-1',
				'parent-1'
			);

			expect(global.fetch).toHaveBeenCalled();
			const body = parseRequestBody(vi.mocked(global.fetch).mock.calls[0]!);
			expect(body.type).toBe('text');
			expect(body.role).toBe('user');
			expect(body.content).toBe('Reply');
			expect(result).toEqual(mockMsg);
		});

		it('handles null parentId', async () => {
			const mockMsg = makeMsg({ id: 'msg-branch' });
			mockFetch(mockMsg);

			await messagesApi.createMessageBranch(
				{ type: 'text', role: 'user', content: 'Root reply' },
				'conv-1',
				null
			);

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1/messages?parentId=',
				expect.any(Object)
			);
		});
	});

	describe('updateCurrentNode', () => {
		it('makes PUT request to update currNode', async () => {
			const mockConv = { id: 'conv-1', name: 'Test', currNode: 'new-node' };
			mockFetch(mockConv);

			const result = await messagesApi.updateCurrentNode('conv-1', 'new-node');

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ currNode: 'new-node' })
				})
			);
			expect(result).toEqual(mockConv);
		});
	});
});
