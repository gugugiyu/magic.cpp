/**
 * Integration tests: Skill I/O service with real filesystem.
 * Uses temporary directory for file operations.
 * Each test uses local variables to avoid concurrent test pollution.
 */

import { describe, test, expect } from "bun:test";
import { FileStore } from "../../src/services/fs/file-store.ts";
import { tmpdir } from "os";
import { rmSync } from "fs";
import { join } from "path";

describe("FileStore", () => {
	test("exists returns false for non-existent file", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			expect(await store.exists("nonexistent")).toBe(false);
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("write and read file", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			await store.write("test-skill", "# Test content");
			expect(await store.exists("test-skill")).toBe(true);
			const content = await store.read("test-skill");
			expect(content).toBe("# Test content");
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("read returns null for non-existent file", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			expect(await store.read("nonexistent")).toBeNull();
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("delete file", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			await store.write("to-delete", "# Content");
			expect(await store.delete("to-delete")).toBe(true);
			expect(await store.exists("to-delete")).toBe(false);
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("delete returns false for non-existent file", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			expect(await store.delete("nonexistent")).toBe(false);
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("list returns all files", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			await store.write("skill-a", "# Skill A");
			await store.write("skill-b", "# Skill B");
			const entries = await store.list();
			expect(entries).toHaveLength(2);
			const names = entries.map(e => e.name);
			expect(names).toContain("skill-a");
			expect(names).toContain("skill-b");
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("listNames returns names without extension", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			await store.write("skill-a", "# Skill A");
			await store.write("skill-b", "# Skill B");
			const names = await store.listNames();
			expect(names).toContain("skill-a");
			expect(names).toContain("skill-b");
			expect(names[0]).not.toEndWith(".md");
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("list only includes files with correct extension", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			await store.write("skill-a", "# Skill A");
			// Write a non-matching file directly
			const otherFile = join(store.rootPath, "other.txt");
			await Bun.write(otherFile, "other content");
			const entries = await store.list();
			expect(entries).toHaveLength(1);
			expect(entries[0].name).toBe("skill-a");
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("rootPath is absolute", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			expect(store.rootPath.startsWith("/")).toBe(true);
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("sanitizeSkillName is applied on write", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			await store.write("My Skill! 123", "# Content");
			// Should be written with sanitized name
			const entries = await store.list();
			expect(entries).toHaveLength(1);
			// The name should be sanitized: lowercase, special chars replaced
			expect(entries[0].name).toMatch(/^[a-z0-9_-]+$/);
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
	});

	test("path traversal protection", async () => {
		const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
		try {
			const store = new FileStore({
				directory: "skills",
				extension: ".md",
				dataDir: skillDir,
			});
			await expect(store.write("../malicious", "# Content")).rejects.toThrow("path traversal");
		} finally {
			rmSync(skillDir, { recursive: true, force: true });
		}
 	});
});
