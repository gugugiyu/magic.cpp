import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
	path: z.string().default('data/chat.db')
}).default(() => ({ path: 'data/chat.db' }));

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

const ConfigFileSchema = z.object({
	port: z.number().int().positive().default(3000),
	staticDir: z.string().default('../public'),
	heartbeatInterval: z.number().int().positive().default(30),
	upstreams: z.array(UpstreamSchema).min(1),
	enabled: z.boolean().default(true),
	modelList: z.array(z.string()).default([]),
	debug: z.boolean().default(false),
	streaming: StreamingConfigSchema.default({ enabled: true, bufferWords: 0 }),
	database: DatabaseConfigSchema.default(() => ({ path: 'data/chat.db' })),
	cors: CorsConfigSchema,
	filesystem: FilesystemConfigSchema,
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
	/** Absolute path to the filesystem sandbox root */
	resolvedFilesystemRootPath: string;
	streaming: StreamingConfig;
	cors: CorsConfig;
};

function resolveEnvPlaceholder(value: string | null): string | null {
	if (!value) return null;
	if (value.startsWith('$')) {
		const envVar = value.slice(1);
		const resolved = process.env[envVar];
		if (!resolved) {
			console.warn(`[config] env var ${envVar} is not set — upstream will have no API key`);
			return null;
		}
		return resolved;
	}
	return value;
}

export function loadConfig(configPath?: string): Config {
	const path = configPath ?? resolve(__dirname, '..', 'config.json');

	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, 'utf-8'));
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

	return {
		...data,
		upstreams,
		resolvedStaticDir: resolve(dirname(path), data.staticDir),
		resolvedDatabasePath: resolve(dirname(path), data.database.path),
		resolvedFilesystemRootPath: resolve(dirname(path), data.filesystem.rootPath),
	};
}
