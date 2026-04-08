import type { ModelPool } from '../pool/model-pool.ts';
import { proxyRequest } from '../utils/proxy.ts';

/**
 * POST /models/load — route to the upstream that owns the model (llamacpp only).
 */
export async function handleModelLoad(req: Request, pool: ModelPool): Promise<Response> {
	return routeModelOp(req, pool, '/models/load');
}

/**
 * POST /models/unload — route to the upstream that owns the model (llamacpp only).
 */
export async function handleModelUnload(req: Request, pool: ModelPool): Promise<Response> {
	return routeModelOp(req, pool, '/models/unload');
}

async function routeModelOp(
	req: Request,
	pool: ModelPool,
	path: string,
): Promise<Response> {
	let modelId: string | undefined;

	const cloned = req.clone();
	try {
		const body = (await cloned.json()) as { model?: string };
		modelId = body.model;
	} catch {
		// ignore
	}

	if (!modelId) {
		return Response.json({ error: 'missing model field in request body' }, { status: 400 });
	}

	const upstream = pool.resolveUpstream(modelId);
	if (!upstream) {
		// Model may not be loaded yet — pick first llamacpp upstream
		const fallback = pool.getAllUpstreams().find((u) => u.type === 'llamacpp');
		if (!fallback) {
			return Response.json({ error: 'no llamacpp upstream available' }, { status: 503 });
		}
		return proxyRequest(req, fallback, path);
	}

	if (upstream.type !== 'llamacpp') {
		return Response.json(
			{ error: `model ops not supported for upstream type '${upstream.type}'` },
			{ status: 400 },
		);
	}

	return proxyRequest(req, upstream, path);
}
