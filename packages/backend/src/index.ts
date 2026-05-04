import { loadConfig, type Config } from './config.ts';
import { ModelPool } from './pool/model-pool.ts';
import { Heartbeat } from './pool/heartbeat.ts';
import { createRouter } from './router.ts';
import { applyCorsHeaders, corsHeaders } from './utils/cors.ts';
import { initializeDatabase, closeDatabase } from './database/index.ts';
import { dirname, resolve as resolvePath } from 'path';
import { mkdir } from 'node:fs/promises';
import { watchConfig } from './config-watcher.ts';
import { createLogger, configureLogger, box } from './utils/logger.ts';

const log = createLogger('server');
const startupLog = createLogger('startup');
const configLog = createLogger('config');
const configWatcherLog = createLogger('config-watcher');
const filesystemLog = createLogger('filesystem');

// Resolve config path explicitly
const configPath = resolvePath(__dirname, '..', '..', '..', 'config', 'config.toml');

// Load configuration with graceful error handling
let config: Config;
try {
	config = loadConfig(configPath);
} catch (err) {
	box(
		'CONFIGURATION ERROR',
		[
			(err as Error).message,
			'',
			'Make sure config.toml exists and is valid.',
			'Copy config.example.toml to config.toml and customize it:',
			'',
			'  cp config/config.example.toml config/config.toml',
			'',
			'If using .env variables for API keys, copy .env.example:',
			'',
			'  cp config/.env.example config/.env',
		],
	);
	process.exit(1);
}

// Configure logger from loaded config
configureLogger({ level: config.logLevel });

// Initialize SQLite database
let db: ReturnType<typeof initializeDatabase>;
try {
	db = initializeDatabase(config);
} catch (err) {
	box(
		'DATABASE INITIALIZATION ERROR',
		[
			(err as Error).message,
			'',
			`Database path: ${config.resolvedDatabasePath}`,
			'',
			'Check that the directory is writable or create it:',
			'',
			`  mkdir -p ${dirname(config.resolvedDatabasePath)}`,
		],
	);
	process.exit(1);
}

// Ensure filesystem sandbox directory exists
try {
	await mkdir(config.resolvedFilesystemRootPath, { recursive: true });
	filesystemLog.debug(`sandbox ready at ${config.resolvedFilesystemRootPath}`);
} catch (err) {
	filesystemLog.warn(`could not create sandbox directory: ${(err as Error).message}`);
}

// Ensure skills directory exists
try {
	await mkdir(config.resolvedSkillsFolder, { recursive: true });
	filesystemLog.debug(`skills directory ready at ${config.resolvedSkillsFolder}`);
} catch (err) {
	filesystemLog.warn(`could not create skills directory: ${(err as Error).message}`);
}

// Core components (mutable so we can update them on config reload)
const pool = new ModelPool(config);
const heartbeat = new Heartbeat(pool, config);
if (config.debug) {
	log.warn('DEBUG MODE ON, DO NOT USE IN PRODUCTION');
}

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
		log.error('unhandled error:', err);
		return new Response('Internal Server Error', { status: 500 });
	},
});

log.debug(`listening on http://localhost:${server.port}`);

// Start background services
heartbeat.start();

// Initial model list fetch in the background so the server begins serving
// static assets immediately. The frontend has its own splash screen for
// upstream-unavailable states.
	startupLog.debug('fetching initial model list...');
pool.refresh()
	.then(() => {
		startupLog.info(`${pool.getMergedModels().length} model(s) discovered`);
	})
	.catch((err) => {
		startupLog.warn('initial model fetch failed (upstreams may be offline):', err);
	});

// --- Hot Reload Watcher ---
let stopWatcher: (() => void) | null = null;

try {
	stopWatcher = watchConfig(configPath, (newConfig) => {
		configLog.info('reloading configuration...');

		// Check for settings that require restart
		let needsRestart = false;
		if (newConfig.port !== config.port) {
			configLog.warn(`port changed from ${config.port} to ${newConfig.port} — requires server restart`);
			needsRestart = true;
		}
		if (newConfig.staticDir !== config.staticDir) {
			configLog.warn(`staticDir changed from "${config.staticDir}" to "${newConfig.staticDir}" — requires server restart`);
			needsRestart = true;
		}
		if (newConfig.database?.path !== config.database?.path) {
			configLog.warn(`database.path changed from "${config.database?.path}" to "${newConfig.database?.path}" — requires server restart`);
			needsRestart = true;
		}

		if (needsRestart) {
			configLog.error('Some settings cannot be hot-reloaded. Please restart the server manually.');
			// Still apply other changes (upstreams, CORS, etc.) but alert user
		}

		// Apply new configuration
		pool.applyConfig(newConfig);
		heartbeat.updateConfig(newConfig);
		router = createRouter(pool, newConfig);
		config = newConfig;

		configLog.info('reload complete');
	});

	configWatcherLog.debug(`watching ${configPath} for changes`);
} catch (err) {
	configWatcherLog.error('failed to start watcher:', (err as Error).message);
}

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
	process.on(sig, () => {
		log.debug(`${sig} received, shutting down`);
		heartbeat.stop();
		closeDatabase();
		if (stopWatcher) {
			stopWatcher();
		}
		server.stop();
		process.exit(0);
	});
}
