/**
 * E2E tests for message CRUD endpoints.
 * These test the full HTTP stack with real HTTP servers and mock upstreams.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createE2ETestServer, type E2ETestServer } from '../helpers/e2e-server.ts';

describe('E2E: Messages CRUD', () => {
	let server: E2ETestServer;

	beforeAll(async () => {
		server = await createE2ETestServer();
	});

	afterAll(async () => {
		await server.stop();
	});

	async function createConversation(name: string) {
		const resp = await server.fetch('/api/conversations', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name }),
		});
		return resp.json();
	}

	describe('POST /api/conversations/:id/messages (regular message)', () => {
		it('creates a regular message with role and content', async () => {
			const conv = await createConversation('Message Test');

			const resp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					role: 'user',
					content: 'Hello, world!',
				}),
			});
			expect(resp.status).toBe(201);

			const msg = await resp.json();
			expect(msg).toHaveProperty('id');
			expect(msg.convId).toBe(conv.id);
			expect(msg.role).toBe('user');
			expect(msg.content).toBe('Hello, world!');
			expect(msg.parent).toBeNull();
		});

		it('creates a message under a parent', async () => {
			const conv = await createConversation('Parent Message Test');

			// Create parent message
			const parentResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'Parent' }),
			});
			const parent = await parentResp.json();

			// Create child message
			const childResp = await server.fetch(
				`/api/conversations/${conv.id}/messages?parentId=${parent.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'assistant', content: 'Child reply' }),
				},
			);
			expect(childResp.status).toBe(201);

			const child = await childResp.json();
			expect(child.parent).toBe(parent.id);

			// Verify parent has child in children array
			const getResp = await server.fetch(`/api/messages/${parent.id}`);
			const parentUpdated = await getResp.json();
			expect(parentUpdated.children).toContain(child.id);
		});

		it('returns 400 when role is missing', async () => {
			const conv = await createConversation('Missing Role');

			const resp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'No role here' }),
			});
			expect(resp.status).toBe(400);

			const body = await resp.json();
			expect(body.error).toContain('role');
		});

		it('returns 400 when content is missing', async () => {
			const conv = await createConversation('Missing Content');

			const resp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user' }),
			});
			expect(resp.status).toBe(400);

			const body = await resp.json();
			expect(body.error).toContain('content');
		});

		it('returns 404 for non-existent conversation', async () => {
			const resp = await server.fetch('/api/conversations/non-existent/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'test' }),
			});
			expect(resp.status).toBe(404);
		});

		it('returns 404 for non-existent parent message', async () => {
			const conv = await createConversation('Bad Parent');

			const resp = await server.fetch(
				`/api/conversations/${conv.id}/messages?parentId=fake-parent-id`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'user', content: 'test' }),
				},
			);
			expect(resp.status).toBe(404);
		});

		it('updates conversation currNode to the new message', async () => {
			const conv = await createConversation('CurrNode Update');

			const msgResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'Latest' }),
			});
			const msg = await msgResp.json();

			// Check conversation was updated
			const convResp = await server.fetch(`/api/conversations/${conv.id}`);
			const updatedConv = await convResp.json();
			expect(updatedConv.currNode).toBe(msg.id);
		});
	});

	describe('POST /api/conversations/:id/messages?type=root', () => {
		it('creates a root message', async () => {
			const conv = await createConversation('Root Message Test');

			const resp = await server.fetch(
				`/api/conversations/${conv.id}/messages?type=root`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({}),
				},
			);
			expect(resp.status).toBe(201);

			const msg = await resp.json();
			// createRootMessage sets role='system' (the type is 'root')
			expect(msg.role).toBe('system');
			expect(msg.content).toBe('');
		});
	});

	describe('POST /api/conversations/:id/messages?type=system', () => {
		it('creates a system message under a parent', async () => {
			const conv = await createConversation('System Message Test');

			// Create parent first
			const parentResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'User says hi' }),
			});
			const parent = await parentResp.json();

			// Create system message
			const sysResp = await server.fetch(
				`/api/conversations/${conv.id}/messages?type=system&parentId=${parent.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ content: 'System instruction here' }),
				},
			);
			expect(sysResp.status).toBe(201);

			const sysMsg = await sysResp.json();
			expect(sysMsg.role).toBe('system');
			expect(sysMsg.content).toBe('System instruction here');
			expect(sysMsg.parent).toBe(parent.id);
		});

		it('returns 400 when system message content is empty', async () => {
			const conv = await createConversation('Empty System');

			const parentResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'test' }),
			});
			const parent = await parentResp.json();

			const resp = await server.fetch(
				`/api/conversations/${conv.id}/messages?type=system&parentId=${parent.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ content: '' }),
				},
			);
			expect(resp.status).toBe(400);
		});

		it('returns 400 when parentId is missing for system message', async () => {
			const conv = await createConversation('No Parent System');

			const resp = await server.fetch(
				`/api/conversations/${conv.id}/messages?type=system`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ content: 'orphan system' }),
				},
			);
			expect(resp.status).toBe(400);
		});
	});

	describe('GET /api/conversations/:id/messages', () => {
		it('gets all messages for a conversation with tree structure', async () => {
			const conv = await createConversation('Get Messages');

			// Create a message tree
			const parentResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'Root user msg' }),
			});
			const parent = await parentResp.json();

			await server.fetch(`/api/conversations/${conv.id}/messages?parentId=${parent.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'assistant', content: 'AI reply' }),
			});

			const resp = await server.fetch(`/api/conversations/${conv.id}/messages`);
			expect(resp.status).toBe(200);

			const messages = await resp.json();
			expect(Array.isArray(messages)).toBe(true);
			expect(messages.length).toBe(2);

			// Should have tree structure with children
			const rootMsg = messages.find((m: any) => m.role === 'user');
			expect(rootMsg.children).toBeDefined();
			expect(rootMsg.children.length).toBe(1);
		});

		it('returns 404 for non-existent conversation', async () => {
			const resp = await server.fetch('/api/conversations/non-existent/messages');
			expect(resp.status).toBe(404);
		});
	});

	describe('GET /api/messages/:id', () => {
		it('gets a single message by ID', async () => {
			const conv = await createConversation('Get Single Message');

			const msgResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'Find me' }),
			});
			const msg = await msgResp.json();

			const resp = await server.fetch(`/api/messages/${msg.id}`);
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body.id).toBe(msg.id);
			expect(body.content).toBe('Find me');
		});

		it('returns 404 for non-existent message', async () => {
			const resp = await server.fetch('/api/messages/non-existent');
			expect(resp.status).toBe(404);

			const body = await resp.json();
			expect(body.error).toBe('Message not found');
		});
	});

	describe('PUT /api/messages/:id', () => {
		it('updates message content', async () => {
			const conv = await createConversation('Update Message');

			const msgResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'Old content' }),
			});
			const msg = await msgResp.json();

			const resp = await server.fetch(`/api/messages/${msg.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'Updated content' }),
			});
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body.content).toBe('Updated content');
		});

		it('updates message role', async () => {
			const conv = await createConversation('Update Role');

			const msgResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'test' }),
			});
			const msg = await msgResp.json();

			const resp = await server.fetch(`/api/messages/${msg.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'assistant' }),
			});
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body.role).toBe('assistant');
		});

		it('accepts children field in update (computed, not persisted)', async () => {
			const conv = await createConversation('Update Children');

			const msgResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'parent' }),
			});
			const msg = await msgResp.json();

			// children is a computed field from the DB schema - update is a no-op
			// but the API should still accept it without error
			const childId = crypto.randomUUID();
			const resp = await server.fetch(`/api/messages/${msg.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ children: [childId] }),
			});
			expect(resp.status).toBe(200);

			// children is computed from parent_id relationships, not stored directly
			// so the returned children array will be empty since no message has parent_id = msg.id
			const body = await resp.json();
			expect(body).toHaveProperty('children');
		});

		it('returns 404 for non-existent message', async () => {
			const resp = await server.fetch('/api/messages/non-existent', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'whatever' }),
			});
			expect(resp.status).toBe(404);
		});
	});

	describe('DELETE /api/messages/:id', () => {
		it('deletes a message', async () => {
			const conv = await createConversation('Delete Message');

			const msgResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'Delete me' }),
			});
			const msg = await msgResp.json();

			const resp = await server.fetch(`/api/messages/${msg.id}`, {
				method: 'DELETE',
			});
			expect(resp.status).toBe(204);

			// Verify it's gone
			const getResp = await server.fetch(`/api/messages/${msg.id}`);
			expect(getResp.status).toBe(404);
		});

		it('reparents children to newParentId', async () => {
			const conv = await createConversation('Reparent Test');

			// Create a chain: A -> B -> C
			const aResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'A' }),
			});
			const a = await aResp.json();

			const bResp = await server.fetch(
				`/api/conversations/${conv.id}/messages?parentId=${a.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'assistant', content: 'B' }),
				},
			);
			const b = await bResp.json();

			const cResp = await server.fetch(
				`/api/conversations/${conv.id}/messages?parentId=${b.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'user', content: 'C' }),
				},
			);
			const c = await cResp.json();

			// Delete B, reparent C to A
			const resp = await server.fetch(`/api/messages/${b.id}?newParentId=${a.id}`, {
				method: 'DELETE',
			});
			expect(resp.status).toBe(204);

			// C should now be child of A
			const aResp2 = await server.fetch(`/api/messages/${a.id}`);
			const aUpdated = await aResp2.json();
			expect(aUpdated.children).toContain(c.id);
			expect(aUpdated.children).not.toContain(b.id);
		});

		it('returns 404 for non-existent message', async () => {
			const resp = await server.fetch('/api/messages/non-existent', {
				method: 'DELETE',
			});
			expect(resp.status).toBe(404);
		});
	});

	describe('POST /api/messages/:id/delete-cascading', () => {
		it('deletes a message and all its descendants', async () => {
			const conv = await createConversation('Cascade Delete');

			// Create a tree: A -> B -> D
			//                 -> C
			const aResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'A' }),
			});
			const a = await aResp.json();

			const bResp = await server.fetch(
				`/api/conversations/${conv.id}/messages?parentId=${a.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'assistant', content: 'B' }),
				},
			);
			const b = await bResp.json();

			const cResp = await server.fetch(
				`/api/conversations/${conv.id}/messages?parentId=${a.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'assistant', content: 'C' }),
				},
			);
			const c = await cResp.json();

			const dResp = await server.fetch(
				`/api/conversations/${conv.id}/messages?parentId=${b.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'user', content: 'D' }),
				},
			);
			const d = await dResp.json();

			// Cascade delete B (should delete B and D)
			const resp = await server.fetch(`/api/messages/${b.id}/delete-cascading`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ conversationId: conv.id }),
			});
			expect(resp.status).toBe(200);

			const deleted = await resp.json();
			expect(Array.isArray(deleted)).toBe(true);
			expect(deleted).toContain(b.id);
			expect(deleted).toContain(d.id);

			// A and C should still exist
			const aCheck = await server.fetch(`/api/messages/${a.id}`);
			expect(aCheck.status).toBe(200);

			const cCheck = await server.fetch(`/api/messages/${c.id}`);
			expect(cCheck.status).toBe(200);
		});

		it('returns 400 when conversationId is missing', async () => {
			const conv = await createConversation('Cascade Missing');
			const msgResp = await server.fetch(`/api/conversations/${conv.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: 'test' }),
			});
			const msg = await msgResp.json();

			const resp = await server.fetch(`/api/messages/${msg.id}/delete-cascading`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});
			expect(resp.status).toBe(400);
		});

		it('returns 404 for non-existent message', async () => {
			const conv = await createConversation('Cascade 404');
			const resp = await server.fetch(`/api/messages/non-existent/delete-cascading`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ conversationId: conv.id }),
			});
			expect(resp.status).toBe(404);
		});
	});
});
