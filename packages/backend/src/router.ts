import type { ModelPool } from './pool/model-pool.ts';
import type { Config } from './config.ts';
import { handleV1Models, handleModels } from './handlers/models.ts';
import { handleChat } from './handlers/chat.ts';
import { handleProps } from './handlers/props.ts';
import { handleModelLoad, handleModelUnload } from './handlers/model-ops.ts';
import { handleCorsProxy } from './handlers/cors-proxy.ts';
import { handleHealth } from './handlers/health.ts';
import { serveStatic } from './handlers/static.ts';

export function createRouter(pool: ModelPool, config: Config) {
	return async function router(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const { pathname } = url;
		const method = req.method.toUpperCase();

		// API routes
		if (pathname === '/v1/models' && method === 'GET') {
			return handleV1Models(pool);
		}

		if (pathname === '/v1/chat/completions' && method === 'POST') {
			return handleChat(req, pool);
		}

		if (pathname === '/props' && method === 'GET') {
			return handleProps(req, pool);
		}

		if (pathname === '/models' && method === 'GET') {
			return handleModels(req, pool);
		}

		if (pathname === '/models/load' && method === 'POST') {
			return handleModelLoad(req, pool);
		}

		if (pathname === '/models/unload' && method === 'POST') {
			return handleModelUnload(req, pool);
		}

		if (pathname === '/cors-proxy' && method === 'GET') {
			return handleCorsProxy(req);
		}

		if (pathname === '/health' && method === 'GET') {
			return handleHealth(pool);
		}

		// CORS preflight
		if (method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': '*',
				},
			});
		}

		// Static file serving + SPA fallback for all unmatched GET requests
		if (method === 'GET') {
			return serveStatic(req, config.resolvedStaticDir);
		}

		return new Response('Method Not Allowed', { status: 405 });
	};
}
