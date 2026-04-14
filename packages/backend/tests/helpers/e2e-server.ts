/**
 * E2E test server helper.
 * Spins up an actual HTTP server with mock upstreams on real ports.
 * Used for end-to-end tests that test the full HTTP stack.
 */

import { ModelPool } from '../../src/pool/model-pool.ts';
import { createRouter } from '../../src/router.ts';
import { applyCorsHeaders, corsHeaders } from '../../src/utils/cors.ts';
import { initializeDatabase, closeDatabase, getDatabase, setDatabase, resetDatabase } from '../../src/database/index.ts';
import { createTestEnv, type TestEnv } from './test-env.ts';
import { createMockUpstreamServer, type MockUpstreamOptions } from './mock-upstream.ts';
import type { Config, UpstreamConfig } from '../../src/config.ts';
import type { Server } from 'bun';
import { rmSync } from 'fs';

export interface E2ETestServer {
	server: Server;
	port: number;
	url: string;
	env: TestEnv;
	upstreams: Array<{ server: ReturnType<typeof createMockUpstreamServer>; opts: MockUpstreamOptions }>;
	stop: () => Promise<void>;
	fetch: (path: string, init?: RequestInit) => Promise<Response>;
	getDb: () => ReturnType<typeof getDatabase>;
}

export interface E2ETestServerOptions {
	/** Optional explicit port (defaults to 0 for auto-assign) */
	port?: number;
	/** Mock upstream configurations */
	upstreams?: MockUpstreamOptions[];
	/** Additional config overrides */
	configOverrides?: Partial<Config>;
}

/**
 * Create a full E2E test server with mock upstreams.
 * 
 * This:
 * 1. Creates mock upstream servers on specified ports
 * 2. Creates an in-memory SQLite database with schema
 * 3. Creates a real HTTP server via Bun.serve
 * 4. Returns a client `fetch` function and the database handle
 */
export async function createE2ETestServer(opts?: E2ETestServerOptions): Promise<E2ETestServer> {
	// 1. Create mock upstreams
	const upstreamDefaults: MockUpstreamOptions[] = [
		{
			port: 19001,
			models: [
				{ id: 'llama-test-model', object: 'model', owned_by: 'llamacpp', created: 1234567890 },
			],
			chatResponse: { content: 'Hello from mock llamacpp upstream!' },
		},
		{
			port: 19002,
			models: [
				{ id: 'gpt-test-model', object: 'model', owned_by: 'openai', created: 1234567891 },
			],
			chatResponse: { content: 'Hello from mock openai upstream!' },
		},
	];

	const upstreamConfigs = opts?.upstreams ?? upstreamDefaults;
	const upstreams: Array<{ server: ReturnType<typeof createMockUpstreamServer>; opts: MockUpstreamOptions }> = [];
	const upstreamEntries: UpstreamConfig[] = [];

	for (const upstreamOpts of upstreamConfigs) {
		const mockServer = createMockUpstreamServer(upstreamOpts);
		upstreams.push({ server: mockServer, opts: upstreamOpts });

		const type = upstreamOpts.port === upstreamDefaults[0]?.port ? 'llamacpp' : 'openai';
		upstreamEntries.push({
			id: `test-upstream-${upstreamOpts.port}`,
			label: `Test Upstream ${upstreamOpts.port}`,
			url: mockServer.url,
			type,
			apiKey: 'test-key',
			enabled: true,
			modelList: [],
			resolvedApiKey: 'test-key',
		});
	}

	// 2. Create test environment (in-memory DB + temp skill dir)
	const env = createTestEnv(upstreamEntries);

	// Register the test DB with the global singleton so getDatabase() works
	setDatabase(env.db);
	const config: Config = {
		...env.config,
		port: opts?.port ?? 0,
		...(opts?.configOverrides ?? {}),
	};

	// 3. Create pool, heartbeat, and router
	const pool = new ModelPool(config);

	// Refresh pool to fetch from mock upstreams
	await pool.refresh();

	// Manually mark upstreams as healthy since heartbeat isn't running
	for (const upstream of pool.getAllUpstreams()) {
		upstream.health = 'healthy';
	}

	const router = createRouter(pool, config);

	// 4. Start HTTP server on an available port
	const server = Bun.serve({
		port: config.port,
		async fetch(req) {
			if (req.method === 'OPTIONS') {
				return new Response(null, {
					status: 204,
					headers: corsHeaders(config),
				});
			}

			const res = await router(req);
			const newHeaders = new Headers(res.headers);
			applyCorsHeaders(newHeaders);

			return new Response(res.body, {
				status: res.status,
				statusText: res.statusText,
				headers: newHeaders,
			});
		},
		error(err) {
			console.error('[e2e-server] unhandled error:', err);
			return new Response('Internal Server Error', { status: 500 });
		},
	});

	return {
		server,
		port: server.port,
		url: `http://localhost:${server.port}`,
		env,
		upstreams,
		stop: async () => {
			server.stop();
			for (const u of upstreams) {
				u.server.stop();
			}
			// Don't close the DB or clean up the skill dir here,
			// since the DB is registered with the global singleton
			// and may be used by other test files.
			// Just reset the singleton so next test file gets a clean state.
			resetDatabase();
			// Clean up skill dir
			try { rmSync(env.skillDir, { recursive: true, force: true }); } catch { /* ignore */ }
		},
		fetch: (path: string, init?: RequestInit) => {
			return fetch(`${server.url}${path}`, init);
		},
		getDb: () => getDatabase(),
	};
}
