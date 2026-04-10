/**
 * subagentConfigStore - Configuration store for the subagent endpoint.
 *
 * Manages the connection settings for the call_subagent built-in tool,
 * which delegates tasks to a separate OpenAI-compatible server.
 *
 * Unlike the main apiConfigStore, this is isolated to avoid mixing
 * the main llama.cpp server with the subagent endpoint.
 */

import { browser } from '$app/environment';
import { SUBAGENT_CONFIG_LOCALSTORAGE_KEY } from '$lib/constants';

export interface SubagentConfig {
	endpoint: string;
	apiKey: string;
	model: string;
	enabled: boolean;
	summarizeEnabled: boolean;
}

const DEFAULT_CONFIG: SubagentConfig = {
	endpoint: '',
	apiKey: '',
	model: '',
	enabled: false,
	summarizeEnabled: false
};

class SubagentConfigStore {
	#config = $state<SubagentConfig>(this.loadFromStorage());

	private loadFromStorage(): SubagentConfig {
		if (!browser) {
			return DEFAULT_CONFIG;
		}

		try {
			const stored = localStorage.getItem(SUBAGENT_CONFIG_LOCALSTORAGE_KEY);
			if (stored !== null) {
				const parsed = JSON.parse(stored) as SubagentConfig;
				if (typeof parsed.enabled === 'boolean') {
					return { ...DEFAULT_CONFIG, ...parsed };
				}
			}
		} catch (error) {
			console.warn('Failed to load subagent config:', error);
		}

		return DEFAULT_CONFIG;
	}

	private saveToStorage(config: SubagentConfig): void {
		if (!browser) {
			return;
		}

		try {
			localStorage.setItem(SUBAGENT_CONFIG_LOCALSTORAGE_KEY, JSON.stringify(config));
		} catch (error) {
			console.warn('Failed to save subagent config:', error);
		}
	}

	get config(): SubagentConfig {
		return this.#config;
	}

	get isConfigured(): boolean {
		return this.#config.endpoint.trim().length > 0 && this.#config.model.trim().length > 0;
	}

	get isEnabled(): boolean {
		return this.#config.enabled;
	}

	getEndpoint(): string {
		return this.#config.endpoint;
	}

	getApiKey(): string {
		return this.#config.apiKey;
	}

	getModel(): string {
		return this.#config.model;
	}

	setEnabled(enabled: boolean): void {
		this.#config = { ...this.#config, enabled };
		this.saveToStorage(this.#config);
	}

	setEndpoint(endpoint: string): void {
		this.#config = { ...this.#config, endpoint: endpoint.trim() };
		this.saveToStorage(this.#config);
	}

	setApiKey(apiKey: string): void {
		this.#config = { ...this.#config, apiKey: apiKey.trim() };
		this.saveToStorage(this.#config);
	}

	setModel(model: string): void {
		this.#config = { ...this.#config, model: model.trim() };
		this.saveToStorage(this.#config);
	}

	setSummarizeEnabled(enabled: boolean): void {
		this.#config = { ...this.#config, summarizeEnabled: enabled };
		this.saveToStorage(this.#config);
	}

	update(config: Partial<SubagentConfig>): void {
		this.#config = { ...this.#config, ...config };
		this.saveToStorage(this.#config);
	}

	reset(): void {
		this.#config = DEFAULT_CONFIG;
		this.saveToStorage(this.#config);
	}
}

export const subagentConfigStore = new SubagentConfigStore();

export const subagentConfig = () => subagentConfigStore.config;
export const isSubagentConfigured = () => subagentConfigStore.isConfigured;
export const isSubagentEnabled = () => subagentConfigStore.isEnabled;
