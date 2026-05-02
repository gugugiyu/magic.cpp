import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { LogLevel } from './utils/logger.ts';
import { createLogger } from './utils/logger.ts';

const log = createLogger('config');

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file from ./config/.env (relative to repo root)
const envPath = resolve(__dirname, '..', '..', '..', 'config', '.env');
try {
	const envContent = readFileSync(envPath, 'utf-8');
	for (const line of envContent.split('\n')) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith('#')) {
			const [key, ...valueParts] = trimmed.split('=');
			if (key && valueParts.length > 0) {
				process.env[key.trim()] = valueParts.join('=').trim();
			}
		}
	}
	log.debug(`loaded .env from ${envPath}`);
} catch (err) {
	// Silently ignore if .env doesn't exist - it's optional
	if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
		log.warn(`failed to load .env: ${(err as Error).message}`);
	}
}

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info');

const StreamingConfigSchema = z.object({
	enabled: z.boolean().default(true),
	bufferWords: z.number().int().nonnegative().default(0)
});

const CorsConfigSchema = z.object({
	allowedOrigins: z.array(z.string()).default([]),
	allowCredentials: z.boolean().default(true),
	maxAge: z.number().int().nonnegative().default(86400),
}).default(() => ({ allowedOrigins: [], allowCredentials: true, maxAge: 86400 }));

const DatabaseConfigSchema = z.object({
	path: z.string().default('data/chat.db'),
	skillsFolder: z.string().default('data/skills'),
	migrationsFolder: z.string().default('packages/database/migrations/drizzle'),
	seedsFolder: z.string().default('packages/database/seeds')
}).default(() => ({
	path: 'data/chat.db',
	skillsFolder: 'data/skills',
	migrationsFolder: 'packages/database/migrations/drizzle',
	seedsFolder: 'packages/database/seeds'
}));

const UpstreamSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	url: z.string().url(),
	type: z.enum(['llamacpp', 'openai']),
	apiKey: z.string().nullable().default(null),
	enabled: z.boolean().default(true),	
	modelList: z.array(z.string()).default([])
});

const FilesystemConfigSchema = z.object({
	rootPath: z.string().default('data/sandbox')
}).default(() => ({ rootPath: 'data/sandbox' }));

export type FilesystemConfig = z.infer<typeof FilesystemConfigSchema>;

const CommandsConfigSchema = z.object({
	allowedList: z.array(z.string()).default([]),
	shellEnabled: z.boolean().default(false),
	adminKey: z.string().nullable().default(null)
}).default(() => ({ allowedList: [], shellEnabled: false, adminKey: null }));

export type CommandsConfig = z.infer<typeof CommandsConfigSchema>;

const ConfigFileSchema = z.object({
	port: z.number().int().positive().default(3000),
	staticDir: z.string().default('packages/public'),
	heartbeatInterval: z.number().int().positive().default(30),
	upstreams: z.array(UpstreamSchema).min(1),
	enabled: z.boolean().default(true),
	modelList: z.array(z.string()).default([]),
	debug: z.boolean().default(false),
	logLevel: LogLevelSchema,
	streaming: StreamingConfigSchema.default({ enabled: true, bufferWords: 0 }),
	database: DatabaseConfigSchema,
	cors: CorsConfigSchema,
	filesystem: FilesystemConfigSchema,
	commands: CommandsConfigSchema,
});

export type UpstreamConfig = z.infer<typeof UpstreamSchema> & {
	/** Resolved API key (env placeholder already substituted) */
	resolvedApiKey: string | null;
};

export type StreamingConfig = z.infer<typeof StreamingConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type CorsConfig = z.infer<typeof CorsConfigSchema>;

export type Config = Omit<z.infer<typeof ConfigFileSchema>, 'upstreams'> & {
	upstreams: UpstreamConfig[];
	/** Absolute path to the static files directory */
	resolvedStaticDir: string;
	/** Absolute path to the SQLite database file */
	resolvedDatabasePath: string;
	/** Absolute path to the migrations folder */
	resolvedMigrationsFolder: string;
	/** Absolute path to the seeds folder */
	resolvedSeedsFolder: string;
	/** Absolute path to the skills folder */
	resolvedSkillsFolder: string;
	/** Absolute path to the filesystem sandbox root */
	resolvedFilesystemRootPath: string;
	streaming: StreamingConfig;
	cors: CorsConfig;
	commands: CommandsConfig;
	logLevel: LogLevel;
};

function resolveEnvPlaceholder(value: string | null): string | null {
	if (!value) return null;
	if (value.startsWith('$')) {
		const envVar = value.slice(1);
		const resolved = process.env[envVar];
		if (!resolved) {
			log.warn(`env var ${envVar} is not set — upstream will have no API key`);
			return null;
		}
		return resolved;
	}
	return value;
}

export function loadConfig(configPath?: string): Config {
	const path = configPath ?? resolve(__dirname, '..', '..', '..', 'config', 'config.toml');

	let raw: unknown;
	try {
		raw = Bun.TOML.parse(readFileSync(path, 'utf-8'));
	} catch (err) {
		throw new Error(`[config] failed to read ${path}: ${(err as Error).message}`);
	}

	const parsed = ConfigFileSchema.safeParse(raw);
	if (!parsed.success) {
		throw new Error(`[config] invalid config: ${parsed.error.message}`);
	}

	const data = parsed.data;

	const upstreams: UpstreamConfig[] = data.upstreams.map((u) => ({
		...u,
		// Normalize URL: strip trailing /v1 or /v1/ so callers can always append /v1/... safely
		url: u.url.replace(/\/v1\/?$/, ''),
		resolvedApiKey: resolveEnvPlaceholder(u.apiKey),
	}));

	// Backward compat: debug=true bumps logLevel to debug if not already stricter
	const effectiveLogLevel: LogLevel =
		data.debug && data.logLevel === 'info' ? 'debug' : data.logLevel;

	// Project root is one level up from config directory (config is at ./config/config.toml)
	const projectRoot = dirname(dirname(path));

	return {
		...data,
		upstreams,
		resolvedStaticDir: resolve(projectRoot, data.staticDir),
		resolvedDatabasePath: resolve(projectRoot, data.database.path),
		resolvedMigrationsFolder: resolve(projectRoot, data.database.migrationsFolder),
		resolvedSeedsFolder: resolve(projectRoot, data.database.seedsFolder),
		resolvedSkillsFolder: resolve(projectRoot, data.database.skillsFolder),
		resolvedFilesystemRootPath: resolve(projectRoot, data.filesystem.rootPath),
		commands: data.commands,
		logLevel: effectiveLogLevel,
	};
}
