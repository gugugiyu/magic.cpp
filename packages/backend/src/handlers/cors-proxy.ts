import { unwrapProxyHeaders } from '../utils/headers.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('cors-proxy');

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/**
 * GET /cors-proxy?url=<target>
 * Transparent HTTP proxy for cross-origin fetches (MCP resources, favicons).
 * Unwraps x-proxy-header-* prefixed headers from the frontend request.
 */
export async function handleCorsProxy(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const targetRaw = url.searchParams.get('url');
	const method = req.method.toUpperCase();

	// Handle probe request (HEAD without url param) - used to check if proxy is available
	if (method === 'HEAD' && !targetRaw) {
		return new Response('CORS proxy available', { status: 200 });
	}

	if (!targetRaw) {
		return new Response('missing url parameter', { status: 400 });
	}

	let target: URL;
	try {
		target = new URL(targetRaw);
	} catch {
		return new Response('invalid url parameter', { status: 400 });
	}

	if (!['http:', 'https:'].includes(target.protocol)) {
		return new Response('only http/https targets are allowed', { status: 400 });
	}

	// Block SSRF to localhost/internal addresses
	if (BLOCKED_HOSTS.has(target.hostname)) {
		return new Response('target host is not allowed', { status: 403 });
	}

	const forwardedHeaders = unwrapProxyHeaders(req.headers);

	let resp: Response;
	try {
		resp = await fetch(target.toString(), {
			method: req.method,
			headers: forwardedHeaders,
			signal: AbortSignal.timeout(15_000),
		});
	} catch (err) {
		log.error('fetch failed:', err);
		return new Response('proxy fetch failed', { status: 502 });
	}

	const responseHeaders = new Headers(resp.headers);
	responseHeaders.set('Access-Control-Allow-Origin', '*');
	for (const h of ['transfer-encoding', 'connection', 'keep-alive']) {
		responseHeaders.delete(h);
	}

	return new Response(resp.body, {
		status: resp.status,
		statusText: resp.statusText,
		headers: responseHeaders,
	});
}
