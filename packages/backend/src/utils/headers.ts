const PROXY_HEADER_PREFIX = 'x-proxy-header-';

/**
 * Inject Authorization header if an API key is present.
 */
export function injectAuth(headers: Record<string, string>, apiKey: string | null): void {
	if (apiKey) {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}
}

/**
 * Extract headers sent by the frontend as `x-proxy-header-<name>` and return
 * them as plain headers, stripping the prefix.
 */
export function unwrapProxyHeaders(incoming: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of incoming.entries()) {
		if (key.toLowerCase().startsWith(PROXY_HEADER_PREFIX)) {
			const realKey = key.slice(PROXY_HEADER_PREFIX.length);
			out[realKey] = value;
		}
	}
	return out;
}

/**
 * Build a safe set of forwarding headers from the original request, dropping
 * hop-by-hop headers and anything that should not be forwarded.
 */
export function forwardHeaders(incoming: Headers, apiKey: string | null): Record<string, string> {
	const SKIP = new Set([
		'host',
		'connection',
		'keep-alive',
		'transfer-encoding',
		'te',
		'trailer',
		'upgrade',
		'proxy-authorization',
		'proxy-authenticate',
		// Browser headers that cause external APIs (like OpenRouter) to redirect to web auth
		'origin',
		'referer',
		'cookie',
		'sec-fetch-dest',
		'sec-fetch-mode',
		'sec-fetch-site',
		'sec-gpc',
		'if-none-match',
		'if-modified-since',
		// Note: 'accept' is NOT skipped here - we handle it specially below to preserve streaming
		// Don't forward user-agent to external APIs
		'user-agent',
	]);

	const out: Record<string, string> = {};
	for (const [key, value] of incoming.entries()) {
		if (!SKIP.has(key.toLowerCase()) && !key.toLowerCase().startsWith(PROXY_HEADER_PREFIX)) {
			out[key] = value;
		}
	}

	injectAuth(out, apiKey);

	// Only set JSON accept if the client didn't already request streaming.
	// The frontend sends accept: text/event-stream for streaming requests,
	// and we must preserve that so OpenRouter returns SSE chunks.
	// Note: Header keys from Headers.entries() are lowercase.
	if (out['accept']?.toLowerCase() !== 'text/event-stream') {
		out['accept'] = 'application/json';
	}

	return out;
}
