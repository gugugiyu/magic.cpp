/**
 * HTTP handlers for preset CRUD operations.
 *
 * Endpoints:
 *   GET    /api/presets          — List all presets
 *   POST   /api/presets          — Create a new preset
 *   GET    /api/presets/:id      — Read a single preset
 *   PUT    /api/presets/:id      — Update an existing preset
 *   DELETE /api/presets/:id      — Delete a preset
 */

import type { DrizzleDB } from '../database/index.ts';
import {
	createPreset,
	getPreset,
	getAllPresets,
	updatePreset,
	deletePreset
} from '../database/queries/presets.ts';
import type { Preset } from '../database/schema-drizzle.ts';

function generateId(): string {
	return crypto.randomUUID();
}

function toPresetResponse(preset: Preset) {
	return {
		...preset,
		enabledTools: JSON.parse(preset.enabledTools),
		commonPrompts: JSON.parse(preset.commonPrompts)
	};
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export async function handleListPresets(db: DrizzleDB): Promise<Response> {
	try {
		const presets = getAllPresets(db);
		return Response.json(presets.map(toPresetResponse), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return Response.json(
			{ error: 'Failed to list presets', detail: (err as Error).message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export async function handleCreatePreset(req: Request, db: DrizzleDB): Promise<Response> {
	try {
		const body = await req.json();
		const { name, systemPrompt, enabledTools, commonPrompts } = body as {
			name?: string;
			systemPrompt?: string;
			enabledTools?: string[];
			commonPrompts?: string[];
		};

		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return Response.json(
				{ error: 'Missing or invalid "name" field (string required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (systemPrompt === undefined || typeof systemPrompt !== 'string') {
			return Response.json(
				{ error: 'Missing or invalid "systemPrompt" field (string required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (enabledTools !== undefined && !isStringArray(enabledTools)) {
			return Response.json(
				{ error: 'Invalid "enabledTools" field (array of strings required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (commonPrompts !== undefined && !isStringArray(commonPrompts)) {
			return Response.json(
				{ error: 'Invalid "commonPrompts" field (array of strings required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const preset: Preset = {
			id: generateId(),
			name: name.trim(),
			systemPrompt: systemPrompt.trim(),
			enabledTools: JSON.stringify(enabledTools ?? []),
			commonPrompts: JSON.stringify(commonPrompts ?? []),
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		createPreset(db, preset);

		return Response.json(toPresetResponse(preset), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return Response.json(
			{ error: 'Failed to create preset', detail: (err as Error).message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export async function handleGetPreset(db: DrizzleDB, id: string): Promise<Response> {
	try {
		const preset = getPreset(db, id);
		if (!preset) {
			return Response.json(
				{ error: 'Not found', detail: `Preset "${id}" does not exist` },
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}
		return Response.json(toPresetResponse(preset), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return Response.json(
			{ error: 'Failed to get preset', detail: (err as Error).message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export async function handleUpdatePreset(req: Request, db: DrizzleDB, id: string): Promise<Response> {
	try {
		const body = await req.json();
		const { name, systemPrompt, enabledTools, commonPrompts } = body as {
			name?: string;
			systemPrompt?: string;
			enabledTools?: string[];
			commonPrompts?: string[];
		};

		const existing = getPreset(db, id);
		if (!existing) {
			return Response.json(
				{ error: 'Not found', detail: `Preset "${id}" does not exist` },
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
			return Response.json(
				{ error: 'Invalid "name" field (non-empty string required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (enabledTools !== undefined && !isStringArray(enabledTools)) {
			return Response.json(
				{ error: 'Invalid "enabledTools" field (array of strings required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (commonPrompts !== undefined && !isStringArray(commonPrompts)) {
			return Response.json(
				{ error: 'Invalid "commonPrompts" field (array of strings required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const updates: Partial<Omit<Preset, 'id'>> = {};
		if (name !== undefined) updates.name = name.trim();
		if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt.trim();
		if (enabledTools !== undefined) updates.enabledTools = JSON.stringify(enabledTools);
		if (commonPrompts !== undefined) updates.commonPrompts = JSON.stringify(commonPrompts);

		updatePreset(db, id, updates);

		const updated = getPreset(db, id)!;
		return Response.json(toPresetResponse(updated), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return Response.json(
			{ error: 'Failed to update preset', detail: (err as Error).message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export async function handleDeletePreset(db: DrizzleDB, id: string): Promise<Response> {
	try {
		const existing = getPreset(db, id);
		if (!existing) {
			return Response.json(
				{ error: 'Not found', detail: `Preset "${id}" does not exist` },
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}

		deletePreset(db, id);
		return new Response(null, { status: 204 });
	} catch (err) {
		return Response.json(
			{ error: 'Failed to delete preset', detail: (err as Error).message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}
