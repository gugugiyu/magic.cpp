import type { ModelPool } from './model-pool.ts';
import type { Config } from '../config.ts';
import { injectAuth } from '../utils/headers.ts';

export class Heartbeat {
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly pool: ModelPool,
		private readonly config: Config,
	) {}

	start(): void {
		this.tick();
		this.timer = setInterval(
			() => this.tick(),
			this.config.heartbeatInterval * 1_000,
		);
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async tick(): Promise<void> {
		// Refresh model pool (also updates routing map)
		try {
			await this.pool.refresh();
		} catch (err) {
			console.error('[heartbeat] model pool refresh failed:', err);
		}

		// Check health of each upstream
		await Promise.allSettled(
			this.pool.getAllUpstreams().map((u) => this.checkHealth(u.id)),
		);
	}

	private async checkHealth(upstreamId: string): Promise<void> {
		const upstream = this.pool.getUpstream(upstreamId);
		if (!upstream) return;

		const url = `${upstream.url}/health`;
		const headers: Record<string, string> = {};
		injectAuth(headers, upstream.resolvedApiKey);

		try {
			const resp = await fetch(url, { headers, signal: AbortSignal.timeout(5_000) });
			upstream.health = resp.ok ? 'healthy' : 'degraded';
		} catch {
			upstream.health = 'degraded';
		}

		console.log(`[heartbeat] ${upstream.id} → ${upstream.health}`);
	}
}
