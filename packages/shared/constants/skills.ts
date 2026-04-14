/**
 * Skill-related constants shared between frontend and backend.
 */

/** Directory name where skill files are stored (relative to project root or backend data dir). */
export const SKILLS_DIRECTORY = 'skills';

/** File extension for skill files. */
export const SKILL_FILE_EXTENSION = '.md';

/** Maximum character count displayed in skill card badge. */
export const SKILL_DESCRIPTION_TRIM_LENGTH = 120;

/** Default title when not specified in frontmatter. */
export const SKILL_DEFAULT_TITLE = 'Untitled Skill';

/** Default description when not specified in frontmatter. */
export const SKILL_DEFAULT_DESCRIPTION = 'N/A';

/** Maximum skill content size in bytes (1 MB). */
export const SKILL_MAX_CONTENT_BYTES = 1024 * 1024;

/** Magic string for argument substitution in skill content. $ARGUMENTS[0] = first arg, etc. */
export const SKILL_ARGUMENTS_PATTERN = /\$ARGUMENTS\[(\d+)\]/g;

/**
 * Sanitize a skill name to be filesystem-safe and consistent.
 * Replaces any non-alphanumeric character (except hyphens and underscores) with hyphens.
 * Collapses consecutive separators into a single hyphen.
 * Strips leading/trailing separators.
 */
export function sanitizeSkillName(name: string): string {
	return name
		.replace(/[^a-zA-Z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();
}
