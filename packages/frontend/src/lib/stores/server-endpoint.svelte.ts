import { browser } from '$app/environment';
import { SERVER_ENDPOINT_LOCALSTORAGE_KEY } from '$lib/constants';

export interface ServerEndpointConfig {
	baseUrl: string;
	isDefault: boolean;
}

const DEFAULT_BASE_URL = 'http://localhost:8080';

const DEFAULT_CONFIG: ServerEndpointConfig = {
	baseUrl: DEFAULT_BASE_URL,
	isDefault: true
};

class ServerEndpointStore {
	#config = $state<ServerEndpointConfig>(this.loadFromStorage());

	private loadFromStorage(): ServerEndpointConfig {
		if (!browser) {
			return DEFAULT_CONFIG;
		}

		try {
			const stored = localStorage.getItem(SERVER_ENDPOINT_LOCALSTORAGE_KEY);

			if (stored !== null) {
				const parsed = JSON.parse(stored) as ServerEndpointConfig;
				if (parsed.baseUrl && typeof parsed.isDefault === 'boolean') {
					return parsed;
				}
			}
		} catch (error) {
			console.warn('Failed to load server endpoint config:', error);
		}

		return DEFAULT_CONFIG;
	}

	private saveToStorage(config: ServerEndpointConfig): void {
		if (!browser) {
			return;
		}

		try {
			localStorage.setItem(SERVER_ENDPOINT_LOCALSTORAGE_KEY, JSON.stringify(config));
		} catch (error) {
			console.warn('Failed to save server endpoint config:', error);
		}
	}

	get config(): ServerEndpointConfig {
		return this.#config;
	}

	getBaseUrl(): string {
		return this.#config.baseUrl;
	}

	isDefault(): boolean {
		return this.#config.isDefault;
	}

	setBaseUrl(url: string): void {
		if (!url || url.trim().length === 0) {
			return;
		}

		this.#config = {
			baseUrl: url.trim(),
			isDefault: false
		};

		this.saveToStorage(this.#config);
	}

	setDefault(): void {
		this.#config = DEFAULT_CONFIG;
		this.saveToStorage(this.#config);
	}

	reset(): void {
		this.#config = DEFAULT_CONFIG;
		this.saveToStorage(this.#config);
	}
}

export const serverEndpointStore = new ServerEndpointStore();

export const serverEndpointConfig = () => serverEndpointStore.config;
export const isUsingDefaultEndpoint = () => serverEndpointStore.isDefault();
export const getServerBaseUrl = () => serverEndpointStore.getBaseUrl();
