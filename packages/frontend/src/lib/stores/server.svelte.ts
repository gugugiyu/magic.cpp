import { PropsService } from '$lib/services/props.service';
import { ServerRole } from '$lib/enums';
import { poolStatusStore } from './pool-status.svelte';

/**
 * serverStore - Server connection state, configuration, and role detection
 *
 * This store manages the server connection state and properties fetched from `/props`.
 * It provides reactive state for server configuration and role detection.
 *
 * **Architecture & Relationships:**
 * - **PropsService**: Stateless service for fetching `/props` data
 * - **serverStore** (this class): Reactive store for server state
 * - **modelsStore**: Independent store for model management (uses PropsService directly)
 *
 * **Key Features:**
 * - **Server State**: Connection status, loading, error handling
 * - **Role Detection**: MODEL (single model) vs ROUTER (multi-model)
 * - **Default Params**: Server-wide generation defaults
 */
class ServerStore {
	/**
	 *
	 *
	 * State
	 *
	 *
	 */

	props = $state<ApiLlamaCppServerProps | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	role = $state<ServerRole | null>(null);
	/** Current retry attempt during fetchWithRetry (0 = first try, increments on retries) */
	retryAttempt = $state(0);
	private fetchPromise: Promise<void> | null = null;

	/**
	 * Maximum retries for transient /props failures (network blips, 5xx).
	 * 404s are not retried — they indicate an unsupported endpoint.
	 */
	private static readonly MAX_RETRIES = 2;

	/**
	 * Base delay in ms for exponential backoff (1s, 2s, 4s, ...).
	 */
	private static readonly RETRY_BASE_DELAY_MS = 1000;

	/**
	 *
	 *
	 * Getters
	 *
	 *
	 */

	get defaultParams(): ApiLlamaCppServerProps['default_generation_settings']['params'] | null {
		return this.props?.default_generation_settings?.params || null;
	}

	get contextSize(): number | null {
		const nCtx = this.props?.default_generation_settings?.n_ctx;

		return typeof nCtx === 'number' ? nCtx : null;
	}

	get webuiSettings(): Record<string, string | number | boolean> | undefined {
		return this.props?.webui_settings;
	}

	get isRouterMode(): boolean {
		return this.role === ServerRole.ROUTER;
	}

	get isModelMode(): boolean {
		return this.role === ServerRole.MODEL;
	}

	/** Whether the current error indicates an unsupported endpoint (app runs in compatibility mode) */
	get isCompatibilityMode(): boolean {
		return this.error?.includes('does not support model metadata endpoint') ?? false;
	}

	/**
	 *
	 *
	 * Data Handling
	 *
	 *
	 */

	async fetch(): Promise<void> {
		if (this.fetchPromise) return this.fetchPromise;

		this.loading = true;
		this.error = null;

		const fetchPromise = (async () => {
			try {
				const isOpenAIOnly = await this.quickHealthCheck();

				if (isOpenAIOnly) {
					this.props = null;
					this.error =
						'Server does not support model metadata endpoint (/props) — running in compatibility mode';
					this.role = ServerRole.MODEL;
				} else {
					const props = await this.fetchWithRetry();
					this.props = props;
					this.error = null;
					this.detectRole(props);
				}
			} catch (error) {
				this.error = this.getErrorMessage(error);
				console.error('Error fetching server properties:', error);
			} finally {
				this.loading = false;
				this.fetchPromise = null;
			}
		})();

		this.fetchPromise = fetchPromise;
		await fetchPromise;
	}

	/**
	 * Lightweight health check to determine whether /props is needed.
	 * If the backend reports that all upstreams are OpenAI-type, we skip
	 * the /props fetch entirely (OpenAI endpoints don't have /props).
	 * Falls back gracefully (returns false) on any failure, allowing
	 * the normal /props flow to proceed.
	 */
	private async quickHealthCheck(): Promise<boolean> {
		try {
			const response = await fetch('./health');
			if (!response.ok) return false;
			const data = await response.json();
			poolStatusStore.updateFromHealth(data);
			if (data.upstreams && Array.isArray(data.upstreams)) {
				return (
					data.upstreams.length > 0 &&
					data.upstreams.every((u: { type: string }) => u.type === 'openai')
				);
			}
			return false;
		} catch {
			return false;
		}
	}

	/**
	 * Fetch /props with exponential backoff retry for transient errors.
	 * Skips retry for 404s (endpoint not supported) — these are permanent.
	 */
	private async fetchWithRetry(): Promise<ApiLlamaCppServerProps> {
		let lastError: unknown;

		for (let attempt = 0; attempt <= ServerStore.MAX_RETRIES; attempt++) {
			this.retryAttempt = attempt;
			try {
				const props = await PropsService.fetch();

				// Guard: if the response lacks the expected llama.cpp shape,
				// treat it as a permanent error so callers can fall back gracefully.
				if (!this.isValidPropsShape(props)) {
					throw new Error('Server response is not a recognized llama.cpp /props shape');
				}

				return props;
			} catch (error) {
				lastError = error;

				const isRetryable = !this.isPermanentError(error);
				if (!isRetryable || attempt === ServerStore.MAX_RETRIES) {
					throw error;
				}

				const delay = ServerStore.RETRY_BASE_DELAY_MS * 2 ** attempt;
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		throw lastError;
	}

	/**
	 * Validate that the /props response has the expected llama.cpp shape.
	 * OpenAI-compatible endpoints may return a different structure.
	 */
	private isValidPropsShape(props: unknown): props is ApiLlamaCppServerProps {
		if (!props || typeof props !== 'object') return false;
		const obj = props as Record<string, unknown>;
		// At minimum, expect model_path (llama.cpp) or default_generation_settings
		if (!('model_path' in obj) && !('default_generation_settings' in obj)) return false;
		// If default_generation_settings is present, ensure it has the required nested structure
		if ('default_generation_settings' in obj) {
			const dgs = obj.default_generation_settings;
			if (!dgs || typeof dgs !== 'object') return false;
			// ik_llama.cpp wrap up to default_generation_settings only
			// we'll check inline whether temp is found
			if (
				!('params' in (dgs as Record<string, unknown>)) &&
				!('temperature' in (dgs as Record<string, unknown>))
			)
				return false;
		}
		return true;
	}

	/**
	 * Determine if an error is permanent (not worth retrying).
	 * 404s indicate the endpoint doesn't exist — no point retrying.
	 */
	private isPermanentError(error: unknown): boolean {
		if (error instanceof Error) {
			const message = error.message || '';
			// 404 means endpoint not found — permanent
			if (message.includes('404')) return true;
			// 401/403 means auth failure — retrying won't help
			if (message.includes('401') || message.includes('403')) return true;
		}
		return false;
	}

	private getErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			const message = error.message || '';
			console.log('@@', error, message);

			if (error.name === 'TypeError' && message.includes('fetch')) {
				return 'Cannot reach server — check that llama.cpp is running and the URL is correct';
			} else if (message.includes('ECONNREFUSED')) {
				return 'Connection refused — server may be offline or on a different port';
			} else if (message.includes('ENOTFOUND')) {
				return 'Server address not found — check the server URL configuration';
			} else if (message.includes('ETIMEDOUT') || message.includes('Request timed out')) {
				return 'Request timed out — server may be overloaded or unreachable';
			} else if (message.includes('503')) {
				return 'Server temporarily unavailable';
			} else if (message.includes('500')) {
				return 'Server error — check server logs for details';
			} else if (message.includes('404')) {
				return 'Server not found: Upstream not found';
			} else if (message.includes('403') || message.includes('401')) {
				return 'Access denied — check API key and permissions';
			} else if (message.includes('not a recognized llama.cpp /props shape')) {
				return 'Server returned unexpected response — expected llama.cpp format';
			}
		}

		return 'Failed to connect to server';
	}

	clear(): void {
		this.props = null;
		this.error = null;
		this.loading = false;
		this.role = null;
		this.retryAttempt = 0;
		this.fetchPromise = null;
	}

	/**
	 *
	 *
	 * Utilities
	 *
	 *
	 */

	private detectRole(props: ApiLlamaCppServerProps): void {
		const newRole = props?.role === ServerRole.ROUTER ? ServerRole.ROUTER : ServerRole.MODEL;
		if (this.role !== newRole) {
			this.role = newRole;
			console.info(`Server running in ${newRole === ServerRole.ROUTER ? 'ROUTER' : 'MODEL'} mode`);
		}
	}
}

export const serverStore = new ServerStore();

export const serverProps = () => serverStore.props;
export const serverLoading = () => serverStore.loading;
export const serverError = () => serverStore.error;
export const serverRole = () => serverStore.role;
export const serverRetryAttempt = () => serverStore.retryAttempt;
export const isCompatibilityMode = () => serverStore.isCompatibilityMode;
export const defaultParams = () => serverStore.defaultParams;
export const contextSize = () => serverStore.contextSize;
export const isRouterMode = () => serverStore.isRouterMode;
export const isModelMode = () => serverStore.isModelMode;
