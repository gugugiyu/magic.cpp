import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as conversationsApi from '$lib/api/conversations.api';
import type { DatabaseConversation, DatabaseMessage } from '$lib/types/database';

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

function makeConv(overrides: Partial<DatabaseConversation> = {}): DatabaseConversation {
	return {
		id: 'conv-1',
		name: 'Test Conversation',
		currNode: 'node-1',
		lastModified: Date.now(),
		...overrides
	} as DatabaseConversation;
}

function mockFetch(response: unknown, options: { ok?: boolean; status?: number } = {}) {
	const { ok = true, status = 200 } = options;
	return vi.mocked(global.fetch).mockResolvedValueOnce({
		ok,
		status,
		json: () => Promise.resolve(response)
	} as Response);
}

describe('conversations.api', () => {
	beforeEach(() => {
		vi.resetModules();
		global.fetch = vi.fn();
	});

	describe('createConversation', () => {
		it('makes POST request to /api/conversations', async () => {
			const mockConv = makeConv({ id: 'conv-new', name: 'New Conversation' });
			mockFetch(mockConv);

			const result = await conversationsApi.createConversation({ name: 'New Conversation' });

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ name: 'New Conversation' })
				})
			);
			expect(result).toEqual(mockConv);
		});

		it('passes mcpServerOverrides when provided', async () => {
			const mockConv = makeConv();
			mockFetch(mockConv);

			await conversationsApi.createConversation({
				name: 'Test',
				mcpServerOverrides: [{ serverId: 'server-1', enabled: true }]
			});

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations',
				expect.objectContaining({
					method: 'POST'
				})
			);
			const callBody = JSON.parse(
				(global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string
			);
			expect(callBody.mcpServerOverrides).toHaveLength(1);
			expect(callBody.mcpServerOverrides[0].serverId).toBe('server-1');
		});
	});

	describe('getConversation', () => {
		it('makes GET request to /api/conversations/:id', async () => {
			const mockConv = makeConv();
			mockFetch(mockConv);

			const result = await conversationsApi.getConversation('conv-1');

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1',
				expect.any(Object)
			);
			expect(result).toEqual(mockConv);
		});
	});

	describe('getAllConversations', () => {
		it('makes GET request to /api/conversations', async () => {
			const mockConvs = [makeConv({ id: 'conv-1' }), makeConv({ id: 'conv-2' })];
			mockFetch(mockConvs);

			const result = await conversationsApi.getAllConversations();

			expect(global.fetch).toHaveBeenCalledWith('/app/api/conversations', expect.any(Object));
			expect(result).toEqual(mockConvs);
		});
	});

	describe('updateConversation', () => {
		it('makes PUT request with updates', async () => {
			const mockConv = makeConv({ name: 'Updated Name' });
			mockFetch(mockConv);

			const result = await conversationsApi.updateConversation('conv-1', { name: 'Updated Name' });

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ name: 'Updated Name' })
				})
			);
			expect(result).toEqual(mockConv);
		});

		it('handles partial updates', async () => {
			mockFetch(makeConv());

			await conversationsApi.updateConversation('conv-1', { currNode: 'new-node' });

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1',
				expect.objectContaining({
					body: JSON.stringify({ currNode: 'new-node' })
				})
			);
		});
	});

	describe('deleteConversation', () => {
		it('makes DELETE request to /api/conversations/:id', async () => {
			mockFetch(undefined, { status: 204 });

			await conversationsApi.deleteConversation('conv-1');

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1',
				expect.objectContaining({ method: 'DELETE' })
			);
		});

		it('appends query param when deleteWithForks is true', async () => {
			mockFetch(undefined, { status: 204 });

			await conversationsApi.deleteConversation('conv-1', { deleteWithForks: true });

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1?deleteWithForks=true',
				expect.objectContaining({ method: 'DELETE' })
			);
		});

		it('handles 204 No Content response', async () => {
			mockFetch(undefined, { status: 204 });

			const result = await conversationsApi.deleteConversation('conv-1');

			expect(result).toBeUndefined();
		});
	});

	describe('forkConversation', () => {
		it('makes POST request to /api/conversations/:id/fork', async () => {
			const mockConv = makeConv({ id: 'conv-forked', name: 'Forked' });
			mockFetch(mockConv);

			const result = await conversationsApi.forkConversation('conv-1', {
				messageId: 'msg-1',
				name: 'Forked',
				includeAttachments: true
			});

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1/fork',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({
						messageId: 'msg-1',
						name: 'Forked',
						includeAttachments: true
					})
				})
			);
			expect(result).toEqual(mockConv);
		});
	});

	describe('importConversations', () => {
		it('makes POST request to /api/conversations/import', async () => {
			const importData = {
				imported: 5,
				skipped: 2
			};
			mockFetch(importData);

			const convs = [{ conv: makeConv(), messages: [] as DatabaseMessage[] }];
			const result = await conversationsApi.importConversations(convs);

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/import',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify(convs)
				})
			);
			expect(result).toEqual(importData);
		});
	});

	describe('exportConversations', () => {
		it('makes GET request to /api/conversations/export', async () => {
			Object.defineProperty(global, 'window', {
				value: { location: { href: 'http://localhost:3000' } },
				configurable: true
			});

			const exportData = [{ conv: makeConv(), messages: [] }];
			mockFetch(exportData);

			const result = await conversationsApi.exportConversations();

			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining('api/conversations/export'),
				expect.any(Object)
			);
			expect(result).toEqual(exportData);
		});
	});

	describe('compactConversation', () => {
		it('makes POST request to /api/conversations/:id/compact', async () => {
			mockFetch({ success: true });

			const summaryMsg = { id: 'summary-1', content: 'Summary' } as DatabaseMessage;
			const messagesToCompact = [{ id: 'old-1' }, { id: 'old-2' }] as DatabaseMessage[];

			const result = await conversationsApi.compactConversation('conv-1', {
				summaryMessage: summaryMsg,
				messagesToCompact,
				anchorMessageId: 'anchor-1'
			});

			expect(global.fetch).toHaveBeenCalledWith(
				'/app/api/conversations/conv-1/compact',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({
						summaryMessage: summaryMsg,
						messagesToCompact,
						anchorMessageId: 'anchor-1'
					})
				})
			);
			expect(result).toEqual({ success: true });
		});
	});
});
