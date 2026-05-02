/**
 * Skill I/O service — parses skill markdown files with frontmatter support.
 *
 * Wraps the generic FileStore with skill-specific parsing logic:
 * - YAML frontmatter extraction (context, userInvocable, disableModelInvocation)
 * - Title and description extraction from frontmatter
 * - Content body extraction (everything after frontmatter)
 */

import { skillFileStore, createSkillFileStoreForSource } from './fs/file-store.ts';
	import { resolve } from 'path';
import { homedir } from 'os';
import type {
	SkillDefinition,
	SkillFrontmatter,
	SkillSource
} from '#shared/types/skills';
import {
	SKILL_DEFAULT_TITLE,
	SKILL_DEFAULT_DESCRIPTION
} from '#shared/constants/skills';
import { createLogger } from '../utils/logger.ts';
import { loadConfig } from '../config';
import { existsSync } from 'fs';

const log = createLogger('skill-io');

/** Configuration for skill source directories. */
interface SkillSourceConfig {
	/** Source identifier. */
	source: SkillSource;
	/** Directory path to scan for skills. */
	dirPath: string;
}

/** Get all configured skill source directories. */
async function getSkillSourceConfigs(): Promise<SkillSourceConfig[]> {
	const configs: SkillSourceConfig[] = [];
	const home = homedir();

	// Local skills (data/skills)
	const localDataDir = resolve(loadConfig().database.path, '..');
	configs.push({
		source: 'local',
		dirPath: loadConfig().resolvedSkillsFolder
	});

	// Global skill directories
	if (home) {
		const globalDirs: { source: SkillSource; subdir: string }[] = [
			{ source: 'claude', subdir: '.claude/skills' },
			{ source: 'gemini', subdir: '.gemini/skills' },
			{ source: 'qwen', subdir: '.qwen/skills' },
			{ source: 'codex', subdir: '.codex/skills' }
		];

		for (const { source, subdir } of globalDirs) {
			const fullPath = resolve(homedir(), subdir);
			const exists = existsSync(fullPath)
			if (exists) {
				configs.push({ source, dirPath: fullPath });
			}
		}
	}

	return configs;
}

/** Convention: provider skills are stored as <skillName>/SKILL.md (e.g., ~/.gemini/skills/my-skill/SKILL.md). */
const PROVIDER_SKILL_FILENAME = 'SKILL';

/** Extract skill name from an entry name.
 * - Flat files: "my-skill" → "my-skill"
 * - Provider convention: "my-skill/SKILL" → "my-skill"
 * - Deeper nesting: "category/my-skill/SKILL" → "my-skill"
 */
export function extractSkillName(entryName: string): string {
	const parts = entryName.split('/');
	const fileName = parts[parts.length - 1];
	if (fileName === PROVIDER_SKILL_FILENAME && parts.length >= 2) {
		return parts[parts.length - 2];
	}
	return fileName;
}

/** Regex for YAML frontmatter at the start of a file. */
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

/**
 * Parse YAML frontmatter from a string (lightweight, no external dependency).
 * Supports: title, description, context, user-invocable, disable-model-invocation.
 * Handles YAML folded scalars (>, |) for multi-line values.
 */
function parseFrontmatter(yaml: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	const normalizeKey = (key: string) =>
		key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

	const lines = yaml.split('\n');
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith('#')) {
			i++;
			continue;
		}

		const colonIndex = trimmed.indexOf(':');
		if (colonIndex === -1) {
			i++;
			continue;
		}

		const rawKey = trimmed.slice(0, colonIndex).trim();
		const key = normalizeKey(rawKey);
		let valuePart = trimmed.slice(colonIndex + 1).trim();

		// Check for YAML block/folded scalars: > (fold to spaces) or | (preserve newlines)
		const foldMatch = valuePart.match(/^([>|])([+-]?)$/);
		let values: string[] = [];
		let isFolded = false;

		if (foldMatch) {
			isFolded = foldMatch[1] === '>';
			i++;
			// Collect indented continuation lines
			while (i < lines.length) {
				const contLine = lines[i];
				if (contLine === '' || contLine.startsWith(' ')) {
					values.push(contLine);
					i++;
				} else {
					break;
				}
			}
		} else {
			i++;
			// Regular single-line value — look ahead for continuation on next line
			if (valuePart === '' && i < lines.length) {
				const nextLine = lines[i];
				if (nextLine.startsWith(' ') || nextLine === '') {
					values.push(nextLine);
					i++;
					// Continue collecting indented lines
					while (i < lines.length) {
						const contLine = lines[i];
						if (contLine.startsWith(' ') || contLine === '') {
							values.push(contLine);
							i++;
						} else {
							break;
						}
					}
				}
			}
		}

		let value: string;
		if (values.length > 0) {
			const joined = values.join('\n');
			// Strip leading/trailing indentation and normalize whitespace
			const stripped = joined.replace(/^[ \t]+/gm, '').trim();
			// If no explicit block indicator (>, |), default to folding (newlines → spaces)
			const shouldFold = isFolded || !foldMatch;
			value = shouldFold ? stripped.replace(/\n+/g, ' ') : stripped;
		} else {
			value = valuePart;
		}

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
		// Preserve undefined when not specified — callers must not assume a default
		context: raw.context !== undefined ? (raw.context as 'fork') : undefined,
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
export function parseSkillMarkdown(name: string, content: string, source?: SkillSource): SkillDefinition {
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

	const result: SkillDefinition = {
		name,
		title,
		description,
		content,  // Preserve full original content including frontmatter
		frontmatter
	};

	// Set source if provided (defaults to 'local' in callers)
	if (source) {
		result.source = source;
	}

	return result;
}

/** Check if a skill should be hidden from model discovery. */
export function isSkillVisibleToModel(skill: SkillDefinition): boolean {
	// Default: visible to model (disableModelInvocation defaults to false)
	return !skill.frontmatter.disableModelInvocation;
}

// ─── Service API ──────────────────────────────────────────────────────────────

/** Track which store each skill came from (for writes). */
const skillSourceMap = new Map<string, { store: ReturnType<typeof createSkillFileStoreForSource>; source: SkillSource }>();

/** Find the store and source for a skill by name. */
async function findSkillStore(name: string): Promise<{ store: ReturnType<typeof createSkillFileStoreForSource>; source: SkillSource } | null> {
	// Check if we have a cached source
	const cached = skillSourceMap.get(name);
	if (cached) return cached;

	// Search all sources
	for (const config of await getSkillSourceConfigs()) {
		const store = createSkillFileStoreForSource(config.dirPath);
		if (await store.exists(name)) {
			const result = { store, source: config.source };
			skillSourceMap.set(name, result);
			return result;
		}
	}

	return null;
}

/** List all skills as SkillDefinition objects from all sources. */
export async function listAllSkills(): Promise<SkillDefinition[]> {
	const skills: SkillDefinition[] = [];
	const sourceCounts: Record<string, number> = {};

	// Clear and rebuild source map
	skillSourceMap.clear();

	for (const config of await getSkillSourceConfigs()) {
		const store = createSkillFileStoreForSource(config.dirPath);
		// Use recursive glob to find skills in all subdirectories
		const entries = await store.listRecursive();
		sourceCounts[config.source] = 0;

		for (const entry of entries) {
			const skillName = extractSkillName(entry.name);
			if (!skillName) continue;

			const content = await store.read(entry.name);

			if (content !== null) {
				const skill = parseSkillMarkdown(skillName, content, config.source);
				skillSourceMap.set(skillName, { store, source: config.source });
				skills.push(skill);
				sourceCounts[config.source]++;
			}
		}
	}

	// Log breakdown by source
	const breakdown = Object.entries(sourceCounts)
		.map(([src, count]) => `${src}: ${count}`)
		.join(', ');
	log.info(`loaded ${skills.length} skills (${breakdown})`);

	return skills;
}

/** Read a single skill by name. Returns null if not found. */
export async function readSkill(name: string): Promise<SkillDefinition | null> {
	const found = await findSkillStore(name);
	if (!found) return null;
	const content = await found.store.read(name);
	if (content === null) return null;
	return parseSkillMarkdown(name, content, found.source);
}

/** Create a new skill. Always creates in local store. Throws if already exists. */
export async function createSkill(name: string, content: string): Promise<SkillDefinition> {
	if (await skillFileStore.exists(name)) {
		throw new Error(`Skill "${name}" already exists. Use updateSkill to modify it.`);
	}

	await skillFileStore.write(name, content);
	skillSourceMap.set(name, { store: skillFileStore, source: 'local' });
	return parseSkillMarkdown(name, content, 'local');
}

/** Update an existing skill. Throws if the skill doesn't exist. */
export async function updateSkill(name: string, content: string): Promise<SkillDefinition> {
	const found = await findSkillStore(name);
	if (!found) {
		throw new Error(`Skill "${name}" does not exist. Use createSkill to add it.`);
	}

	await found.store.write(name, content);
	return parseSkillMarkdown(name, content, found.source);
}

/** Delete a skill. Returns true if deleted, false if not found. */
export async function deleteSkill(name: string): Promise<boolean> {
	const found = await findSkillStore(name);
	if (!found) return false;

	const deleted = await found.store.delete(name);
	if (deleted) {
		skillSourceMap.delete(name);
	}
	return deleted;
}

// ─── Built-in Skills Seeding ──────────────────────────────────────────────────

const BUILT_IN_SKILLS: { name: string; filePath: string }[] = [
	{
		name: 'qa-system-guide',
		filePath: resolve(__dirname, '..', '..', '..', '..', 'packages', 'database', 'seeds', 'skills', 'qa-system-guide.md')
	}
];

/**
 * Seed all built-in skills into the skill store.
 * Idempotent: skips skills that already exist.
 * Called at database initialization time.
 */
export async function seedBuiltInSkills(): Promise<void> {
	await skillFileStore.ensureDirectory();

	for (const { name, filePath } of BUILT_IN_SKILLS) {
		try {
			if (await skillFileStore.exists(name)) {
				continue;
			}
			const file = Bun.file(filePath);
			if (!(await file.exists())) {
				log.warn(`built-in skill not found: ${filePath}`);
				continue;
			}
			const content = await file.text();
			await createSkill(name, content);
			log.info(`seeded built-in skill: ${name}`);
		} catch (err) {
			// Already exists or other error — seed is best-effort
			if ((err as Error).message.includes('already exists')) {
				continue;
			}
			log.warn(`failed to seed skill "${name}":`, err);
		}
	}
}
