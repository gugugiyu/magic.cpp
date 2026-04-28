import { base } from '$app/paths';
import { getJsonHeaders } from './api-headers';
import { UrlProtocol } from '$lib/enums';
import { serverEndpointStore } from '$lib/stores/server-endpoint.svelte';

/**
 * API Fetch Utilities
 *
 * Provides common fetch patterns used across services:
 * - Automatic JSON headers
 * - Error handling with proper error messages
 * - Base path resolution
 */

export class ApiError extends Error {
	status: number;
	code?: number;
	retryAfter?: number;
	contextInfo?: { n_prompt_tokens: number; n_ctx: number };

	constructor(
		message: string,
		status: number,
		options?: {
			code?: number;
			retryAfter?: number;
			contextInfo?: { n_prompt_tokens: number; n_ctx: number };
		}
	) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = options?.code;
		this.retryAfter = options?.retryAfter;
		this.contextInfo = options?.contextInfo;
	}
}

export interface ApiFetchOptions extends Omit<RequestInit, 'headers' | 'signal'> {
	/**
	 * Additional headers to merge with default headers.
	 */
	headers?: Record<string, string>;
	/**
	 * Abort signal for the request.
	 */
	signal?: AbortSignal;
	/**
	 * Timeout in milliseconds. Defaults to 30s.
	 */
	timeout?: number;
}

/**
 * Default timeout for API requests in milliseconds.
 */
const DEFAULT_API_TIMEOUT = 30_000; // 30 seconds

/**
 * Fetch JSON data from an API endpoint with standard headers and error handling.
 *
 * @param path - API path (will be prefixed with base path)
 * @param options - Fetch options with additional authOnly flag
 * @returns Parsed JSON response
 * @throws Error with formatted message on failure
 *
 * @example
 * ```typescript
 * // GET request
 * const models = await apiFetch<ApiModelListResponse>('/v1/models');
 *
 * // POST request
 * const result = await apiFetch<ApiResponse>('/models/load', {
 *   method: 'POST',
 *   body: JSON.stringify({ model: 'gpt-4' })
 * });
 * ```
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
	const { headers: customHeaders, signal, ...fetchOptions } = options;

	const baseHeaders = getJsonHeaders();
	const headers = { ...baseHeaders, ...customHeaders };

	const normalizedPath = path.startsWith('./') ? `/${path.slice(2)}` : path;

	const url =
		normalizedPath.startsWith(UrlProtocol.HTTP) || normalizedPath.startsWith(UrlProtocol.HTTPS)
			? normalizedPath
			: serverEndpointStore.isDefault()
				? `${base}${normalizedPath}`
				: `${serverEndpointStore.getBaseUrl()}${normalizedPath}`;

	// Create abort controller for timeout if no signal provided
	const controller = signal ? null : new AbortController();
	const timeoutSignal = controller ? controller.signal : undefined;

	// Set up timeout
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	if (controller) {
		timeoutId = setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_API_TIMEOUT);
		controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
	}

	try {
		const response = await fetch(url, {
			...fetchOptions,
			headers,
			signal: timeoutSignal
		});

		if (timeoutId !== undefined) clearTimeout(timeoutId);

		if (!response.ok) {
			const error = await parseApiError(response);
			throw error;
		}

		// 204 No Content responses have no body
		if (response.status === 204) {
			return undefined as T;
		}

		return response.json() as Promise<T>;
	} catch (err) {
		// Check for abort/timeout error
		if (err instanceof DOMException && err.name === 'AbortError') {
			const timeoutError = new Error(`Request timed out after ${DEFAULT_API_TIMEOUT / 1000}s`);
			timeoutError.name = 'TimeoutError';
			throw timeoutError;
		}
		// Bun/Node.js AbortController throws AbortError differently
		if (err instanceof Error && err.name === 'AbortError') {
			const timeoutError = new Error(`Request timed out after ${DEFAULT_API_TIMEOUT / 1000}s`);
			timeoutError.name = 'TimeoutError';
			throw timeoutError;
		}
		throw err;
	}
}

/**
 * Fetch with URL constructed from base URL and query parameters.
 *
 * @param basePath - Base API path
 * @param params - Query parameters to append
 * @param options - Fetch options
 * @returns Parsed JSON response
 *
 * @example
 * ```typescript
 * const props = await apiFetchWithParams<ApiProps>('./props', {
 *   model: 'gpt-4',
 *   autoload: 'false'
 * });
 * ```
 */
export async function apiFetchWithParams<T>(
	basePath: string,
	params: Record<string, string>,
	options: ApiFetchOptions = {}
): Promise<T> {
	const normalizedPath = basePath.startsWith('./') ? `/${basePath.slice(2)}` : basePath;
	const baseUrl = serverEndpointStore.isDefault()
		? window.location.origin
		: serverEndpointStore.getBaseUrl();
	const url = new URL(normalizedPath, baseUrl);

	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null) {
			url.searchParams.set(key, value);
		}
	}

	const { headers: customHeaders, ...fetchOptions } = options;

	const baseHeaders = getJsonHeaders();
	const headers = { ...baseHeaders, ...customHeaders };

	// Create abort controller for timeout
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_API_TIMEOUT);
	controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });

	try {
		const response = await fetch(url.toString(), {
			...fetchOptions,
			headers,
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			const error = await parseApiError(response);
			throw error;
		}

		return response.json() as Promise<T>;
	} catch (err) {
		// Check for abort/timeout error
		if (err instanceof DOMException && err.name === 'AbortError') {
			const timeoutError = new Error(`Request timed out after ${DEFAULT_API_TIMEOUT / 1000}s`);
			timeoutError.name = 'TimeoutError';
			throw timeoutError;
		}
		// Bun/Node.js AbortController throws AbortError differently
		if (err instanceof Error && err.name === 'AbortError') {
			const timeoutError = new Error(`Request timed out after ${DEFAULT_API_TIMEOUT / 1000}s`);
			timeoutError.name = 'TimeoutError';
			throw timeoutError;
		}
		throw err;
	}
}

/**
 * POST JSON data to an API endpoint.
 *
 * @param path - API path
 * @param body - Request body (will be JSON stringified)
 * @param options - Additional fetch options
 * @returns Parsed JSON response
 */
export async function apiPost<T, B = unknown>(
	path: string,
	body: B,
	options: ApiFetchOptions = {}
): Promise<T> {
	return apiFetch<T>(path, {
		method: 'POST',
		body: JSON.stringify(body),
		...options
	});
}

/**
 * Parse an error response into an ApiError with status, code, and retry-after.
 */
async function parseApiError(response: Response): Promise<ApiError> {
	const retryAfter = response.headers.get('retry-after');
	const retryAfterValue = retryAfter ? parseInt(retryAfter, 10) : undefined;

	try {
		const errorData = await response.json();
		if (errorData?.error) {
			const err = errorData.error;
			const message = err.message || (typeof err === 'string' ? err : 'Unknown server error');
			const code = typeof err.code === 'number' ? err.code : undefined;
			const contextInfo =
				'n_prompt_tokens' in err && 'n_ctx' in err
					? { n_prompt_tokens: err.n_prompt_tokens, n_ctx: err.n_ctx }
					: undefined;
			return new ApiError(message, response.status, {
				code,
				retryAfter: retryAfterValue,
				contextInfo
			});
		}
		if (errorData?.message && typeof errorData.message === 'string') {
			return new ApiError(errorData.message, response.status, { retryAfter: retryAfterValue });
		}
	} catch {
		// JSON parsing failed, use status text
	}

	return new ApiError(
		`Request failed: ${response.status} ${response.statusText}`,
		response.status,
		{ retryAfter: retryAfterValue }
	);
}
