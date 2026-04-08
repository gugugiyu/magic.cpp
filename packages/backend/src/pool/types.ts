import type { UpstreamConfig } from '../config.ts';

export type UpstreamHealth = 'healthy' | 'degraded' | 'unknown';

export interface Upstream extends UpstreamConfig {
	health: UpstreamHealth;
	/** Model IDs currently known to be served by this upstream */
	modelIds: Set<string>;
}

/** A model entry as returned by /v1/models, tagged with its owning upstream */
export interface PooledModel {
	id: string;
	object: string;
	owned_by: string;
	created: number;
	/** Which upstream serves this model */
	upstreamId: string;
	/** Raw extra fields from the upstream response */
	[key: string]: unknown;
}
