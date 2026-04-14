/**
 * E2E tests for health, props, and model endpoints.
 * These test the full HTTP stack with real HTTP servers and mock upstreams.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createE2ETestServer, type E2ETestServer } from '../helpers/e2e-server.ts';

describe('E2E: Health, Props, Models', () => {
	let server: E2ETestServer;

	beforeAll(async () => {
		server = await createE2ETestServer();
	});

	afterAll(async () => {
		await server.stop();
	});

	describe('GET /health', () => {
		it('returns health summary with upstream statuses', async () => {
			const resp = await server.fetch('/health');
			expect(resp.status).toBe(200);
			expect(resp.headers.get('content-type')).toContain('application/json');

			const body = await resp.json();
			expect(body).toHaveProperty('status');
			expect(body).toHaveProperty('upstreams');
			expect(Array.isArray(body.upstreams)).toBe(true);
			// Should have 2 mock upstreams
			expect(body.upstreams.length).toBe(2);
		});

		it('shows mock upstreams as healthy', async () => {
			const resp = await server.fetch('/health');
			const body = await resp.json();
			for (const upstream of body.upstreams) {
				expect(upstream.health).toBe('healthy');
			}
		});
	});

	describe('GET /props', () => {
		it('returns server properties', async () => {
			const resp = await server.fetch('/props');
			expect(resp.status).toBe(200);

			const body = await resp.json();
			// Mock upstream returns context, architecture, chat_template
			expect(body).toHaveProperty('context');
			expect(body).toHaveProperty('architecture');
			expect(body).toHaveProperty('chat_template');
		});

		it('falls back to synthetic props when upstream returns error', async () => {
			// Create a server with a failing upstream
			const failingServer = await createE2ETestServer({
				upstreams: [{
					port: 19099,
					models: [],
					chatResponse: { content: 'ok' },
					chatError: { status: 503, body: { error: 'service unavailable' } },
				}],
			});

			try {
				const resp = await failingServer.fetch('/props');
				// /props falls back to synthetic props on upstream error
				expect(resp.status).toBe(200);
				const body = await resp.json();
				expect(body).toHaveProperty('role', 'model');
				expect(body).toHaveProperty('build_info', 'openai-compat');
			} finally {
				await failingServer.stop();
			}
		});
	});

	describe('GET /v1/models', () => {
		it('returns merged model list from all upstreams', async () => {
			const resp = await server.fetch('/v1/models');
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body).toHaveProperty('object', 'list');
			expect(body).toHaveProperty('data');
			expect(Array.isArray(body.data)).toBe(true);
			// Should have models from both mock upstreams
			expect(body.data.length).toBe(2);
		});

		it('each model has required fields', async () => {
			const resp = await server.fetch('/v1/models');
			const body = await resp.json();

			for (const model of body.data) {
				expect(model).toHaveProperty('id');
				expect(model).toHaveProperty('object');
				expect(model).toHaveProperty('owned_by');
			}
		});
	});

	describe('GET /models', () => {
		it('proxies to llamacpp upstream for model list', async () => {
			const resp = await server.fetch('/models');
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body).toHaveProperty('object', 'list');
			expect(body).toHaveProperty('data');
			expect(Array.isArray(body.data)).toBe(true);
		});
	});

	describe('POST /models/load', () => {
		it('loads a model on llamacpp upstream', async () => {
			const resp = await server.fetch('/models/load', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'test-model.gguf' }),
			});
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body).toHaveProperty('success', true);
		});
	});

	describe('POST /models/unload', () => {
		it('unloads a model on llamacpp upstream', async () => {
			const resp = await server.fetch('/models/unload', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'llama-test-model' }),
			});
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body).toHaveProperty('success', true);
		});
	});
});
