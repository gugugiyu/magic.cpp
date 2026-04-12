import { loadConfig } from './config.ts';
import { ModelPool } from './pool/model-pool.ts';
import { Heartbeat } from './pool/heartbeat.ts';
import { createRouter } from './router.ts';
import { applyCorsHeaders, corsHeaders } from './utils/cors.ts';
import { initializeDatabase, closeDatabase } from './database/index.ts';
import { dirname } from 'path';

// Load configuration with graceful error handling
let config: ReturnType<typeof loadConfig>;
try {
	config = loadConfig();
} catch (err) {
	console.error('');
	console.error('╔═══════════════════════════════════════════════════════════╗');
	console.error('║  CONFIGURATION ERROR                                      ║');
	console.error('╚═══════════════════════════════════════════════════════════╝');
	console.error('');
	console.error(`  ${(err as Error).message}`);
	console.error('');
	console.error('  Make sure config.json exists and is valid.');
	console.error('  Copy config.example.json to config.json and customize it:');
	console.error('');
	console.error('    cp config.example.json config.json');
	console.error('');
	console.error('  If using .env variables for API keys, copy .env.example:');
	console.error('');
	console.error('    cp .env.example .env');
	console.error('');
	process.exit(1);
}

// Initialize SQLite database
let db: ReturnType<typeof initializeDatabase>;
try {
	db = initializeDatabase(config);
} catch (err) {
	console.error('');
	console.error('╔═══════════════════════════════════════════════════════════╗');
	console.error('║  DATABASE INITIALIZATION ERROR                            ║');
	console.error('╚═══════════════════════════════════════════════════════════╝');
	console.error('');
	console.error(`  ${(err as Error).message}`);
	console.error('');
	console.error(`  Database path: ${config.resolvedDatabasePath}`);
	console.error('');
	console.error('  Check that the directory is writable or create it:');
	console.error('');
	console.error(`    mkdir -p ${dirname(config.resolvedDatabasePath)}`);
	console.error('');
	process.exit(1);
}

const pool = new ModelPool(config);
const heartbeat = new Heartbeat(pool, config);
if (config.debug) {
	console.log('[debug] DEBUG MODE ON, DO NOT USE IN PRODUCTION');
}

// Initial model list fetch before accepting requests
console.log('[startup] fetching initial model list...');
try {
	await pool.refresh();
	console.log(`[startup] ${pool.getMergedModels().length} model(s) discovered`);
} catch (err) {
	console.warn('[startup] initial model fetch failed (upstreams may be offline):', err);
}

heartbeat.start();

const router = createRouter(pool, config);

const server = Bun.serve({
	port: config.port,

	async fetch(req) {
		// Handle preflight requests
		if (req.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders(config),
			});
		}

		// Call your existing router
		const res = await router(req);

		// Clone response and append CORS headers
		const newHeaders = new Headers(res.headers);
		applyCorsHeaders(newHeaders);

		return new Response(res.body, {
			status: res.status,
			statusText: res.statusText,
			headers: newHeaders,
		});
	},

	error(err) {
		console.error('[server] unhandled error:', err);
		return new Response('Internal Server Error', { status: 500 });
	},
});

console.log(`[server] listening on http://localhost:${server.port}`);

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
	process.on(sig, () => {
		console.log(`\n[server] ${sig} received, shutting down`);
		heartbeat.stop();
		closeDatabase();
		server.stop();
		process.exit(0);
	});
}
