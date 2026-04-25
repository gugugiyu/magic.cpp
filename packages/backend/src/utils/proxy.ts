import type { Upstream } from '../pool/types.ts';
import { forwardHeaders } from './headers.ts';
import { createLogger } from './logger.ts';

const log = createLogger('proxy');

/**
 * Forward a request to an upstream, returning the upstream's Response.
 * Streams are not buffered — the caller can return the Response directly to the client.
 * @param providedBody - optional body text already consumed from request
 * @param headerTimeoutMs - timeout in ms for receiving response headers (default: 300s for streaming)
 */
export async function proxyRequest(
	req: Request,
	upstream: Upstream,
	upstreamPath: string,
	providedBody?: string,
	headerTimeoutMs: number = 300_000,
): Promise<Response> {
	const upstreamUrl = buildUrl(upstream.url, upstreamPath, req.url);
	const headers = forwardHeaders(req.headers, upstream.resolvedApiKey);

	// Only read body for methods that typically have one
	const method = req.method.toUpperCase();
	let bodyText = '';
	if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
		bodyText = providedBody || await req.text();
	}

	const upstreamReq = new Request(upstreamUrl, {
		method: req.method,
		headers,
		body: bodyText || undefined,
		signal: req.signal,
	});

	let resp: Response;
	try {
		// Use a separate timeout for getting the initial response (headers).
		// We do NOT want this timeout to apply to the body stream, since streaming
		// responses can take minutes to complete. Use AbortController manually
		// instead of AbortSignal.timeout() which applies to the entire fetch lifecycle.
		const headerController = new AbortController();
		const headerTimeout = setTimeout(() => headerController.abort(), headerTimeoutMs);
		const startTime = Date.now();
		resp = await fetch(upstreamReq, { signal: headerController.signal });
		clearTimeout(headerTimeout);
		const elapsed = Date.now() - startTime;
		if (import.meta.env.DEV) {
			log.debug(`upstream ${upstream.id} responded in ${elapsed}ms, status=${resp.status}`);
		}
	} catch (err) {
		const error = err as Error;
		if (error.name === 'TimeoutError' || error.name === 'AbortError') {
			return new Response(JSON.stringify({ error: `upstream '${upstream.id}' timed out` }), {
				status: 504,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response(JSON.stringify({ error: `upstream '${upstream.id}' unreachable: ${error.message}` }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// Log error responses from upstream
	if (!resp.ok) {
		// Handle 429 Rate Limit specially - extract retry-after info
		if (resp.status === 429) {
			const retryAfter = resp.headers.get('retry-after') || resp.headers.get('x-ratelimit-reset');
			const errorBody = JSON.parse(bodyText || '{}');
			const errorMessage = errorBody?.error?.message || errorBody?.message || 'Rate limit exceeded';

			return new Response(JSON.stringify({
				error: {
					message: errorMessage,
					type: 'rate_limit',
					retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined
				}
			}), {
				status: 429,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	}

	// Strip hop-by-hop headers from upstream response
	// Also strip content-encoding since Bun auto-decompresses response bodies
	const responseHeaders = new Headers(resp.headers);
	for (const h of ['transfer-encoding', 'connection', 'keep-alive', 'content-encoding']) {
		responseHeaders.delete(h);
	}

	return new Response(resp.body, {
		status: resp.status,
		statusText: resp.statusText,
		headers: responseHeaders,
	});
}

function buildUrl(baseUrl: string, upstreamPath: string, originalUrl: string): string {
	const original = new URL(originalUrl);
	// Ensure baseUrl doesn't end with / so we can properly join paths
	const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
	// Remove leading / from upstreamPath to avoid absolute path replacement
	const path = upstreamPath.startsWith('/') ? upstreamPath.slice(1) : upstreamPath;
	const target = new URL(`${base}/${path}`);
	// Forward query string from the original request
	target.search = original.search;
	return target.toString();
}
