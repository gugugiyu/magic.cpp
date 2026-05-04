/**
 * Models API service.
 * Handles model listing, loading, and unloading operations.
 */

import { apiFetch, apiPost } from '$lib/utils/api-fetch';
import { routeUrl, RouteHandlers } from '$lib/utils/api-routes';

/**
 * List all models (OpenAI-compatible endpoint).
 */
export async function getV1Models(): Promise<ApiModelListResponse> {
	return apiFetch<ApiModelListResponse>(routeUrl(RouteHandlers.getV1Models));
}

/**
 * List all models with detailed metadata (ROUTER mode).
 */
export async function getModels(): Promise<ApiRouterModelsListResponse> {
	return apiFetch<ApiRouterModelsListResponse>(routeUrl(RouteHandlers.getModels));
}

/**
 * Load a model.
 */
export async function loadModel(
	modelId: string,
	extraArgs?: string[]
): Promise<ApiRouterModelsLoadResponse> {
	const payload: { model: string; extra_args?: string[] } = {
		model: modelId
	};
	if (extraArgs && extraArgs.length > 0) {
		payload.extra_args = extraArgs;
	}

	return apiPost<ApiRouterModelsLoadResponse>(routeUrl(RouteHandlers.loadModel), payload);
}

/**
 * Unload a model.
 */
export async function unloadModel(modelId: string): Promise<ApiRouterModelsUnloadResponse> {
	return apiPost<ApiRouterModelsUnloadResponse>(routeUrl(RouteHandlers.unloadModel), {
		model: modelId
	});
}
