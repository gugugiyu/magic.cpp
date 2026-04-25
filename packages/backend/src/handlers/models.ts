import type { ModelPool } from '../pool/model-pool.ts';
import type { Upstream } from '../pool/types.ts';
import { proxyRequest } from '../utils/proxy.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('models');

/**
 * GET /v1/models — returns merged model list from all upstreams.
 * Returns 200 with status "initializing" if the pool hasn't completed
 * its first refresh yet, so the frontend can display a loading state
 * without treating it as an error.
 */
export function handleV1Models(pool: ModelPool): Response {
	if (!pool.isInitialized) {
		return Response.json(
			{
				object: 'list',
				data: [],
				status: 'initializing'
			},
			{ status: 200 },
		);
	}
	const models = pool.getMergedModels();
	return Response.json({ object: 'list', data: models });
}

/**
 * GET /models — proxy to the first enabled llamacpp upstream that is healthy,
 * or the first enabled llamacpp upstream overall. The frontend uses this for
 * ROUTER mode model management.
 */
export async function handleModels(req: Request, pool: ModelPool): Promise<Response> {
	try {
		const upstream = pickLlamaCppUpstream(pool);
		if (!upstream) {
			return Response.json({
				error: 'No available llamacpp upstream',
				detail: 'All llamacpp upstreams are either disabled, unhealthy, or not configured'
			}, { status: 503 });
		}

		log.info('Proxying to:', upstream.url + '/models');
		return await proxyRequest(req, upstream, '/models');
	} catch (err) {
		log.error('error handling /models:', err);
		return Response.json(
			{ error: 'Failed to proxy model list', detail: (err as Error).message },
			{ status: 502 },
		);
	}
}

/**
 * Pick a llamacpp upstream to proxy to.
 * Priority: healthy + enabled > enabled > healthy (fallback for backwards compatibility)
 */
function pickLlamaCppUpstream(pool: ModelPool): Upstream | undefined {
	const all = pool.getAllUpstreams();

	// Prefer healthy and enabled
	const healthyEnabled = all.find((u) =>
		u.type === 'llamacpp' && u.health === 'healthy' && u.enabled
	);
	if (healthyEnabled) return healthyEnabled;

	// Fall back to any enabled llamacpp
	const anyEnabled = all.find((u) =>
		u.type === 'llamacpp' && u.enabled
	);
	if (anyEnabled) return anyEnabled;

	// Last resort: any healthy llamacpp (even if disabled - for debugging)
	return all.find((u) => u.type === 'llamacpp' && u.health === 'healthy');
}
