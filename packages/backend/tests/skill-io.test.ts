import { describe, it, expect, beforeEach } from 'bun:test';
import { extractSkillName, parseSkillMarkdown } from '../src/services/skill-io.ts';

describe('extractSkillName', () => {
	it('should return filename for flat skill files', () => {
		expect(extractSkillName('my-skill')).toBe('my-skill');
		expect(extractSkillName('test')).toBe('test');
		expect(extractSkillName('complex-name')).toBe('complex-name');
	});

	it('should extract skill name from provider convention (skillName/SKILL)', () => {
		expect(extractSkillName('my-skill/SKILL')).toBe('my-skill');
		expect(extractSkillName('gemini-skill/SKILL')).toBe('gemini-skill');
	});

	it('should extract skill name from deeper nesting (category/skillName/SKILL)', () => {
		expect(extractSkillName('web/my-skill/SKILL')).toBe('my-skill');
		expect(extractSkillName('category/subfolder/my-skill/SKILL')).toBe('my-skill');
	});

	it('should return filename if not following provider convention', () => {
		expect(extractSkillName('folder/test')).toBe('test');
		expect(extractSkillName('a/b/c')).toBe('c');
	});
});

describe('parseSkillMarkdown', () => {
	it('should parse flat skill file without frontmatter', () => {
		const content = '# My Skill\n\nSome content here.';
		const skill = parseSkillMarkdown('my-skill', content);

		expect(skill.name).toBe('my-skill');
		expect(skill.title).toBe('My Skill');
		expect(skill.description).toBe('N/A');
		expect(skill.content).toBe(content);
	});

	it('should parse skill with frontmatter', () => {
		const content = `---
title: Custom Title
description: A custom description
userInvocable: true
disableModelInvocation: false
---

# Skill Content

Some instructions here.`;

		const skill = parseSkillMarkdown('my-skill', content);

		expect(skill.title).toBe('Custom Title');
		expect(skill.description).toBe('A custom description');
		expect(skill.frontmatter.userInvocable).toBe(true);
		expect(skill.frontmatter.disableModelInvocation).toBe(false);
	});

	it('should derive title from filename when not in frontmatter', () => {
		const content = '# Instructions';
		const skill = parseSkillMarkdown('my-cool-skill', content);

		expect(skill.title).toBe('My Cool Skill');
	});

	it('should set source when provided', () => {
		const content = '# Test';
		const skill = parseSkillMarkdown('test', content, 'gemini');

		expect(skill.source).toBe('gemini');
	});

	it('should handle hyphenated frontmatter keys', () => {
		const content = `---
user-invocable: true
disable-model-invocation: true
---

# Content`;

		const skill = parseSkillMarkdown('test', content);

		expect(skill.frontmatter.userInvocable).toBe(true);
		expect(skill.frontmatter.disableModelInvocation).toBe(true);
	});

	it('should parse YAML folded scalar (>) for multiline description', () => {
		const content = `---
title: My Skill
description: >
  This is a long description
  that spans multiple lines
  and should be folded into one line.
---

# Content`;

		const skill = parseSkillMarkdown('test', content);

		expect(skill.description).toBe(
			'This is a long description that spans multiple lines and should be folded into one line.'
		);
	});

	it('should parse YAML literal scalar (|) for multiline description', () => {
		const content = `---
title: My Skill
description: |
  Line one
  Line two
  Line three
---

# Content`;

		const skill = parseSkillMarkdown('test', content);

		expect(skill.description).toBe('Line one\nLine two\nLine three');
	});

	it('should handle indented continuation without block indicator', () => {
		const content = `---
title: My Skill
description: 
  This is a description
  with multiple lines.
---

# Content`;

		const skill = parseSkillMarkdown('test', content);

		expect(skill.description).toBe('This is a description with multiple lines.');
	});
});