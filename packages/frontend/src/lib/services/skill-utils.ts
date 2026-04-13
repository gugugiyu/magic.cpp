/**
 * Skill utilities for frontend use.
 *
 * Mirrors relevant functions from the backend skill-io service
 * so the frontend can work with skill content independently.
 */

import { SKILL_ARGUMENTS_PATTERN } from '@shared/constants/skills';
import type { SkillDefinition } from '@shared/types/skills';

/** Check if a skill can be invoked by the user. */
export function isSkillUserInvocable(skill: SkillDefinition): boolean {
	return skill.frontmatter.userInvocable !== false;
}

/**
 * Substitute $ARGUMENTS[n] placeholders in skill content with provided argument values.
 * Unmatched placeholders remain as-is.
 */
export function substituteSkillArguments(content: string, args: string[]): string {
	return content.replace(SKILL_ARGUMENTS_PATTERN, (_match, index: string) => {
		const idx = parseInt(index, 10);
		return idx < args.length ? args[idx] : `$ARGUMENTS[${idx}]`;
	});
}

/**
 * Extract the instruction content from skill markdown, removing frontmatter.
 */
export function extractSkillContent(content: string): string {
	const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
	if (frontmatterMatch) {
		return frontmatterMatch[2].trim();
	}
	return content.trim();
}

/**
 * Check if skill content contains $ARGUMENTS placeholders.
 */
export function skillHasArguments(content: string): boolean {
	return SKILL_ARGUMENTS_PATTERN.test(content);
}
