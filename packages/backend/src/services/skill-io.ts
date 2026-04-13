/**
 * Skill I/O service — parses skill markdown files with frontmatter support.
 *
 * Wraps the generic FileStore with skill-specific parsing logic:
 * - YAML frontmatter extraction (context, userInvocable, disableModelInvocation)
 * - Title and description extraction from frontmatter
 * - Content body extraction (everything after frontmatter)
 */

import { skillFileStore, FileStoreEntry } from './fs/file-store.ts';
import type {
	SkillDefinition,
	SkillFrontmatter
} from '#shared/types/skills';
import {
	SKILL_DEFAULT_TITLE,
	SKILL_DEFAULT_DESCRIPTION
} from '#shared/constants/skills';

/** Regex for YAML frontmatter at the start of a file. */
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

/**
 * Parse YAML frontmatter from a string (lightweight, no external dependency).
 * Supports: title, description, context, user-invocable, disable-model-invocation.
 */
function parseFrontmatter(yaml: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	// Normalize hyphenated keys to camelCase
	const normalizeKey = (key: string) =>
		key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

	for (const line of yaml.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const colonIndex = trimmed.indexOf(':');
		if (colonIndex === -1) continue;

		const rawKey = trimmed.slice(0, colonIndex).trim();
		const key = normalizeKey(rawKey);
		let value = trimmed.slice(colonIndex + 1).trim();

		// Remove surrounding quotes
		if ((value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}

		// Parse booleans
		if (value === 'true') result[key] = true;
		else if (value === 'false') result[key] = false;
		// Parse numbers
		else if (!isNaN(Number(value)) && value !== '') result[key] = Number(value);
		// Store as string
		else result[key] = value;
	}

	return result;
}

/** Convert raw frontmatter keys to SkillFrontmatter type. */
function toSkillFrontmatter(raw: Record<string, unknown>): SkillFrontmatter {
	return {
		context: (raw.context as 'fork' | undefined) ?? 'fork',
		userInvocable: raw.userInvocable !== undefined ? Boolean(raw.userInvocable) : undefined,
		disableModelInvocation: raw.disableModelInvocation !== undefined
			? Boolean(raw.disableModelInvocation)
			: undefined
	};
}

/**
 * Parse a skill markdown file into a SkillDefinition.
 * Extracts frontmatter, title, description, and content body.
 */
export function parseSkillMarkdown(name: string, content: string): SkillDefinition {
	const frontmatterMatch = content.match(FRONTMATTER_REGEX);

	let rawFrontmatter: Record<string, unknown> = {};

	if (frontmatterMatch) {
		rawFrontmatter = parseFrontmatter(frontmatterMatch[1]);
	}

	const frontmatter = toSkillFrontmatter(rawFrontmatter);

	// Title: from frontmatter or derive from filename
	let title = (rawFrontmatter.title as string) ?? SKILL_DEFAULT_TITLE;
	if (title === SKILL_DEFAULT_TITLE) {
		// Derive from filename: "my-cool-skill" → "My Cool Skill"
		title = name
			.replace(/[-_]/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	// Description: from frontmatter or default
	const description = (rawFrontmatter.description as string) ?? SKILL_DEFAULT_DESCRIPTION;

	return {
		name,
		title,
		description,
		content,  // Preserve full original content including frontmatter
		frontmatter
	};
}

/** Check if a skill should be hidden from model discovery. */
export function isSkillVisibleToModel(skill: SkillDefinition): boolean {
	// Default: visible to model (disableModelInvocation defaults to false)
	return !skill.frontmatter.disableModelInvocation;
}

// ─── Service API ──────────────────────────────────────────────────────────────

/** List all skills as SkillDefinition objects. */
export async function listAllSkills(): Promise<SkillDefinition[]> {
	const entries = await skillFileStore.list();
	const skills: SkillDefinition[] = [];

	for (const entry of entries) {
		const content = await skillFileStore.read(entry.name);
		if (content !== null) {
			skills.push(parseSkillMarkdown(entry.name, content));
		}
	}

	return skills;
}

/** Read a single skill by name. Returns null if not found. */
export async function readSkill(name: string): Promise<SkillDefinition | null> {
	const content = await skillFileStore.read(name);
	if (content === null) return null;
	return parseSkillMarkdown(name, content);
}

/** Create a new skill. Throws if a skill with the same name already exists. */
export async function createSkill(name: string, content: string): Promise<SkillDefinition> {
	if (await skillFileStore.exists(name)) {
		throw new Error(`Skill "${name}" already exists. Use updateSkill to modify it.`);
	}

	await skillFileStore.write(name, content);
	return parseSkillMarkdown(name, content);
}

/** Update an existing skill. Throws if the skill doesn't exist. */
export async function updateSkill(name: string, content: string): Promise<SkillDefinition> {
	if (!(await skillFileStore.exists(name))) {
		throw new Error(`Skill "${name}" does not exist. Use createSkill to add it.`);
	}

	await skillFileStore.write(name, content);
	return parseSkillMarkdown(name, content);
}

/** Delete a skill. Returns true if deleted, false if not found. */
export async function deleteSkill(name: string): Promise<boolean> {
	return skillFileStore.delete(name);
}
