import type { ModelPool } from '../pool/model-pool.ts';

/**
 * GET /health — returns pool-wide health summary.
 */
export function handleHealth(pool: ModelPool): Response {
	const upstreams = pool.getAllUpstreams().map((u) => ({
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
