/**
 * Preset service — HTTP client for preset CRUD operations.
 *
 * Communicates with the backend preset API endpoints.
 */

import type { PresetView, PresetInput } from '@shared/types/presets';
import {
	getAllPresets,
	getPreset,
	createPreset,
	updatePreset,
	deletePreset
} from '$lib/api/presets.api';

export class PresetService {
	/** List all presets from the backend. */
	static async listPresets(): Promise<PresetView[]> {
		return getAllPresets();
	}

	/** Get a single preset by ID. */
	static async readPreset(id: string): Promise<PresetView> {
		return getPreset(id);
	}

	/** Create a new preset. */
	static async createPreset(input: PresetInput): Promise<PresetView> {
		return createPreset(input);
	}

	/** Update an existing preset. */
	static async updatePreset(id: string, input: PresetInput): Promise<PresetView> {
		return updatePreset(id, input);
	}

	/** Delete a preset by ID. */
	static async deletePreset(id: string): Promise<void> {
		return deletePreset(id);
	}
}
