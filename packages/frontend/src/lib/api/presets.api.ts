/**
 * Preset API service.
 * Replaces DatabaseService with HTTP API calls to backend SQLite.
 */

import { apiFetch, apiPost } from '$lib/utils/api-fetch';
import { routeUrl, RouteHandlers } from '$lib/utils/api-routes';
import type { PresetView, PresetInput } from '@shared/types/presets';

/**
 * Parse a raw Preset (with JSON-stringified fields) into a PresetView.
 */
function parsePreset(raw: unknown): PresetView {
	const p = raw as Record<string, unknown>;
	return {
		id: String(p.id),
		name: String(p.name),
		systemPrompt: String(p.systemPrompt),
		enabledTools: coerceStringArray(p.enabledTools),
		commonPrompts: coerceStringArray(p.commonPrompts),
		createdAt: Number(p.createdAt),
		updatedAt: Number(p.updatedAt)
	};
}

function coerceStringArray(value: unknown): string[] {
	if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
		return value;
	}
	try {
		const parsed = JSON.parse(String(value ?? '[]'));
		if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
			return parsed;
		}
	} catch {
		// fall through
	}
	return [];
}

/**
 * List all presets.
 */
export async function getAllPresets(): Promise<PresetView[]> {
	const res = await apiFetch<unknown[]>(routeUrl(RouteHandlers.listPresets));
	return res.map(parsePreset);
}

/**
 * Get a single preset by ID.
 */
export async function getPreset(id: string): Promise<PresetView> {
	const res = await apiFetch<unknown>(routeUrl(RouteHandlers.getPreset, { id }));
	return parsePreset(res);
}

/**
 * Create a new preset.
 */
export async function createPreset(input: PresetInput): Promise<PresetView> {
	const res = await apiPost<unknown, PresetInput>(routeUrl(RouteHandlers.createPreset), input);
	return parsePreset(res);
}

/**
 * Update an existing preset.
 */
export async function updatePreset(id: string, input: PresetInput): Promise<PresetView> {
	const res = await apiFetch<unknown>(routeUrl(RouteHandlers.updatePreset, { id }), {
		method: 'PUT',
		body: JSON.stringify(input)
	});
	return parsePreset(res);
}

/**
 * Delete a preset.
 */
export async function deletePreset(id: string): Promise<void> {
	await apiFetch(routeUrl(RouteHandlers.deletePreset, { id }), { method: 'DELETE' });
}
