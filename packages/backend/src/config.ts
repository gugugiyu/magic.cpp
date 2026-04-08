import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const StreamingConfigSchema = z.object({
	enabled: z.boolean().default(true),
	bufferWords: z.number().int().nonnegative().default(0)
});

const UpstreamSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	url: z.string().url(),
	type: z.enum(['llamacpp', 'openai']),
	apiKey: z.string().nullable().default(null),
	enabled: z.boolean().default(true),	
	modelList: z.array(z.string()).default([])
});

const ConfigFileSchema = z.object({
	port: z.number().int().positive().default(3000),
	staticDir: z.string().default('../frontend/public'),
	heartbeatInterval: z.number().int().positive().default(30),
	upstreams: z.array(UpstreamSchema).min(1),
	enabled: z.boolean().default(true),	
	modelList: z.array(z.string()).default([]),
	streaming: StreamingConfigSchema.default({ enabled: true, bufferWords: 0 })
});

export type UpstreamConfig = z.infer<typeof UpstreamSchema> & {
	/** Resolved API key (env placeholder already substituted) */
	resolvedApiKey: string | null;
};

export type StreamingConfig = z.infer<typeof StreamingConfigSchema>;

export type Config = Omit<z.infer<typeof ConfigFileSchema>, 'upstreams'> & {
	upstreams: UpstreamConfig[];
	/** Absolute path to the static files directory */
	resolvedStaticDir: string;
	streaming: StreamingConfig;
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
	};
}
