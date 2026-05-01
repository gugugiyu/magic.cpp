/**
 * presetsStore - Reactive store for managing user presets.
 *
 * Tracks:
 * - List of presets loaded from the backend
 * - Active preset ID (persisted in localStorage)
 * - Loading and error states
 *
 * Applying a preset updates the global settings (system message + tools).
 */

import { browser } from '$app/environment';
import { PresetService } from '$lib/services/preset.service';
import { settingsStore } from '$lib/stores/settings.svelte';
import { SETTINGS_KEYS, DEFAULT_PRESET_LOCALSTORAGE_KEY } from '$lib/constants';
import { builtinToolFields } from '$lib/enums/builtin-tools';
import type { PresetView, PresetInput } from '@shared/types/presets';

const ACTIVE_PRESET_LOCALSTORAGE_KEY = 'activePresetId';

class PresetsStore {
	#presets = $state<PresetView[]>([]);
	#isLoading = $state(false);
	#error = $state<string | null>(null);
	#activePresetId = $state<string | null>(this.#loadActiveId());
	#defaultPresetId = $state<string | null>(this.#loadDefaultPresetId());
	#loadRequestId = 0;
	#lastLoadTime = 0;

	// ─── LocalStorage persistence ──────────────────────────────────────

	#loadActiveId(): string | null {
		if (!browser) return null;
		try {
			return localStorage.getItem(ACTIVE_PRESET_LOCALSTORAGE_KEY);
		} catch {
			return null;
		}
	}

	#saveActiveId(): void {
		if (!browser) return;
		try {
			if (this.#activePresetId) {
				localStorage.setItem(ACTIVE_PRESET_LOCALSTORAGE_KEY, this.#activePresetId);
			} else {
				localStorage.removeItem(ACTIVE_PRESET_LOCALSTORAGE_KEY);
			}
		} catch {
			// ignore
		}
	}

	#loadDefaultPresetId(): string | null {
		if (!browser) return null;
		try {
			return localStorage.getItem(DEFAULT_PRESET_LOCALSTORAGE_KEY);
		} catch {
			return null;
		}
	}

	#saveDefaultPresetId(): void {
		if (!browser) return;
		try {
			if (this.#defaultPresetId) {
				localStorage.setItem(DEFAULT_PRESET_LOCALSTORAGE_KEY, this.#defaultPresetId);
			} else {
				localStorage.removeItem(DEFAULT_PRESET_LOCALSTORAGE_KEY);
			}
		} catch {
			// ignore
		}
	}

	// ─── Reactive getters ─────────────────────────────────────────────

	get presets(): PresetView[] {
		return this.#presets;
	}

	get isLoading(): boolean {
		return this.#isLoading;
	}

	get error(): string | null {
		return this.#error;
	}

	get activePresetId(): string | null {
		return this.#activePresetId;
	}

	get activePreset(): PresetView | undefined {
		if (!this.#activePresetId) return undefined;
		return this.#presets.find((p) => p.id === this.#activePresetId);
	}

	get defaultPresetId(): string | null {
		return this.#defaultPresetId;
	}

	get defaultPreset(): PresetView | undefined {
		if (!this.#defaultPresetId) return undefined;
		return this.#presets.find((p) => p.id === this.#defaultPresetId);
	}

	// ─── CRUD Operations ──────────────────────────────────────────────

	/** Load all presets from the backend. */
	async loadPresets(): Promise<void> {
		this.#isLoading = true;
		this.#error = null;

		const requestId = ++this.#loadRequestId;

		try {
			const presets = await PresetService.listPresets();

			if (requestId !== this.#loadRequestId) return;

			this.#presets = presets;
			this.#lastLoadTime = Date.now();

			// Auto-apply default preset if no preset is active
			if (!this.#activePresetId && this.#defaultPresetId) {
				const defaultPreset = this.#presets.find((p) => p.id === this.#defaultPresetId);
				if (defaultPreset) {
					this.applyPreset(this.#defaultPresetId);
				}
			}
		} catch (err) {
			if (requestId !== this.#loadRequestId) return;
			this.#error = (err as Error).message;
			console.error('[presetsStore] Failed to load presets:', err);
		} finally {
			if (requestId === this.#loadRequestId) {
				this.#isLoading = false;
			}
		}
	}

	/**
	 * Load presets only if stale (older than ttlMs) or never loaded.
	 */
	async loadPresetsIfStale(ttlMs: number): Promise<void> {
		const isStale = Date.now() - this.#lastLoadTime > ttlMs;
		const isEmpty = this.#presets.length === 0;
		if (isStale || isEmpty) {
			await this.loadPresets();
		}
	}

	/** Create a new preset and reload the list. */
	async createPreset(input: PresetInput): Promise<PresetView> {
		const wasEmpty = this.#presets.length === 0;
		const preset = await PresetService.createPreset(input);
		await this.loadPresets();
		// Auto-activate the very first preset
		if (wasEmpty) {
			this.applyPreset(preset.id);
		}
		return preset;
	}

	/** Update an existing preset and reload the list. */
	async updatePreset(id: string, input: PresetInput): Promise<PresetView> {
		const preset = await PresetService.updatePreset(id, input);
		// Update local list in place for immediate feedback
		const idx = this.#presets.findIndex((p) => p.id === id);
		if (idx !== -1) {
			this.#presets[idx] = preset;
		}
		await this.loadPresets();
		return preset;
	}

	/** Delete a preset and reload the list. */
	async deletePreset(id: string): Promise<void> {
		const wasActive = this.#activePresetId === id;
		const wasDefault = this.#defaultPresetId === id;

		await PresetService.deletePreset(id);

		if (wasActive) {
			this.clearActivePreset();
		}
		if (wasDefault) {
			this.clearDefaultPreset();
		}

		await this.loadPresets();
	}

	/** Find a preset by ID. */
	findPreset(id: string): PresetView | undefined {
		return this.#presets.find((p) => p.id === id);
	}

	// ─── Activation ───────────────────────────────────────────────────

	/**
	 * Apply a preset globally.
	 * Updates system message and built-in tool settings.
	 */
	applyPreset(id: string): void {
		const preset = this.findPreset(id);
		if (!preset) {
			console.warn(`[presetsStore] Preset "${id}" not found`);
			return;
		}

		this.#activePresetId = id;
		this.#saveActiveId();

		const updates: Partial<SettingsConfigType> = {
			[SETTINGS_KEYS.SYSTEM_MESSAGE]: preset.systemPrompt
		};

		for (const tool of builtinToolFields) {
			updates[tool.key as keyof SettingsConfigType] = preset.enabledTools.includes(tool.key);
		}

		settingsStore.updateMultipleConfig(updates);
	}

	/**
	 * Clear the active preset and apply default if one exists.
	 */
	clearActivePreset(): void {
		this.#activePresetId = null;
		this.#saveActiveId();

		// Apply default preset if one exists
		if (this.#defaultPresetId) {
			const defaultPreset = this.#presets.find((p) => p.id === this.#defaultPresetId);
			if (defaultPreset) {
				this.applyPreset(this.#defaultPresetId);
				return;
			}
		}

		// No default preset, clear system message to empty
		settingsStore.updateConfig(SETTINGS_KEYS.SYSTEM_MESSAGE, '');
	}

	/**
	 * Set a preset as the default (persisted in localStorage).
	 */
	setDefaultPreset(id: string): void {
		const preset = this.findPreset(id);
		if (!preset) {
			console.warn(`[presetsStore] Preset "${id}" not found, cannot set as default`);
			return;
		}
		this.#defaultPresetId = id;
		this.#saveDefaultPresetId();
	}

	/**
	 * Clear the default preset.
	 */
	clearDefaultPreset(): void {
		this.#defaultPresetId = null;
		this.#saveDefaultPresetId();
	}
}

export const presetsStore = new PresetsStore();
