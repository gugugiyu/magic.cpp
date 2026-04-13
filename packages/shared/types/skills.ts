/**
 * Shared skill type definitions.
 *
 * Skills are user-created markdown files that extend the model's capabilities.
 * They support frontmatter metadata and $ARGUMENTS variable substitution.
 */

/** Parsed frontmatter from a skill file. */
export interface SkillFrontmatter {
	/**
	 * Execution context for the skill.
	 * - `fork`: runs in subagent mode via `call_subagent()`
	 * - If omitted, defaults to `fork`
	 */
	context?: 'fork';

	/**
	 * Whether the user can invoke this skill via `/skills <name>`.
	 * Mutually inclusive with `disableModelInvocation`.
	 * Default: `true` (both user and model can invoke).
	 */
	userInvocable?: boolean;

	/**
	 * Whether the model should NOT auto-discover or invoke this skill.
	 * Mutually inclusive with `userInvocable`.
	 * Default: `false` (model can discover and invoke).
	 */
	disableModelInvocation?: boolean;
}

/** A fully parsed skill definition. */
export interface SkillDefinition {
	/** Unique identifier derived from the filename (without .md extension). */
	name: string;

	/** Skill title from frontmatter or filename. Required. */
	title: string;

	/** Skill description from frontmatter. Optional. */
	description: string;

	/** Full markdown content of the skill file. */
	content: string;

	/** Parsed frontmatter metadata. */
	frontmatter: SkillFrontmatter;
}

/** Minimal skill info returned by `list_skill()` tool. */
export interface SkillListEntry {
	/** Skill name identifier. */
	name: string;

	/** Skill title. */
	title: string;

	/** Skill description (may be "N/A" if not provided). */
	description: string;

	/** Whether the model should skip this skill in listings. */
	disableModelInvocation: boolean;
}

/** Result returned by `read_skill()` tool. */
export interface SkillReadResult {
	/** Skill name identifier. */
	name: string;

	/** Full skill markdown content with $ARGUMENTS substituted (if any). */
	content: string;

	/** Parsed frontmatter. */
	frontmatter: SkillFrontmatter;
}
