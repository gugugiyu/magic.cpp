import type { Upstream } from '../pool/types.ts';
import { forwardHeaders } from './headers.ts';

/**
 * Forward a request to an upstream, returning the upstream's Response.
 * Streams are not buffered — the caller can return the Response directly to the client.
 * @param providedBody - optional body text already consumed from request
 */
export async function proxyRequest(
	req: Request,
	upstream: Upstream,
	upstreamPath: string,
	providedBody?: string,
): Promise<Response> {
	const upstreamUrl = buildUrl(upstream.url, upstreamPath, req.url);
	console.log(`[proxy] resolved URL: ${upstreamUrl}`);
	const headers = forwardHeaders(req.headers, upstream.resolvedApiKey);

	// Use provided body or read from request
	const bodyText = providedBody || await req.text();
	console.log(`[proxy] request body (${bodyText.length} chars):`, bodyText.slice(0, 200));

	const upstreamReq = new Request(upstreamUrl, {
		method: req.method,
		headers,
		body: bodyText,
	});

	let resp: Response;
	console.log(`[proxy] sending request to ${upstreamUrl}`);
	console.log(`[proxy] headers:`, JSON.stringify(Object.fromEntries(upstreamReq.headers.entries())));

	try {
		const startTime = Date.now();
		resp = await fetch(upstreamReq);
		const duration = Date.now() - startTime;
		console.log(`[proxy] ${upstream.id} responded in ${duration}ms with status ${resp.status}`);
	} catch (err) {
		console.error(`[proxy] ${upstream.id} ${req.method} ${upstreamPath} failed:`, err);
		return new Response(JSON.stringify({ error: `upstream '${upstream.id}' unreachable: ${(err as Error).message}` }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// Log error responses from upstream
	if (!resp.ok) {
		const bodyText = await resp.clone().text();
		console.error(`[proxy] ${upstream.id} returned ${resp.status}:`, bodyText.slice(0, 500));

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

	console.log(`[proxy] response headers:`, Object.fromEntries(responseHeaders.entries()));
	console.log(`[proxy] returning response body, status:`, resp.status);
	const respBody = await resp.clone().text();
	console.log(`[proxy] upstream response body (${respBody.length} chars):`, respBody.slice(0, 300));

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
