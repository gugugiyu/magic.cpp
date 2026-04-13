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

	const url =
		path.startsWith(UrlProtocol.HTTP) || path.startsWith(UrlProtocol.HTTPS)
			? path
			: serverEndpointStore.isDefault()
				? `${base}${path}`
				: `${serverEndpointStore.getBaseUrl()}${path}`;

	// Create abort controller for timeout if no signal provided
	const controller = signal ? null : new AbortController();
	const timeoutSignal = controller ? controller.signal : undefined;

	// Set up timeout
	if (controller) {
		const timeoutId = setTimeout(
			() => controller.abort(),
			options.timeout ?? DEFAULT_API_TIMEOUT
		) as unknown as number;
		controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
	}

	try {
		const response = await fetch(url, {
			...fetchOptions,
			headers,
			signal: timeoutSignal
		});

		if (!response.ok) {
			const errorMessage = await parseErrorMessage(response);
			throw new Error(errorMessage);
		}

		// 204 No Content responses have no body
		if (response.status === 204) {
			return undefined as T;
		}

		return response.json() as Promise<T>;
	} catch (err) {
		// Check for abort/timeout error
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw new Error(`Request timed out after ${DEFAULT_API_TIMEOUT / 1000}s`);
		}
		// Bun/Node.js AbortController throws AbortError differently
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error(`Request timed out after ${DEFAULT_API_TIMEOUT / 1000}s`);
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
	const baseUrl = serverEndpointStore.isDefault()
		? window.location.href
		: serverEndpointStore.getBaseUrl();
	const url = new URL(basePath, baseUrl);

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
	const timeoutId = setTimeout(
		() => controller.abort(),
		options.timeout ?? DEFAULT_API_TIMEOUT
	) as unknown as number;
	controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });

	try {
		const response = await fetch(url.toString(), {
			...fetchOptions,
			headers,
			signal: controller.signal
		});

		if (!response.ok) {
			const errorMessage = await parseErrorMessage(response);
			throw new Error(errorMessage);
		}

		return response.json() as Promise<T>;
	} catch (err) {
		// Check for abort/timeout error
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw new Error(`Request timed out after ${DEFAULT_API_TIMEOUT / 1000}s`);
		}
		// Bun/Node.js AbortController throws AbortError differently
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error(`Request timed out after ${DEFAULT_API_TIMEOUT / 1000}s`);
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
 * Parse error message from a failed response.
 * Tries to extract error message from JSON body, falls back to status text.
 */
async function parseErrorMessage(response: Response): Promise<string> {
	try {
		const errorData = await response.json();
		if (errorData?.error?.message) {
			return errorData.error.message;
		}
		if (errorData?.error && typeof errorData.error === 'string') {
			return errorData.error;
		}
		if (errorData?.message) {
			return errorData.message;
		}
	} catch {
		// JSON parsing failed, use status text
	}

	return `Request failed: ${response.status} ${response.statusText}`;
}
