/**
 * Skill service — HTTP client for skill CRUD operations.
 *
 * Communicates with the backend skill API endpoints.
 */

import { getAllSkills, getSkill, createSkill, updateSkill, deleteSkill } from '$lib/api/skills.api';
import type { SkillDefinition } from '@shared/types/skills';

export class SkillService {
	/** List all skills from the backend. */
	static async listSkills(): Promise<SkillDefinition[]> {
		return getAllSkills();
	}

	/** Read a single skill by name. */
	static async readSkill(name: string): Promise<SkillDefinition> {
		return getSkill(name);
	}

	/** Create a new skill. */
	static async createSkill(name: string, content: string): Promise<SkillDefinition> {
		return createSkill(name, content);
	}

	/** Update an existing skill. */
	static async updateSkill(name: string, content: string): Promise<SkillDefinition> {
		return updateSkill(name, content);
	}

	/** Delete a skill by name. */
	static async deleteSkill(name: string): Promise<void> {
		return deleteSkill(name);
	}
}
