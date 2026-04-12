import { join, extname, normalize, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.webp': 'image/webp',
};

/** Path prefixes that are definitely API routes — never serve the SPA shell for these. */
const API_PREFIXES = ['/v1/', '/models', '/compact', '/props', '/cors-proxy', '/health'];

function looksLikeApiPath(pathname: string): boolean {
	return API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function acceptsHtml(req: Request): boolean {
	const accept = req.headers.get('accept') ?? '';
	return accept.includes('text/html');
}

/** Guard against path traversal — ensures resolved path stays inside staticDir. */
function isPathSafe(requestedPath: string, staticDir: string): boolean {
	const resolved = resolve(staticDir, requestedPath);
	return resolved.startsWith(resolve(staticDir) + '/') || resolved === resolve(staticDir);
}

export function serveStatic(req: Request, staticDir: string): Response {
	const url = new URL(req.url);
	let pathname = decodeURIComponent(url.pathname);

	// If querying root path, returns index.html rigth away
	if (pathname === '/') {
		const indexPath = join(staticDir, 'index.html');
		if (existsSync(indexPath)) {
			return new Response(readFileSync(indexPath), {
				headers: { 'Content-Type': 'text/html; charset=utf-8' },
			});
		}
	}

	// Strip leading slash
	if (pathname.startsWith('/')) pathname = pathname.slice(1);

	const filePath = join(staticDir, pathname);

	// Path traversal guard
	if (!isPathSafe(pathname, staticDir)) {
		return new Response('Forbidden', { status: 403 });
	}

	if (existsSync(filePath)) {
		const ext = extname(filePath).toLowerCase();
		const contentType = MIME[ext] ?? 'application/octet-stream';
		const body = readFileSync(filePath);
		return new Response(body, {
			headers: { 'Content-Type': contentType },
		});
	}

	// SPA fallback: return index.html for browser requests that don't look like API routes.
	// API-like paths that reach here are genuinely missing — return 404, not the SPA shell.
	const indexPath = join(staticDir, 'index.html');

	if (!looksLikeApiPath(url.pathname) && acceptsHtml(req) && existsSync(indexPath)) {
		return new Response(readFileSync(indexPath), {
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
	}

	return new Response('Not found', { status: 404 });
}
