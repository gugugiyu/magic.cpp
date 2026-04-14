/**
 * Integration tests: MCPService static methods
 *
 * Covers:
 *  - isSessionExpiredError: correctly identifies 404 StreamableHTTPError
 *  - createTransport: error cases (missing url, WebSocket+proxy)
 *  - createTransport: transport type selection (WebSocket, StreamableHTTP, SSE)
 */

import { describe, it, expect, vi } from 'vitest';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPTransportType } from '$lib/enums';

vi.mock('$lib/utils', () => ({
	buildProxiedUrl: (url: string) => new URL(`http://localhost:8080/cors-proxy?url=${url}`),
	buildProxiedHeaders: (headers: Record<string, string>) => ({
		'x-cors-headers': JSON.stringify(headers)
	}),
	throwIfAborted: vi.fn(),
	isAbortError: vi.fn(),
	createBase64DataUrl: vi.fn()
}));

vi.mock('$lib/constants', () => ({
	DEFAULT_MCP_CONFIG: {},
	DEFAULT_CLIENT_VERSION: '1.0.0',
	DEFAULT_IMAGE_MIME_TYPE: 'image/png'
}));

const { MCPService } = await import('$lib/services/mcp.service');

// ─────────────────────────────────────────────────────────────────────────────
// isSessionExpiredError
// ─────────────────────────────────────────────────────────────────────────────

describe('MCPService.isSessionExpiredError', () => {
	it('returns true for StreamableHTTPError with code 404', () => {
		const err = new StreamableHTTPError(404, 'Not Found');
		expect(MCPService.isSessionExpiredError(err)).toBe(true);
	});

	it('returns false for StreamableHTTPError with code 500', () => {
		const err = new StreamableHTTPError(500, 'Internal Server Error');
		expect(MCPService.isSessionExpiredError(err)).toBe(false);
	});

	it('returns false for StreamableHTTPError with code 401', () => {
		const err = new StreamableHTTPError(401, 'Unauthorized');
		expect(MCPService.isSessionExpiredError(err)).toBe(false);
	});

	it('returns false for a plain Error', () => {
		const err = new Error('Something went wrong');
		expect(MCPService.isSessionExpiredError(err)).toBe(false);
	});

	it('returns false for null', () => {
		expect(MCPService.isSessionExpiredError(null)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(MCPService.isSessionExpiredError(undefined)).toBe(false);
	});

	it('returns false for a plain object with code 404', () => {
		const err = { code: 404, message: 'Not Found' };
		expect(MCPService.isSessionExpiredError(err)).toBe(false);
	});

	it('returns false for a string error', () => {
		expect(MCPService.isSessionExpiredError('session expired')).toBe(false);
	});

	it('returns false for StreamableHTTPError with undefined code', () => {
		const err = new StreamableHTTPError(undefined, 'Unknown');
		expect(MCPService.isSessionExpiredError(err)).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// createTransport — error cases
// ─────────────────────────────────────────────────────────────────────────────

describe('MCPService.createTransport error cases', () => {
	it('throws when url is missing', () => {
		expect(() =>
			MCPService.createTransport({ url: '', transport: MCPTransportType.STREAMABLE_HTTP })
		).toThrow('missing url');
	});

	it('throws when url is undefined (falsy)', () => {
		expect(() =>
			MCPService.createTransport({
				url: undefined as unknown as string,
				transport: MCPTransportType.STREAMABLE_HTTP
			})
		).toThrow('missing url');
	});

	it('throws when WebSocket transport is combined with useProxy', () => {
		expect(() =>
			MCPService.createTransport({
				url: 'ws://localhost:3000/mcp',
				transport: MCPTransportType.WEBSOCKET,
				useProxy: true
			})
		).toThrow('WebSocket transport is not supported when using CORS proxy');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// createTransport — transport type selection
// ─────────────────────────────────────────────────────────────────────────────

describe('MCPService.createTransport type selection', () => {
	it('creates a WebSocket transport when type is WEBSOCKET', () => {
		const result = MCPService.createTransport({
			url: 'ws://localhost:3000/mcp',
			transport: MCPTransportType.WEBSOCKET
		});

		expect(result.type).toBe(MCPTransportType.WEBSOCKET);
		expect(result.transport).toBeDefined();
	});

	it('creates a StreamableHTTP transport when type is STREAMABLE_HTTP', () => {
		const result = MCPService.createTransport({
			url: 'http://localhost:3000/mcp',
			transport: MCPTransportType.STREAMABLE_HTTP
		});

		expect(result.type).toBe(MCPTransportType.STREAMABLE_HTTP);
		expect(result.transport).toBeDefined();
	});

	it('returns the transport object (not null/undefined)', () => {
		const result = MCPService.createTransport({
			url: 'http://localhost:3000/mcp',
			transport: MCPTransportType.STREAMABLE_HTTP
		});

		expect(result.transport).not.toBeNull();
		expect(result.transport).not.toBeUndefined();
	});

	it('uses proxied URL when useProxy is true', () => {
		// Should not throw; proxy URL is built internally
		const result = MCPService.createTransport({
			url: 'http://external.server/mcp',
			transport: MCPTransportType.STREAMABLE_HTTP,
			useProxy: true
		});

		expect(result.type).toBe(MCPTransportType.STREAMABLE_HTTP);
		expect(result.transport).toBeDefined();
	});

	it('accepts custom headers without throwing', () => {
		const result = MCPService.createTransport({
			url: 'http://localhost:3000/mcp',
			transport: MCPTransportType.STREAMABLE_HTTP,
			headers: { Authorization: 'Bearer token123' }
		});

		expect(result.transport).toBeDefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// isSessionExpiredError — integration with error handling pattern
// ─────────────────────────────────────────────────────────────────────────────

describe('isSessionExpiredError in try/catch simulation', () => {
	it('correctly identifies 404 as session-expired in catch block', () => {
		const errors = [
			new StreamableHTTPError(404, 'Not Found'),
			new StreamableHTTPError(500, 'Server Error'),
			new Error('Network error'),
			new StreamableHTTPError(401, 'Unauthorized')
		];

		const sessionExpiredErrors = errors.filter((e) => MCPService.isSessionExpiredError(e));
		expect(sessionExpiredErrors).toHaveLength(1);
		expect((sessionExpiredErrors[0] as StreamableHTTPError).code).toBe(404);
	});

	it('does not classify 403 as session expired', () => {
		const err = new StreamableHTTPError(403, 'Forbidden');
		expect(MCPService.isSessionExpiredError(err)).toBe(false);
	});
});
