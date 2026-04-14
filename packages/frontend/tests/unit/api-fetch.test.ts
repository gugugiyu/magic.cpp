import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SvelteKit modules
vi.mock('$app/paths', () => ({
	base: '/app'
}));

vi.mock('$lib/stores/server-endpoint.svelte', () => ({
	serverEndpointStore: {
		isDefault: () => true,
		getBaseUrl: () => 'http://localhost:3000'
	}
}));

vi.mock('$lib/utils/api-headers', () => ({
	getJsonHeaders: () => ({ 'Content-Type': 'application/json' })
}));

describe('apiFetch', () => {
	let apiFetch: <T>(
		path: string,
		options?: import('$lib/utils/api-fetch').ApiFetchOptions
	) => Promise<T>;
	// let serverEndpointStore: string;

	beforeEach(async () => {
		vi.resetModules();

		global.fetch = vi.fn();

		const mod = await import('$lib/utils/api-fetch');
		apiFetch = mod.apiFetch;
	});

	it('makes a GET request with JSON headers', async () => {
		const mockResponse = { data: 'test' };
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve(mockResponse)
		} as Response);

		const result = await apiFetch('/api/test');

		expect(global.fetch).toHaveBeenCalledWith(
			'/app/api/test',
			expect.objectContaining({
				headers: { 'Content-Type': 'application/json' }
			})
		);
		expect(result).toEqual(mockResponse);
	});

	it('uses absolute URL when path starts with http://', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		} as Response);

		await apiFetch('http://external-api.com/data');

		expect(global.fetch).toHaveBeenCalledWith('http://external-api.com/data', expect.any(Object));
	});

	it('uses absolute URL when path starts with https://', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		} as Response);

		await apiFetch('https://external-api.com/data');

		expect(global.fetch).toHaveBeenCalledWith('https://external-api.com/data', expect.any(Object));
	});

	it('merges custom headers with default headers', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		} as Response);

		await apiFetch('/api/test', {
			headers: { 'X-Custom': 'value' }
		});

		expect(global.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: {
					'Content-Type': 'application/json',
					'X-Custom': 'value'
				}
			})
		);
	});

	it('throws error on non-OK response with JSON error body', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: false,
			status: 400,
			statusText: 'Bad Request',
			json: () => Promise.resolve({ error: { message: 'Invalid request' } })
		} as Response);

		await expect(apiFetch('/api/test')).rejects.toThrow('Invalid request');
	});

	it('throws error with status text when no JSON error body', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: false,
			status: 500,
			statusText: 'Internal Server Error',
			json: () => Promise.reject(new Error('Not JSON'))
		} as Response);

		await expect(apiFetch('/api/test')).rejects.toThrow(
			'Request failed: 500 Internal Server Error'
		);
	});

	it('returns undefined for 204 No Content', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 204
		} as Response);

		const result = await apiFetch('/api/delete');
		expect(result).toBeUndefined();
	});

	it('sets up timeout with AbortController when no signal provided', async () => {
		// Verify that the function creates an internal AbortController
		// and sets up a timeout when no external signal is provided.
		// The fetch mock resolves immediately to verify the setup path works.
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		} as Response);

		// This should not throw — the timeout is set up but doesn't fire
		// before fetch resolves
		await expect(apiFetch('/api/test')).resolves.toEqual({});
	});

	it('uses provided abort signal', async () => {
		const controller = new AbortController();

		vi.mocked(global.fetch).mockImplementationOnce(() => {
			// Immediately abort when signal is already aborted
			if (controller.signal.aborted) {
				return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
			}
			return new Promise<Response>(() => {});
		});

		// Abort before calling
		controller.abort();

		await expect(apiFetch('/api/test', { signal: controller.signal })).rejects.toThrow(
			'Request timed out after 30s'
		);
	});

	it('handles error.message format from API', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ message: 'Something went wrong' })
		} as Response);

		await expect(apiFetch('/api/test')).rejects.toThrow('Something went wrong');
	});

	it('handles error string format from API', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'Simple error' })
		} as Response);

		await expect(apiFetch('/api/test')).rejects.toThrow('Simple error');
	});
});

describe('apiFetchWithParams', () => {
	let apiFetchWithParams: <T>(
		basePath: string,
		params: Record<string, string>,
		options?: import('$lib/utils/api-fetch').ApiFetchOptions
	) => Promise<T>;

	beforeEach(async () => {
		vi.resetModules();

		global.fetch = vi.fn();

		// Mock window.location.href for apiFetchWithParams
		Object.defineProperty(global, 'window', {
			value: { location: { href: 'http://localhost:3000' } },
			configurable: true
		});

		vi.mock('$lib/stores/server-endpoint.svelte', () => ({
			serverEndpointStore: {
				isDefault: () => true,
				getBaseUrl: () => 'http://localhost:3000'
			}
		}));

		const mod = await import('$lib/utils/api-fetch');
		apiFetchWithParams = mod.apiFetchWithParams;
	});

	it('appends query parameters to URL', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ data: 'test' })
		} as Response);

		await apiFetchWithParams('/api/items', { page: '1', limit: '10' });

		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining('page=1'),
			expect.any(Object)
		);
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining('limit=10'),
			expect.any(Object)
		);
	});

	it('skips undefined and null parameter values', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		} as Response);

		await apiFetchWithParams('/api/items', {
			page: '1',
			filter: undefined as unknown as string,
			sort: null as unknown as string
		});

		const callUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
		expect(callUrl).toContain('page=1');
		expect(callUrl).not.toContain('filter');
		expect(callUrl).not.toContain('sort');
	});

	it('makes request with JSON headers', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		} as Response);

		await apiFetchWithParams('/api/test', {});

		expect(global.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: { 'Content-Type': 'application/json' }
			})
		);
	});

	it('throws on error response', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: false,
			status: 404,
			json: () => Promise.resolve({ error: { message: 'Not found' } })
		} as Response);

		await expect(apiFetchWithParams('/api/missing', {})).rejects.toThrow('Not found');
	});
});

describe('apiPost', () => {
	let apiPost: <T, B = unknown>(
		path: string,
		body: B,
		options?: import('$lib/utils/api-fetch').ApiFetchOptions
	) => Promise<T>;

	beforeEach(async () => {
		vi.resetModules();

		global.fetch = vi.fn();

		const mod = await import('$lib/utils/api-fetch');
		apiPost = mod.apiPost;
	});

	it('makes a POST request with JSON body', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ created: true })
		} as Response);

		const result = await apiPost('/api/items', { name: 'Test' });

		expect(global.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ name: 'Test' })
			})
		);
		expect(result).toEqual({ created: true });
	});

	it('accepts additional fetch options', async () => {
		vi.mocked(global.fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		} as Response);

		await apiPost(
			'/api/items',
			{ name: 'Test' },
			{
				headers: { 'X-Trace': 'abc123' }
			}
		);

		expect(global.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'Content-Type': 'application/json',
					'X-Trace': 'abc123'
				})
			})
		);
	});
});
