/**
 * Integration tests: ModelsService lifecycle
 *
 * Covers:
 *  - parseModelId parsing across a variety of real-world model ID formats
 *  - isModelLoaded / isModelLoading status helpers
 *  - list() / load() / unload() with mocked fetch (HTTP boundary)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServerModelStatus } from '$lib/enums';

vi.mock('$lib/stores/server-endpoint.svelte', () => ({
	serverEndpointStore: {
		isDefault: () => true,
		getBaseUrl: () => 'http://localhost:8080'
	}
}));

vi.mock('$lib/utils/api-headers', () => ({
	getJsonHeaders: () => ({ 'Content-Type': 'application/json' })
}));

// Prevent lucide icon .svelte files from being compiled in Node env
// ($lib/constants barrel imports @lucide/svelte icons via settings-config.ts and mcp.ts)
vi.mock('@lucide/svelte', () => ({}));

// Prevent $app/paths from triggering SvelteKit's root.svelte compilation
// ($lib/utils barrel includes api-fetch.ts which imports { base } from '$app/paths')
vi.mock('$app/paths', () => ({ base: '' }));

const { ModelsService } = await import('$lib/services/models.service');

// ─────────────────────────────────────────────────────────────────────────────
// parseModelId — pure logic, no mocks needed
// ─────────────────────────────────────────────────────────────────────────────

describe('ModelsService.parseModelId', () => {
	it('parses a simple model name with no org or quantization', () => {
		const result = ModelsService.parseModelId('llama-3-8b');
		expect(result.raw).toBe('llama-3-8b');
		expect(result.orgName).toBeNull();
		expect(result.quantization).toBeNull();
	});

	it('parses org/model format', () => {
		const result = ModelsService.parseModelId('meta-llama/Llama-3-8B');
		expect(result.orgName).toBe('meta-llama');
		expect(result.modelName).toBe('Llama-3-8B');
	});

	it('parses colon-separated quantization', () => {
		const result = ModelsService.parseModelId('llama3:Q4_K_M');
		expect(result.quantization).toBe('Q4_K_M');
	});

	it('parses dash-separated quantization at end', () => {
		const result = ModelsService.parseModelId('Llama-3-8B-Q4_K_M');
		expect(result.quantization).toBe('Q4_K_M');
		expect(result.modelName).toContain('Llama');
	});

	it('parses dot-separated quantization', () => {
		const result = ModelsService.parseModelId('model-name.Q4_K_M');
		expect(result.quantization).toBe('Q4_K_M');
	});

	it('parses org/model-params-quantization', () => {
		const result = ModelsService.parseModelId('meta-llama/Llama-3-8B-Instruct-Q4_K_M');
		expect(result.orgName).toBe('meta-llama');
		expect(result.params).toBe('8B');
		expect(result.quantization).toBe('Q4_K_M');
	});

	it('parses model with activated params (MoE format)', () => {
		const result = ModelsService.parseModelId('Mixtral-8x7B-Instruct-Q4_K_M');
		expect(result.params).toBe('8X7B');
		expect(result.quantization).toBe('Q4_K_M');
	});

	it('parses UD-prefixed custom quantization', () => {
		const result = ModelsService.parseModelId('model-7B-UD-Q8_K_XL');
		expect(result.quantization).toContain('Q8_K_XL');
	});

	it('parses F16 quantization', () => {
		const result = ModelsService.parseModelId('model-7B-F16');
		expect(result.quantization).toBe('F16');
	});

	it('parses BF16 quantization', () => {
		const result = ModelsService.parseModelId('model-7B-BF16');
		expect(result.quantization).toBe('BF16');
	});

	it('preserves the raw model ID in result', () => {
		const id = 'some/complex-model-3B-Q4_K_M';
		const result = ModelsService.parseModelId(id);
		expect(result.raw).toBe(id);
	});

	it('handles empty string gracefully', () => {
		const result = ModelsService.parseModelId('');
		expect(result.raw).toBe('');
		expect(result.orgName).toBeNull();
		expect(result.modelName).toBeNull();
	});

	it('handles model with multiple tags', () => {
		const result = ModelsService.parseModelId('Llama-3-8B-Instruct-Chat-Q4_K_M');
		expect(result.params).toBe('8B');
		expect(result.quantization).toBe('Q4_K_M');
		expect(result.tags).toContain('Instruct');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// isModelLoaded / isModelLoading — pure status helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('ModelsService.isModelLoaded / isModelLoading', () => {
	function makeModelEntry(status: ServerModelStatus): ApiModelDataEntry {
		return {
			id: 'test-model',
			object: 'model',
			created: 0,
			owned_by: 'test',
			status: { value: status }
		} as ApiModelDataEntry;
	}

	it('isModelLoaded returns true for LOADED status', () => {
		expect(ModelsService.isModelLoaded(makeModelEntry(ServerModelStatus.LOADED))).toBe(true);
	});

	it('isModelLoaded returns false for LOADING status', () => {
		expect(ModelsService.isModelLoaded(makeModelEntry(ServerModelStatus.LOADING))).toBe(false);
	});

	it('isModelLoaded returns false for FAILED status', () => {
		expect(ModelsService.isModelLoaded(makeModelEntry(ServerModelStatus.FAILED))).toBe(false);
	});

	it('isModelLoading returns true for LOADING status', () => {
		expect(ModelsService.isModelLoading(makeModelEntry(ServerModelStatus.LOADING))).toBe(true);
	});

	it('isModelLoading returns false for LOADED status', () => {
		expect(ModelsService.isModelLoading(makeModelEntry(ServerModelStatus.LOADED))).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// list() — HTTP boundary with mocked fetch
// ─────────────────────────────────────────────────────────────────────────────

describe('ModelsService.list with mocked fetch', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
	});

	function mockFetchOk(body: unknown) {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve(body)
		} as Response);
	}

	function mockFetchError(status: number, message: string) {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status,
			statusText: message,
			json: () => Promise.resolve({ error: { message } })
		} as unknown as Response);
	}

	it('returns model list on success', async () => {
		const mockResponse: ApiModelListResponse = {
			object: 'list',
			data: [
				{
					id: 'llama-3-8b',
					object: 'model',
					created: 1234567890,
					owned_by: 'meta-llama'
				} as ApiModelDataEntry
			]
		};

		mockFetchOk(mockResponse);

		const result = await ModelsService.list();
		expect(result.data).toHaveLength(1);
		expect(result.data[0].id).toBe('llama-3-8b');
	});

	it('returns multiple models', async () => {
		const mockResponse: ApiModelListResponse = {
			object: 'list',
			data: [
				{ id: 'model-a', object: 'model', created: 0, owned_by: 'test' } as ApiModelDataEntry,
				{ id: 'model-b', object: 'model', created: 0, owned_by: 'test' } as ApiModelDataEntry
			]
		};

		mockFetchOk(mockResponse);

		const result = await ModelsService.list();
		expect(result.data).toHaveLength(2);
	});

	it('throws on server error', async () => {
		mockFetchError(500, 'Internal Server Error');
		await expect(ModelsService.list()).rejects.toThrow();
	});

	it('returns empty data array when no models available', async () => {
		mockFetchOk({ object: 'list', data: [] });
		const result = await ModelsService.list();
		expect(result.data).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// load() — router-mode model loading
// ─────────────────────────────────────────────────────────────────────────────

describe('ModelsService.load with mocked fetch', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it('sends POST with model id in request body', async () => {
		const mockResponse = { success: true, model: 'llama-3-8b' };
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve(mockResponse)
		} as Response);

		await ModelsService.load('llama-3-8b');

		const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		const body = JSON.parse(requestInit.body);
		expect(body.model).toBe('llama-3-8b');
	});

	it('includes extra_args when provided', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		} as Response);

		await ModelsService.load('some-model', ['--ctx-size', '4096']);

		const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		const body = JSON.parse(requestInit.body);
		expect(body.extra_args).toEqual(['--ctx-size', '4096']);
	});

	it('does not include extra_args when empty array is provided', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		} as Response);

		await ModelsService.load('some-model', []);

		const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		const body = JSON.parse(requestInit.body);
		expect(body.extra_args).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// unload() — router-mode model unloading
// ─────────────────────────────────────────────────────────────────────────────

describe('ModelsService.unload with mocked fetch', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it('sends POST with model id in request body', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ success: true })
		} as Response);

		await ModelsService.unload('llama-3-8b');

		const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		const body = JSON.parse(requestInit.body);
		expect(body.model).toBe('llama-3-8b');
	});

	it('throws on server error', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			statusText: 'Not Found',
			json: () => Promise.resolve({ error: { message: 'Model not found' } })
		} as unknown as Response);

		await expect(ModelsService.unload('nonexistent-model')).rejects.toThrow('Model not found');
	});
});
