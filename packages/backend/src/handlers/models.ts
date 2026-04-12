import type { ModelPool } from '../pool/model-pool.ts';
import type { Upstream } from '../pool/types.ts';
import { proxyRequest } from '../utils/proxy.ts';

/**
 * GET /v1/models — returns merged model list from all upstreams.
 * Returns 503 with `status: "initializing"` if the pool hasn't completed
 * its first refresh yet, so the frontend can display a loading state.
 */
export function handleV1Models(pool: ModelPool): Response {
	if (!pool.isInitialized) {
		return Response.json(
			{ status: 'initializing', data: [] },
			{ status: 503 },
		);
	}
	const models = pool.getMergedModels();
	return Response.json({ object: 'list', data: models });
}

/**
 * GET /models — proxy to the first llamacpp upstream that is healthy, or the
 * first upstream overall. The frontend uses this for ROUTER mode model management.
 */
export async function handleModels(req: Request, pool: ModelPool): Promise<Response> {
	const upstream = pickLlamaCppUpstream(pool);
	if (!upstream) {
		return Response.json({ error: 'no llamacpp upstream available' }, { status: 503 });
	}

	console.log("Proxying to: " + upstream.url + "/models")
	return proxyRequest(req, upstream, '/models');
}

function pickLlamaCppUpstream(pool: ModelPool): Upstream | undefined {
	const all = pool.getAllUpstreams();

	return (
		all.find((u) => u.type === 'llamacpp' && u.health === 'healthy') ??
		all.find((u) => u.type === 'llamacpp')
	);
}
