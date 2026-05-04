/**
 * Skill API service.
 * HTTP client for skill CRUD operations with backend SQLite.
 */

import { apiFetch, apiPost } from '$lib/utils/api-fetch';
import { routeUrl, RouteHandlers } from '$lib/utils/api-routes';
import type { SkillDefinition } from '@shared/types/skills';

/**
 * List all skills from the backend.
 */
export async function getAllSkills(): Promise<SkillDefinition[]> {
	return apiFetch<SkillDefinition[]>(routeUrl(RouteHandlers.listSkills));
}

/**
 * Get a single skill by name.
 */
export async function getSkill(name: string): Promise<SkillDefinition> {
	return apiFetch<SkillDefinition>(routeUrl(RouteHandlers.readSkill, { name }));
}

/**
 * Create a new skill.
 */
export async function createSkill(name: string, content: string): Promise<SkillDefinition> {
	return apiPost<SkillDefinition, { name: string; content: string }>(
		routeUrl(RouteHandlers.createSkill),
		{ name, content }
	);
}

/**
 * Update an existing skill.
 */
export async function updateSkill(name: string, content: string): Promise<SkillDefinition> {
	return apiFetch<SkillDefinition>(routeUrl(RouteHandlers.updateSkill, { name }), {
		method: 'PUT',
		body: JSON.stringify({ content })
	});
}

/**
 * Delete a skill by name.
 */
export async function deleteSkill(name: string): Promise<void> {
	await apiFetch(routeUrl(RouteHandlers.deleteSkill, { name }), { method: 'DELETE' });
}
