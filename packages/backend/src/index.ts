import { loadConfig } from './config.ts';
import { ModelPool } from './pool/model-pool.ts';
import { Heartbeat } from './pool/heartbeat.ts';
import { createRouter } from './router.ts';

const config = loadConfig();
const pool = new ModelPool(config);
const heartbeat = new Heartbeat(pool, config);

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
	fetch: router,
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
		server.stop();
		process.exit(0);
	});
}
