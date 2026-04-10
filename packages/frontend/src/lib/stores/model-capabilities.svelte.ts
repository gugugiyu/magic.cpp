/**
 * modelCapabilityStore - Per-model capability overrides.
 *
 * Allows users to force-enable vision/audio capabilities that the server
 * didn't report (false-negative detection), and to explicitly mark a model
 * as not supporting tool-calling (which currently has no server detection).
 *
 * Semantics:
 *   vision / audio  — force-enable only: override `false` → `true`; cannot suppress server-reported `true`
 *   toolCalling     — user-controlled: defaults to `true` (current behaviour); can be set to `false`
 *
 * Stored flat in localStorage keyed by model ID (e.g. "qwen/qwen3-8b").
 * Same model ID always resolves the same override regardless of endpoint.
 */

import { browser } from '$app/environment';
import { MODEL_CAPABILITIES_LOCALSTORAGE_KEY } from '$lib/constants';

export interface ModelCapabilityOverride {
	/** Explicitly disable tool-calling for this model. `undefined` = enabled (default). */
	toolCalling?: boolean;
	/** Force-enable vision when server reports false. `undefined` = use server value. */
	vision?: boolean;
	/** Force-enable audio when server reports false. `undefined` = use server value. */
	audio?: boolean;
}

type ModelCapabilitiesMap = Record<string, ModelCapabilityOverride>;

class ModelCapabilityStore {
	#overrides = $state<ModelCapabilitiesMap>(this.#loadFromStorage());

	#loadFromStorage(): ModelCapabilitiesMap {
		if (!browser) return {};
		try {
			const stored = localStorage.getItem(MODEL_CAPABILITIES_LOCALSTORAGE_KEY);
			if (stored) return JSON.parse(stored) as ModelCapabilitiesMap;
		} catch {
			// ignore
		}
		return {};
	}

	#saveToStorage(): void {
		if (!browser) return;
		try {
			localStorage.setItem(MODEL_CAPABILITIES_LOCALSTORAGE_KEY, JSON.stringify(this.#overrides));
		} catch {
			// ignore
		}
	}

	getOverride(modelId: string): ModelCapabilityOverride {
		return this.#overrides[modelId] ?? {};
	}

	/** Returns false only when the user has explicitly disabled tool-calling; defaults to true. */
	isToolCallingEnabled(modelId: string): boolean {
		return this.#overrides[modelId]?.toolCalling !== false;
	}

	/**
	 * Effective vision capability: true if server reported true OR user force-enabled.
	 * @param serverDetected - the value reported by /props
	 */
	isVisionEnabled(modelId: string, serverDetected: boolean): boolean {
		return serverDetected || (this.#overrides[modelId]?.vision ?? false);
	}

	/**
	 * Effective audio capability: true if server reported true OR user force-enabled.
	 * @param serverDetected - the value reported by /props
	 */
	isAudioEnabled(modelId: string, serverDetected: boolean): boolean {
		return serverDetected || (this.#overrides[modelId]?.audio ?? false);
	}

	setToolCalling(modelId: string, enabled: boolean): void {
		this.#overrides = {
			...this.#overrides,
			[modelId]: { ...this.getOverride(modelId), toolCalling: enabled }
		};
		this.#saveToStorage();
	}

	setVision(modelId: string, enabled: boolean): void {
		this.#overrides = {
			...this.#overrides,
			[modelId]: { ...this.getOverride(modelId), vision: enabled || undefined }
		};
		this.#saveToStorage();
	}

	setAudio(modelId: string, enabled: boolean): void {
		this.#overrides = {
			...this.#overrides,
			[modelId]: { ...this.getOverride(modelId), audio: enabled || undefined }
		};
		this.#saveToStorage();
	}
}

export const modelCapabilityStore = new ModelCapabilityStore();
