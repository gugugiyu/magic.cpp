import type { ModelPool } from '../pool/model-pool.ts';

/**
 * GET /health — returns pool-wide health summary.
 * Returns `status: "initializing"` with 503 if the pool hasn't completed
 * its first refresh yet.
 */
export function handleHealth(pool: ModelPool): Response {
	if (!pool.isInitialized) {
		return Response.json(
			{ status: 'initializing', upstreams: [] },
			{ status: 503 },
		);
	}

	const upstreams = pool
		.getAllUpstreams()
		.filter((u) => u.enabled !== false)
		.map((u) => ({
			id: u.id,
			label: u.label,
			type: u.type,
			health: u.health,
			models: u.modelIds.size,
		}));

	const allHealthy = upstreams.every((u) => u.health === 'healthy');
	const anyHealthy = upstreams.some((u) => u.health === 'healthy');
	const status = allHealthy ? 'ok' : anyHealthy ? 'degraded' : 'down';

	return Response.json({ status, upstreams }, { status: status === 'down' ? 503 : 200 });
}
