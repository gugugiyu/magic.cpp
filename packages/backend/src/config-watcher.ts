import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { watch as fsWatch } from 'fs';
import { loadConfig, type Config } from './config.ts';
import { createLogger } from './utils/logger.ts';

const log = createLogger('config-watcher');

const __dirname = dirname(fileURLToPath(import.meta.url));

type ConfigListener = (config: Config) => void;

let watcher: { close: () => void } | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentConfigPath: string | null = null;
let listeners: Set<ConfigListener> = new Set();

/**
 * Watch the config.toml file for changes and notify listeners.
 * Uses native fs.watch with a 1-second debounce to avoid rapid successive reloads.
 *
 * @param configPath - Optional explicit path; defaults to ../config.toml relative to src directory
 * @param onChange - Callback invoked with new Config when file changes and validates successfully
 * @returns Unsubscribe function that stops the watcher
 */
export function watchConfig(configPath?: string, onChange?: ConfigListener): () => void {
	// Resolve the config path
	const path = configPath ?? resolve(__dirname, '..', 'config.toml');
	currentConfigPath = path;

	// Register listener if provided
	if (onChange) {
		listeners.add(onChange);
	}

	// If watcher already exists, return existing unsubscribe
	if (watcher) {
		return () => {
			if (onChange) {
				listeners.delete(onChange);
			}
		};
	}

	// Debounced reload function
	const debouncedReload = () => {
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}

		debounceTimer = setTimeout(async () => {
			try {
				const newConfig = loadConfig(path!);
				log.info(`config reloaded from ${path}`);

				// Notify all listeners
				for (const listener of listeners) {
					try {
						listener(newConfig);
					} catch (err) {
						log.error('listener error:', err);
					}
				}
			} catch (err) {
				log.error('failed to reload config:', (err as Error).message);
			} finally {
				debounceTimer = null;
			}
		}, 1000);
	};

	// Start watching the file
	watcher = {
		close: () => {
			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
			}
		}
	};

	try {
		const w = fsWatch(path, { persistent: true }, (event, filename) => {
			if (event === 'change' || event === 'rename') {
				debouncedReload();
			}
		});

		watcher = w;
		log.info(`watching ${path} for changes`);

		// Return unsubscribe function
		return () => {
			w.close();
			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
			}
			if (onChange) {
				listeners.delete(onChange);
			}
		};
	} catch (err) {
		log.error('failed to start watcher:', (err as Error).message);
		// Return no-op unsubscribe on error
		return () => {};
	}
}
