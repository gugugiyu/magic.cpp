/**
 * E2E tests for chat completions and CORS proxy endpoints.
 * These test the full HTTP stack with real HTTP servers and mock upstreams.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createE2ETestServer, type E2ETestServer } from '../helpers/e2e-server.ts';

describe('E2E: Chat Completions', () => {
	let server: E2ETestServer;

	beforeAll(async () => {
		server = await createE2ETestServer();
	});

	afterAll(async () => {
		await server.stop();
	});

	describe('POST /v1/chat/completions (non-streaming)', () => {
		it('returns a chat completion for a known model', async () => {
			const resp = await server.fetch('/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'llama-test-model',
					messages: [{ role: 'user', content: 'Hello' }],
				}),
			});
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body).toHaveProperty('id');
			expect(body).toHaveProperty('object', 'chat.completion');
			expect(body).toHaveProperty('model');
			expect(body.choices).toBeDefined();
			expect(Array.isArray(body.choices)).toBe(true);
			expect(body.choices[0]).toHaveProperty('message');
			expect(body.choices[0].message).toHaveProperty('role', 'assistant');
			expect(body.choices[0].message).toHaveProperty('content');
		});

		it('returns usage information', async () => {
			const resp = await server.fetch('/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gpt-test-model',
					messages: [{ role: 'user', content: 'Hi' }],
				}),
			});
			const body = await resp.json();
			expect(body).toHaveProperty('usage');
			expect(body.usage).toHaveProperty('prompt_tokens');
			expect(body.usage).toHaveProperty('completion_tokens');
			expect(body.usage).toHaveProperty('total_tokens');
		});

		it('returns 404 for unknown model', async () => {
			const resp = await server.fetch('/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'nonexistent-model',
					messages: [{ role: 'user', content: 'Hello' }],
				}),
			});
			expect(resp.status).toBe(404);
		});

		it('uses fallback upstream when no model specified', async () => {
			const resp = await server.fetch('/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: [{ role: 'user', content: 'No model' }],
				}),
			});
			// Should succeed using fallback upstream
			expect(resp.status).toBe(200);
		});
	});

	describe('POST /v1/chat/completions (streaming)', () => {
		it('returns an SSE stream', async () => {
			const resp = await server.fetch('/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'llama-test-model',
					messages: [{ role: 'user', content: 'Stream test' }],
					stream: true,
				}),
			});
			expect(resp.status).toBe(200);
			expect(resp.headers.get('content-type')).toContain('text/event-stream');

			// Read the stream
			const body = await resp.text();
			expect(body).toContain('data: ');
			expect(body).toContain('[DONE]');
		});

		it('streams content word by word', async () => {
			const resp = await server.fetch('/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gpt-test-model',
					messages: [{ role: 'user', content: 'Hello world' }],
					stream: true,
				}),
			});

			const body = await resp.text();
			// Should have multiple data chunks
			const chunks = body.split('\n').filter((line: string) => line.startsWith('data:'));
			expect(chunks.length).toBeGreaterThan(1);
			// Last chunk should be [DONE]
			expect(chunks[chunks.length - 1]).toContain('[DONE]');
		});
	});

	describe('POST /compact', () => {
		it('proxies compact request to upstream', async () => {
			// The compact endpoint proxies to upstream; mock returns standard response
			const resp = await server.fetch('/compact', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'llama-test-model',
					messages: [
						{ role: 'user', content: 'Long conversation' },
						{ role: 'assistant', content: 'Very long response' },
					],
				}),
			});
			// Should get proxied to mock upstream (200 or appropriate response)
			expect(resp.status).toBeGreaterThanOrEqual(200);
			expect(resp.status).toBeLessThan(500);
		});
	});
});

describe('E2E: CORS Proxy', () => {
	let server: E2ETestServer;

	beforeAll(async () => {
		server = await createE2ETestServer();
	});

	afterAll(async () => {
		await server.stop();
	});

	describe('HEAD /cors-proxy (probe)', () => {
		it('responds to probe without url parameter', async () => {
			const resp = await server.fetch('/cors-proxy', { method: 'HEAD' });
			expect(resp.status).toBe(200);
		});
	});

	describe('GET /cors-proxy?url=<target>', () => {
		it('proxies a GET request to an external URL', async () => {
			// Use a public URL that's reliably available
			const targetUrl = 'https://httpbin.org/get';
			const resp = await server.fetch(`/cors-proxy?url=${encodeURIComponent(targetUrl)}`);
			expect(resp.status).toBe(200);

			const body = await resp.json();
			expect(body).toHaveProperty('url');
		});

		it('returns 400 when url parameter is missing', async () => {
			const resp = await server.fetch('/cors-proxy');
			expect(resp.status).toBe(400);
		});

		it('returns 400 for invalid URL', async () => {
			const resp = await server.fetch('/cors-proxy?url=not-a-valid-url!!!');
			expect(resp.status).toBe(400);
		});

		it('returns 403 for localhost targets (SSRF protection)', async () => {
			const resp = await server.fetch('/cors-proxy?url=http://localhost:8080/secret');
			expect(resp.status).toBe(403);
		});

		it('returns 403 for 127.0.0.1 targets', async () => {
			const resp = await server.fetch('/cors-proxy?url=http://127.0.0.1:3000/admin');
			expect(resp.status).toBe(403);
		});

		it('blocks 0.0.0.0 targets', async () => {
			const resp = await server.fetch('/cors-proxy?url=http://0.0.0.0:9000/test');
			expect(resp.status).toBe(403);
		});

		it('adds CORS headers to response', async () => {
			const targetUrl = 'https://httpbin.org/get';
			const resp = await server.fetch(`/cors-proxy?url=${encodeURIComponent(targetUrl)}`);
			expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});

	describe('OPTIONS preflight', () => {
		it('responds to CORS preflight requests', async () => {
			const resp = await server.fetch('/api/conversations', { method: 'OPTIONS' });
			expect(resp.status).toBe(204);
			expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*');
			expect(resp.headers.get('Access-Control-Allow-Methods')).toContain('GET');
		});
	});
});
