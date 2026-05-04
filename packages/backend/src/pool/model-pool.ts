import type { Config, StreamingConfig } from '../config.ts';
import type { Upstream, PooledModel } from './types.ts';
import { injectAuth } from '../utils/headers.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('model-pool');

export class ModelPool {
	private upstreams: Map<string, Upstream> = new Map();
	/** model ID → upstream ID */
	private routingMap: Map<string, string> = new Map();
	private pooledModels: PooledModel[] = [];
	private globalModelList: string[] = [];
	private streamingConfig: StreamingConfig = { enabled: true, bufferWords: 0 };
	/** Tracks whether the first refresh() has completed (successfully or not) */
	private _initialized = false;

	constructor(config: Config) {
		this.globalModelList = config.modelList || [];
		this.streamingConfig = config.streaming || { enabled: true, bufferWords: 0 };
		for (const u of config.upstreams) {
			this.upstreams.set(u.id, {
				...u,
				health: 'unknown',
				modelIds: new Set(),
			});
		}
	}

	/** Whether the initial model list fetch has completed. */
	get isInitialized(): boolean {
		return this._initialized;
	}

	getStreamingConfig(): StreamingConfig {
		return this.streamingConfig;
	}

	private shouldIncludeModel(modelId: string, upstreamModelList: string[]): boolean {
		const globalList = this.globalModelList;
		const upstreamList = upstreamModelList;
		const isEmpty = (list: string[]) => !list || list.length === 0;

		// No filters = include all
		if (isEmpty(globalList) && isEmpty(upstreamList)) {
			return true;
		}

		// Check global whitelist
		if (!isEmpty(globalList) && globalList.includes(modelId)) {
			return true;
		}

		// Check upstream whitelist
		if (!isEmpty(upstreamList) && upstreamList.includes(modelId)) {
			return true;
		}

		// Log warning if whitelist is too restrictive
		if (!isEmpty(upstreamList)) {
			// console.warn(`[model-pool] model '${modelId}' not in upstream whitelist ${JSON.stringify(upstreamList)}`);
		}

		return false;
	}

	getUpstream(id: string): Upstream | undefined {
		return this.upstreams.get(id);
	}

	getAllUpstreams(): Upstream[] {
		return Array.from(this.upstreams.values());
	}

	/** Look up which upstream owns a model ID. Returns undefined if not found. */
	resolveUpstream(modelId: string): Upstream | undefined {
		const upstreamId = this.routingMap.get(modelId);
		if (!upstreamId) return undefined;
		return this.upstreams.get(upstreamId);
	}

	/** Merged, de-duplicated model list for /v1/models */
	getMergedModels(): PooledModel[] {
		return this.pooledModels;
	}

	/** Refresh model list from all upstreams and rebuild routing map */
	async refresh(): Promise<void> {
		const results = await Promise.allSettled(
			Array.from(this.upstreams.values()).map((u) => this.fetchModels(u)),
		);

		const freshModels: PooledModel[] = [];
		const freshRouting = new Map<string, string>();

		for (const result of results) {
			if (result.status === 'fulfilled') {
				const { upstream, models } = result.value;
				const u = this.upstreams.get(upstream.id)!;
				u.modelIds.clear();
				const upstreamModelList = (upstream as unknown as { modelList?: string[] }).modelList || [];

				log.debug(`${upstream.id}: fetched ${models.length} models, whitelist:`, upstreamModelList);

				for (const m of models) {
					if (!this.shouldIncludeModel(m.id, upstreamModelList)) {
						continue;
					}
					u.modelIds.add(m.id);
					freshRouting.set(m.id, upstream.id);
					freshModels.push(m);
				}
			}
		}

		log.debug('routing map built:', Array.from(freshRouting.keys()));
		this.pooledModels = freshModels;
		this.routingMap = freshRouting;
		this._initialized = true;
	}

	/**
	 * Apply a new configuration in-place, updating all mutable state.
	 * Clears existing upstreams and model cache, then refreshes model lists asynchronously.
	 */
	applyConfig(newConfig: Config): void {
		// Update derived config fields
		this.globalModelList = newConfig.modelList || [];
		this.streamingConfig = newConfig.streaming || { enabled: true, bufferWords: 0 };

		// Rebuild upstreams map
		this.upstreams.clear();
		for (const u of newConfig.upstreams) {
			this.upstreams.set(u.id, {
				...u,
				health: 'unknown',
				modelIds: new Set(),
			});
		}

		// Clear cached models and routing; mark as uninitialized
		this.pooledModels = [];
		this.routingMap.clear();
		this._initialized = false;

		// Async refresh to fetch new model lists
		this.refresh().catch((err) => {
			log.error('config reload: refresh failed:', err);
		});
	}

	private async fetchModels(
		upstream: Upstream,
	): Promise<{ upstream: Upstream; models: PooledModel[] }> {
		if (upstream.enabled === false) {
			log.debug(`skipping disabled upstream: ${upstream.id}`);
			return { upstream, models: [] };
		}

		log.debug(`fetching models from upstream ${upstream.id}`)

		const url = `${upstream.url}/v1/models`;
		const headers: Record<string, string> = { Accept: 'application/json' };
		injectAuth(headers, upstream.resolvedApiKey);

		const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
		if (!resp.ok) {
			throw new Error(`upstream ${upstream.id} /v1/models returned ${resp.status}`);
		}

		const body = (await resp.json()) as { data?: unknown[] };
		const data = Array.isArray(body.data) ? body.data : [];

		// console.log(`[model-pool] ${upstream.id} raw response:`, data.slice(0, 3).map(m => (m as Record<string, unknown>).id));

		const models: PooledModel[] = data
			.filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
			.map((m) => ({
				...(m as object),
				id: String(m['id'] ?? ''),
				object: String(m['object'] ?? 'model'),
				owned_by: String(m['owned_by'] ?? upstream.id),
				created: Number(m['created'] ?? 0),
				upstreamId: upstream.id,
				upstreamLabel: upstream.label,
			}))
			.filter((m) => m.id.length > 0);

		return { upstream, models };
	}
}
