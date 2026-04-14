/**
 * Unit tests: Skill name sanitization.
 */

import { describe, test, expect } from "bun:test";
import { sanitizeSkillName, SKILLS_DIRECTORY, SKILL_FILE_EXTENSION } from "#shared/constants/skills";

describe("sanitizeSkillName", () => {
	test("preserves valid alphanumeric names", () => {
		expect(sanitizeSkillName("my-skill")).toBe("my-skill");
		expect(sanitizeSkillName("skill_123")).toBe("skill_123");
		expect(sanitizeSkillName("abc")).toBe("abc");
	});

	test("replaces spaces with hyphens", () => {
		expect(sanitizeSkillName("my cool skill")).toBe("my-cool-skill");
	});

	test("replaces special characters with hyphens", () => {
		expect(sanitizeSkillName("my.skill")).toBe("my-skill");
		expect(sanitizeSkillName("my!skill")).toBe("my-skill");
		expect(sanitizeSkillName("my#skill")).toBe("my-skill");
	});

	test("collapses consecutive separators from non-alphanumeric chars", () => {
		// Multiple non-alphanumeric chars (except - and _) are collapsed to single hyphen
		expect(sanitizeSkillName("my  skill")).toBe("my-skill");
		expect(sanitizeSkillName("my!!skill")).toBe("my-skill");
		// But consecutive hyphens/underscores are preserved (they're in the allowed set)
		expect(sanitizeSkillName("my--skill")).toBe("my--skill");
		expect(sanitizeSkillName("my__skill")).toBe("my__skill");
	});

	test("strips leading/trailing hyphens", () => {
		expect(sanitizeSkillName("-my-skill-")).toBe("my-skill");
		expect(sanitizeSkillName("---skill---")).toBe("skill");
		// Underscores are preserved (allowed character)
		expect(sanitizeSkillName("_skill_")).toBe("_skill_");
	});

	test("converts to lowercase", () => {
		expect(sanitizeSkillName("MySkill")).toBe("myskill");
		expect(sanitizeSkillName("MY-SKILL")).toBe("my-skill");
	});

	test("handles mixed cases", () => {
		expect(sanitizeSkillName("My_Cool-Skill!")).toBe("my_cool-skill");
	});
});

describe("skill constants", () => {
	test("SKILLS_DIRECTORY is 'skills'", () => {
		expect(SKILLS_DIRECTORY).toBe("skills");
	});

	test("SKILL_FILE_EXTENSION is '.md'", () => {
		expect(SKILL_FILE_EXTENSION).toBe(".md");
	});
});
