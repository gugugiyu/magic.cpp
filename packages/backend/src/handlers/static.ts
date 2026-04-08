import { join, extname } from 'path';
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
	if (existsSync(filePath)) {
		const ext = extname(filePath).toLowerCase();
		const contentType = MIME[ext] ?? 'application/octet-stream';
		const body = readFileSync(filePath);
		return new Response(body, {
			headers: { 'Content-Type': contentType },
		});
	}

	// SPA fallback: return index.html for any unmatched GET request
	const indexPath = join(staticDir, 'index.html');
	if (existsSync(indexPath)) {
		return new Response(readFileSync(indexPath), {
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
	}

	return new Response('Not found', { status: 404 });
}
