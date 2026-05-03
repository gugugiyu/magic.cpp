/**
 * poolStatusStore - Reactive store for connection pool status
 *
 * This store tracks the upstream connection pool status from /health endpoint.
 * It provides real-time visibility into how many upstreams are configured and connected.
 *
 * **Architecture:**
 * - Fetches from `/health` endpoint (same as serverStore)
 * - Auto-refreshes when serverStore fetches successfully
 * - Exposes upstream counts for UI badges
 */
class PoolStatusStore {
	/**
	 *
	 *
	 * State
	 *
	 *
	 */

	total = $state<number>(0);
	connected = $state<number>(0);
	loading = $state(false);
	error = $state<string | null>(null);

	/**
	 *
	 *
	 * Getters
	 *
	 *
	 */

	get isHealthy(): boolean {
		return this.connected > 0 && this.connected === this.total;
	}

	get isDegraded(): boolean {
		return this.connected > 0 && this.connected < this.total;
	}

	get isDown(): boolean {
		return this.connected === 0 && this.total > 0;
	}

	get statusLabel(): string {
		if (this.loading) return 'Loading...';
		if (this.total === 0) return 'No upstreams';
		return `${this.connected}/${this.total} upstreams connected`;
	}

	/**
	 *
	 *
	 * Data Fetching
	 *
	 *
	 */

	async fetch(): Promise<void> {
		this.loading = true;
		this.error = null;

		try {
			const response = await fetch('./health');
			if (!response.ok) {
				throw new Error(`Health check failed with status ${response.status}`);
			}

			const data = await response.json();
			this.updateFromHealth(data);
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Failed to fetch pool status';
			console.warn('Failed to fetch pool status:', error);
		} finally {
			this.loading = false;
		}
	}

	/**
	 * Update from health data (called by serverStore after successful fetch)
	 */
	updateFromHealth(data: { upstreams?: Array<{ health: string }> }): void {
		const upstreams = data.upstreams ?? [];
		this.total = upstreams.length;
		this.connected = upstreams.filter((u) => u.health === 'healthy').length;
		this.error = null;
	}

	clear(): void {
		this.total = 0;
		this.connected = 0;
		this.loading = false;
		this.error = null;
	}
}

export const poolStatusStore = new PoolStatusStore();

export const poolTotal = () => poolStatusStore.total;
export const poolConnected = () => poolStatusStore.connected;
export const poolLoading = () => poolStatusStore.loading;
export const poolError = () => poolStatusStore.error;
export const poolIsHealthy = () => poolStatusStore.isHealthy;
export const poolIsDegraded = () => poolStatusStore.isDegraded;
export const poolIsDown = () => poolStatusStore.isDown;
export const poolStatusLabel = () => poolStatusStore.statusLabel;
