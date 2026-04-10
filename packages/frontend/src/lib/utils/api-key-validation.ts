import { base } from '$app/paths';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';

/**
 * Validates API key by making a request to the server props endpoint
 * Throws SvelteKit errors for authentication failures or server issues
 * Note: API key is handled centrally by the backend
 */
export async function validateApiKey(fetch: typeof globalThis.fetch): Promise<void> {
	if (!browser) {
		return;
	}

	try {
		const response = await fetch(`${base}/props`);

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				throw error(401, 'Access denied');
			}

			console.warn(`Server responded with status ${response.status} during API key validation`);
			return;
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		console.warn('Cannot connect to server for API key validation:', err);
	}
}
