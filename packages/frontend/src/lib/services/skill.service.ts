/**
 * Skill service — HTTP client for skill CRUD operations.
 *
 * Communicates with the backend skill API endpoints.
 */

import { serverEndpointStore } from '$lib/stores/server-endpoint.svelte';
import type { SkillDefinition } from '@shared/types/skills';
import { fetchWithTimeout } from '@shared/utils/abort';

const SKILLS_ENDPOINT = '/api/skills';
const SKILL_REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithEndpoint(path: string, init?: RequestInit): Promise<Response> {
	const endpoint = serverEndpointStore.getBaseUrl();
	const url = `${endpoint}${path}`;

	return fetchWithTimeout(url, init, SKILL_REQUEST_TIMEOUT_MS);
}

export class SkillService {
	/** List all skills from the backend. */
	static async listSkills(): Promise<SkillDefinition[]> {
		const res = await fetchWithEndpoint(SKILLS_ENDPOINT, { method: 'GET' });
		if (!res.ok) {
			const error = await res.json().catch(() => ({ error: 'Unknown error' }));
			throw new Error(error.error || error.detail || 'Failed to list skills');
		}
		return res.json();
	}

	/** Create a new skill. */
	static async createSkill(name: string, content: string): Promise<SkillDefinition> {
		const res = await fetchWithEndpoint(SKILLS_ENDPOINT, {
			method: 'POST',
			body: JSON.stringify({ name, content })
		});
		if (!res.ok) {
			const error = await res.json().catch(() => ({ error: 'Unknown error' }));
			throw new Error(error.error || error.detail || 'Failed to create skill');
		}
		return res.json();
	}

	/** Read a single skill by name. */
	static async readSkill(name: string): Promise<SkillDefinition> {
		const res = await fetchWithEndpoint(`${SKILLS_ENDPOINT}/${encodeURIComponent(name)}`, {
			method: 'GET'
		});
		if (!res.ok) {
			const error = await res.json().catch(() => ({ error: 'Unknown error' }));
			throw new Error(error.error || error.detail || `Skill "${name}" not found`);
		}
		return res.json();
	}

	/** Update an existing skill. */
	static async updateSkill(name: string, content: string): Promise<SkillDefinition> {
		const res = await fetchWithEndpoint(`${SKILLS_ENDPOINT}/${encodeURIComponent(name)}`, {
			method: 'PUT',
			body: JSON.stringify({ content })
		});
		if (!res.ok) {
			const error = await res.json().catch(() => ({ error: 'Unknown error' }));
			throw new Error(error.error || error.detail || `Failed to update skill "${name}"`);
		}
		return res.json();
	}

	/** Delete a skill by name. */
	static async deleteSkill(name: string): Promise<void> {
		const res = await fetchWithEndpoint(`${SKILLS_ENDPOINT}/${encodeURIComponent(name)}`, {
			method: 'DELETE'
		});
		if (!res.ok && res.status !== 204) {
			const error = await res.json().catch(() => ({ error: 'Unknown error' }));
			throw new Error(error.error || error.detail || `Failed to delete skill "${name}"`);
		}
	}
}
