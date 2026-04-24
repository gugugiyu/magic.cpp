/**
 * Shared preset type definitions.
 *
 * Presets are user-defined personas that bundle a system prompt,
 * enabled built-in tools, and a list of common reusable prompts.
 */

/** A fully defined preset. */
export interface Preset {
	/** Unique identifier (UUID). */
	id: string;

	/** Display name for the preset. */
	name: string;

	/** System prompt applied when this preset is active. */
	systemPrompt: string;

	/** JSON-stringified array of SETTINGS_KEYS for enabled built-in tools. */
	enabledTools: string;

	/** JSON-stringified array of common reusable prompt strings. */
	commonPrompts: string;

	/** Creation timestamp (ms since epoch). */
	createdAt: number;

	/** Last update timestamp (ms since epoch). */
	updatedAt: number;
}

/** DTO used when creating or updating a preset from the frontend. */
export interface PresetInput {
	name: string;
	systemPrompt: string;
	enabledTools: string[];
	commonPrompts: string[];
}

/** Client-side view of a preset with parsed arrays. */
export interface PresetView {
	id: string;
	name: string;
	systemPrompt: string;
	enabledTools: string[];
	commonPrompts: string[];
	createdAt: number;
	updatedAt: number;
}
