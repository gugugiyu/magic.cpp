import { loadConfig, type Config } from './config.ts';
import { ModelPool } from './pool/model-pool.ts';
import { Heartbeat } from './pool/heartbeat.ts';
import { createRouter } from './router.ts';
import { applyCorsHeaders, corsHeaders } from './utils/cors.ts';
import { initializeDatabase, closeDatabase } from './database/index.ts';
import { dirname, resolve as resolvePath } from 'path';
import { mkdir } from 'node:fs/promises';
import { watchConfig } from './config-watcher.ts';

// Resolve config path explicitly
const configPath = resolvePath(__dirname, '..', 'config.json');

// Load configuration with graceful error handling
let config: Config;
try {
	config = loadConfig(configPath);
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

// Ensure filesystem sandbox directory exists
try {
	await mkdir(config.resolvedFilesystemRootPath, { recursive: true });
	console.log(`[filesystem] sandbox ready at ${config.resolvedFilesystemRootPath}`);
} catch (err) {
	console.warn(`[filesystem] could not create sandbox directory: ${(err as Error).message}`);
}

// Core components (mutable so we can update them on config reload)
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

// Mutable router so we can recreate it when config changes
let router = createRouter(pool, config);

const server = Bun.serve({
	port: config.port,

	async fetch(req) {
		const origin = req.headers.get('origin');

		if (req.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders(config.cors),
			});
		}

		const res = await router(req);

		const newHeaders = new Headers(res.headers);
		applyCorsHeaders(newHeaders, origin, config.cors);

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

// --- Hot Reload Watcher ---
let stopWatcher: (() => void) | null = null;

try {
	stopWatcher = watchConfig(configPath, (newConfig) => {
		console.log('[config] reloading configuration...');

		// Check for settings that require restart
		let needsRestart = false;
		if (newConfig.port !== config.port) {
			console.warn(`[config] port changed from ${config.port} to ${newConfig.port} — requires server restart`);
			needsRestart = true;
		}
		if (newConfig.staticDir !== config.staticDir) {
			console.warn(`[config] staticDir changed from "${config.staticDir}" to "${newConfig.staticDir}" — requires server restart`);
			needsRestart = true;
		}
		if (newConfig.database?.path !== config.database?.path) {
			console.warn(`[config] database.path changed from "${config.database?.path}" to "${newConfig.database?.path}" — requires server restart`);
			needsRestart = true;
		}

		if (needsRestart) {
			console.error('[config] Some settings cannot be hot-reloaded. Please restart the server manually.');
			// Still apply other changes (upstreams, CORS, etc.) but alert user
		}

		// Apply new configuration
		pool.applyConfig(newConfig);
		heartbeat.updateConfig(newConfig);
		router = createRouter(pool, newConfig);
		config = newConfig;

		console.log('[config] reload complete');
	});

	console.log(`[config-watcher] watching ${configPath} for changes`);
} catch (err) {
	console.error('[config-watcher] failed to start watcher:', (err as Error).message);
}

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
	process.on(sig, () => {
		console.log(`\n[server] ${sig} received, shutting down`);
		heartbeat.stop();
		closeDatabase();
		if (stopWatcher) {
			stopWatcher();
		}
		server.stop();
		process.exit(0);
	});
}
