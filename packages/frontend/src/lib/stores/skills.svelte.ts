/**
 * skillsStore - Reactive store for managing user skills.
 *
 * Tracks:
 * - List of skills loaded from the backend
 * - Enabled/disabled state per skill (persisted in localStorage)
 * - Loading and error states
 *
 * Skills are treated as built-in tools. When enabled, they become
 * available for discovery via `list_skill()` and reading via `read_skill()`.
 */

import { browser } from '$app/environment';
import { SKILLS_LOCALSTORAGE_KEY } from '$lib/constants';
import { SkillService } from '$lib/services/skill.service';
import type { SkillDefinition, SkillListEntry } from '@shared/types/skills';

interface SkillState {
	/** Whether the skill is enabled (available to the model). */
	enabled: boolean;
}

class SkillsStore {
	#skills = $state<SkillDefinition[]>([]);
	#skillStates = $state<Record<string, SkillState>>(this.loadSkillStates());
	#isLoading = $state(false);
	#error = $state<string | null>(null);
	#loadRequestId = 0;
	#lastLoadTime = 0;

	// ─── LocalStorage persistence ──────────────────────────────────────

	private loadSkillStates(): Record<string, SkillState> {
		if (!browser) return {};

		try {
			const stored = localStorage.getItem(SKILLS_LOCALSTORAGE_KEY);
			if (stored) {
				return JSON.parse(stored) as Record<string, SkillState>;
			}
		} catch (err) {
			console.warn('[skillsStore] Failed to load skill states:', err);
		}
		return {};
	}

	private saveSkillStates(): void {
		if (!browser) return;

		try {
			localStorage.setItem(SKILLS_LOCALSTORAGE_KEY, JSON.stringify(this.#skillStates));
		} catch (err) {
			console.warn('[skillsStore] Failed to save skill states:', err);
		}
	}

	// ─── Reactive getters ─────────────────────────────────────────────

	get skills(): SkillDefinition[] {
		return this.#skills;
	}

	get isLoading(): boolean {
		return this.#isLoading;
	}

	get error(): string | null {
		return this.#error;
	}

	/** Get enabled skills only (for model discovery). */
	get enabledSkills(): SkillDefinition[] {
		return this.#skills.filter((s) => this.isSkillEnabled(s.name));
	}

	/** Get skills visible to the model (respects disableModelInvocation). */
	get modelVisibleSkills(): SkillDefinition[] {
		return this.#skills.filter(
			(s) => this.isSkillEnabled(s.name) && !s.frontmatter.disableModelInvocation
		);
	}

	// ─── State management ─────────────────────────────────────────────

	/** Check if a specific skill is enabled. */
	isSkillEnabled(name: string): boolean {
		return this.#skillStates[name]?.enabled ?? true; // Default: enabled
	}

	/** Toggle a skill's enabled state. */
	toggleSkill(name: string, enabled: boolean): void {
		this.#skillStates[name] = { enabled };
		this.saveSkillStates();
	}

	// ─── CRUD Operations ──────────────────────────────────────────────

	/** Load all skills from the backend. */
	async loadSkills(): Promise<void> {
		this.#isLoading = true;
		this.#error = null;

		const requestId = ++this.#loadRequestId;

		try {
			const skills = await SkillService.listSkills();

			// Discard stale result if a newer load was requested
			if (requestId !== this.#loadRequestId) return;

			this.#skills = skills;
			this.#lastLoadTime = Date.now();
		} catch (err) {
			if (requestId !== this.#loadRequestId) return;
			this.#error = (err as Error).message;
			console.error('[skillsStore] Failed to load skills:', err);
		} finally {
			if (requestId === this.#loadRequestId) {
				this.#isLoading = false;
			}
		}
	}

	/**
	 * Load skills only if stale (older than ttlMs) or never loaded.
	 * Safe to call from multiple consumers; avoids redundant network requests.
	 */
	async loadSkillsIfStale(ttlMs: number): Promise<void> {
		const isStale = Date.now() - this.#lastLoadTime > ttlMs;
		const isEmpty = this.#skills.length === 0;
		if (isStale || isEmpty) {
			await this.loadSkills();
		}
	}

	/** Create a new skill and reload the list. */
	async createSkill(name: string, content: string): Promise<SkillDefinition> {
		const skill = await SkillService.createSkill(name, content);
		await this.loadSkills();
		return skill;
	}

	/** Update an existing skill and reload the list. */
	async updateSkill(name: string, content: string): Promise<SkillDefinition> {
		const skill = await SkillService.updateSkill(name, content);
		await this.loadSkills();
		return skill;
	}

	/** Delete a skill and reload the list. */
	async deleteSkill(name: string): Promise<void> {
		await SkillService.deleteSkill(name);
		// Clean up local state immediately after confirmed backend deletion
		const newStates = { ...this.#skillStates };
		delete newStates[name];
		this.#skillStates = newStates;
		this.saveSkillStates();
		await this.loadSkills();
		// Note: if loadSkills() fails, the skill is still removed from localStorage
		// but the UI will show stale data until next successful reload.
		// This is acceptable — the user can retry via the reload button.
	}

	/** Find a skill by name. Returns null if not found. */
	findSkill(name: string): SkillDefinition | null {
		return this.#skills.find((s) => s.name === name) ?? null;
	}

	// ─── Tool Execution Support ───────────────────────────────────────

	/**
	 * Get the skill list for `list_skill()` tool response.
	 * Returns only enabled skills that are visible to the model.
	 */
	getListSkillEntries(): SkillListEntry[] {
		return this.modelVisibleSkills.map((s) => ({
			name: s.name,
			title: s.title,
			description: s.description,
			disableModelInvocation: s.frontmatter.disableModelInvocation ?? false
		}));
	}

	/**
	 * Get the full content of a skill for `read_skill()` tool response.
	 * Returns null if the skill doesn't exist.
	 */
	getReadSkillContent(name: string): string | null {
		if (!this.isSkillAvailableForModel(name)) return null;
		const skill = this.findSkill(name);
		return skill?.content ?? null;
	}

	/**
	 * Check if a skill is enabled for tool execution.
	 * Used by `list_skill()` to filter available skills.
	 */
	isSkillAvailableForModel(name: string): boolean {
		const skill = this.findSkill(name);
		if (!skill) return false;
		return this.isSkillEnabled(name) && !skill.frontmatter.disableModelInvocation;
	}
}

export const skillsStore = new SkillsStore();
