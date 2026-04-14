/**
 * E2E tests for skill CRUD endpoints.
 * These test the full HTTP stack with real HTTP servers and mock upstreams.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createE2ETestServer, type E2ETestServer } from '../helpers/e2e-server.ts';

describe('E2E: Skills CRUD', () => {
	let server: E2ETestServer;
	// Unique prefix to avoid conflicts between test runs
	const prefix = `e2e-${Date.now()}`;

	beforeAll(async () => {
		server = await createE2ETestServer();
	});

	afterAll(async () => {
		await server.stop();
	});

	describe('GET /api/skills', () => {
		it('lists all skills', async () => {
			const resp = await server.fetch('/api/skills');
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(Array.isArray(body)).toBe(true);
		});
	});

	describe('POST /api/skills', () => {
		it('creates a new skill', async () => {
			const resp = await server.fetch('/api/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: `${prefix}-test-skill`,
					content: '# Test Skill\nThis is a test skill.',
				}),
			});
			expect(resp.status).toBe(201);

			const body = await resp.json();
			expect(body).toHaveProperty('name');
			expect(body).toHaveProperty('content');
			expect(body.name).toContain('test-skill');
		});

		it('returns 400 when name is missing', async () => {
			const resp = await server.fetch('/api/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'some content' }),
			});
			expect(resp.status).toBe(400);

			const body = await resp.json();
			expect(body.error).toContain('name');
		});

		it('returns 400 when content is missing', async () => {
			const resp = await server.fetch('/api/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: `${prefix}-no-content-skill` }),
			});
			expect(resp.status).toBe(400);

			const body = await resp.json();
			expect(body.error).toContain('content');
		});

		it('returns 409 when skill already exists', async () => {
			// Create skill first
			await server.fetch('/api/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: `${prefix}-duplicate-skill`, content: 'version 1' }),
			});

			// Try to create again
			const resp = await server.fetch('/api/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: `${prefix}-duplicate-skill`, content: 'version 2' }),
			});
			expect(resp.status).toBe(409);
		});
	});

	describe('GET /api/skills/:name', () => {
		it('reads a single skill', async () => {
			// Create skill first
			await server.fetch('/api/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: `${prefix}-readable-skill`, content: '# Readable\nContent here' }),
			});

			const resp = await server.fetch(`/api/skills/${prefix}-readable-skill`);
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body.name).toContain('readable-skill');
			expect(body.content).toBe('# Readable\nContent here');
		});

		it('returns 404 for non-existent skill', async () => {
			const resp = await server.fetch(`/api/skills/${prefix}-non-existent-skill`);
			expect(resp.status).toBe(404);

			const body = await resp.json();
			expect(body.error).toBe('Not found');
		});
	});

	describe('PUT /api/skills/:name', () => {
		it('updates a skill content', async () => {
			// Create skill first
			await server.fetch('/api/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: `${prefix}-updatable-skill`, content: 'old content' }),
			});

			const resp = await server.fetch(`/api/skills/${prefix}-updatable-skill`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'new content' }),
			});
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body.content).toBe('new content');
		});

		it('returns 400 when content is missing', async () => {
			await server.fetch('/api/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: `${prefix}-bad-update`, content: 'initial' }),
			});

			const resp = await server.fetch(`/api/skills/${prefix}-bad-update`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});
			expect(resp.status).toBe(400);
		});

		it('returns 404 for non-existent skill', async () => {
			const resp = await server.fetch(`/api/skills/${prefix}-ghost-skill`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'update' }),
			});
			expect(resp.status).toBe(404);
		});
	});

	describe('DELETE /api/skills/:name', () => {
		it('deletes a skill', async () => {
			// Create skill first
			await server.fetch('/api/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: `${prefix}-deletable-skill`, content: 'to be deleted' }),
			});

			const resp = await server.fetch(`/api/skills/${prefix}-deletable-skill`, {
				method: 'DELETE',
			});
			expect(resp.status).toBe(204);

			// Verify it's gone
			const getResp = await server.fetch(`/api/skills/${prefix}-deletable-skill`);
			expect(getResp.status).toBe(404);
		});

		it('returns 404 for non-existent skill', async () => {
			const resp = await server.fetch(`/api/skills/${prefix}-nothing-here`, {
				method: 'DELETE',
			});
			expect(resp.status).toBe(404);
		});
	});
});
