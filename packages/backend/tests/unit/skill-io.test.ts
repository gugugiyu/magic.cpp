/**
 * Unit tests: Skill markdown parsing (pure functions, no file I/O).
 */

import { describe, test, expect } from "bun:test";
import { parseSkillMarkdown, isSkillVisibleToModel } from "../../src/services/skill-io.ts";

describe("parseSkillMarkdown", () => {
	test("parses skill with frontmatter", () => {
		const content = `---
title: My Skill
description: A test skill
context: fork
userInvocable: true
disableModelInvocation: false
---

# My Skill

This is the skill content.
`;
		const skill = parseSkillMarkdown("my-skill", content);
		expect(skill.name).toBe("my-skill");
		expect(skill.title).toBe("My Skill");
		expect(skill.description).toBe("A test skill");
		expect(skill.frontmatter.context).toBe("fork");
		expect(skill.frontmatter.userInvocable).toBe(true);
		expect(skill.frontmatter.disableModelInvocation).toBe(false);
		expect(skill.content).toBe(content);
	});

	test("derives title from filename when not in frontmatter", () => {
		const content = `# Content only`;
		const skill = parseSkillMarkdown("my-cool-skill", content);
		expect(skill.title).toBe("My Cool Skill");
	});

	test("uses default description when not in frontmatter", () => {
		const content = `# Content`;
		const skill = parseSkillMarkdown("test", content);
		expect(skill.description).toBe("N/A");
	});

	test("parses frontmatter without title", () => {
		const content = `---
description: Just a description
---

Content here.
`;
		const skill = parseSkillMarkdown("no-title-skill", content);
		expect(skill.title).toBe("No Title Skill");
		expect(skill.description).toBe("Just a description");
	});

	test("handles content without frontmatter", () => {
		const content = `# No Frontmatter

This skill has no frontmatter.
`;
		const skill = parseSkillMarkdown("no-frontmatter", content);
		expect(skill.frontmatter.context).toBeUndefined();
		expect(skill.frontmatter.userInvocable).toBeUndefined();
		expect(skill.frontmatter.disableModelInvocation).toBeUndefined();
	});

	test("parses boolean values correctly", () => {
		const content = `---
userInvocable: true
disableModelInvocation: false
---

Content.
`;
		const skill = parseSkillMarkdown("bool-test", content);
		expect(skill.frontmatter.userInvocable).toBe(true);
		expect(skill.frontmatter.disableModelInvocation).toBe(false);
	});

	test("parses hyphenated keys as camelCase", () => {
		const content = `---
disable-model-invocation: true
user-invocable: true
---

Content.
`;
		const skill = parseSkillMarkdown("hyphen-test", content);
		expect(skill.frontmatter.disableModelInvocation).toBe(true);
		expect(skill.frontmatter.userInvocable).toBe(true);
	});

	test("handles quoted values in frontmatter", () => {
		const content = `---
title: "Quoted Title"
description: 'Single quoted description'
---

Content.
`;
		const skill = parseSkillMarkdown("quoted", content);
		expect(skill.title).toBe("Quoted Title");
		expect(skill.description).toBe("Single quoted description");
	});

	test("title from filename with underscores", () => {
		const skill = parseSkillMarkdown("my_awesome_skill", "---\n---\nContent");
		expect(skill.title).toBe("My Awesome Skill");
	});
});

describe("isSkillVisibleToModel", () => {
	test("visible when disableModelInvocation is false", () => {
		const skill = parseSkillMarkdown("visible", `---
disableModelInvocation: false
---
Content
`);
		expect(isSkillVisibleToModel(skill)).toBe(true);
	});

	test("hidden when disableModelInvocation is true", () => {
		const skill = parseSkillMarkdown("hidden", `---
disableModelInvocation: true
---
Content
`);
		expect(isSkillVisibleToModel(skill)).toBe(false);
	});

	test("visible by default when frontmatter not specified", () => {
		const skill = parseSkillMarkdown("default", `Content only`);
		expect(isSkillVisibleToModel(skill)).toBe(true);
	});
});
