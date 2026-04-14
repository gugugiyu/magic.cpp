/**
 * Unit tests: Config loading and Zod validation.
 */

import { describe, test, expect } from "bun:test";
import { loadConfig } from "../../src/config.ts";
import { tmpdir } from "os";
import { writeFileSync, rmSync } from "fs";
import { join } from "path";

describe("Config", () => {
	const tmpDir = tmpdir();
	let configPath = "";

	function writeConfig(obj: Record<string, unknown>): string {
		configPath = join(tmpDir, `test-config-${crypto.randomUUID()}.json`);
		writeFileSync(configPath, JSON.stringify(obj, null, 2));
		return configPath;
	}

	function minimalConfig(): Record<string, unknown> {
		return {
			port: 3000,
			upstreams: [
				{
					id: "test",
					label: "Test",
					url: "http://localhost:9999",
					type: "llamacpp",
					apiKey: "test-key",
				},
			],
		};
	}

	describe("valid config parsing", () => {
		test("parses minimal valid config", () => {
			const p = writeConfig(minimalConfig());
			const config = loadConfig(p);
			expect(config.port).toBe(3000);
			expect(config.upstreams).toHaveLength(1);
			expect(config.upstreams[0].id).toBe("test");
		});

		test("applies default values", () => {
			const p = writeConfig(minimalConfig());
			const config = loadConfig(p);
			expect(config.heartbeatInterval).toBe(30);
			expect(config.staticDir).toBe("../public");
			expect(config.debug).toBe(false);
			expect(config.modelList).toEqual([]);
			expect(config.streaming.enabled).toBe(true);
		});
	});

	describe("missing required fields", () => {
		test("throws when upstreams is missing", () => {
			const p = writeConfig({ port: 3000 });
			expect(() => loadConfig(p)).toThrow();
		});

		test("throws when upstreams is empty array", () => {
			const p = writeConfig({ port: 3000, upstreams: [] });
			expect(() => loadConfig(p)).toThrow();
		});

		test("throws when upstream URL is invalid", () => {
			const p = writeConfig({
				port: 3000,
				upstreams: [{ id: "test", label: "Test", url: "not-a-url", type: "llamacpp" }],
			});
			expect(() => loadConfig(p)).toThrow();
		});

		test("throws when port is not a positive integer", () => {
			const p = writeConfig({
				port: -1,
				upstreams: [{ id: "test", label: "Test", url: "http://localhost:9999", type: "llamacpp" }],
			});
			expect(() => loadConfig(p)).toThrow();
		});

		test("throws when upstream type is invalid", () => {
			const p = writeConfig({
				port: 3000,
				upstreams: [{ id: "test", label: "Test", url: "http://localhost:9999", type: "invalid" }],
			});
			expect(() => loadConfig(p)).toThrow();
		});
	});

	describe("env variable resolution", () => {
		test("resolves $ENV_VAR placeholder", () => {
			const saved = process.env.TEST_API_KEY;
			process.env.TEST_API_KEY = "resolved-secret";
			try {
				const p = writeConfig({
					...minimalConfig(),
					upstreams: [{ id: "test", label: "Test", url: "http://localhost:9999", type: "llamacpp", apiKey: "$TEST_API_KEY" }],
				});
				const config = loadConfig(p);
				expect(config.upstreams[0].resolvedApiKey).toBe("resolved-secret");
			} finally {
				if (saved === undefined) delete process.env.TEST_API_KEY;
				else process.env.TEST_API_KEY = saved;
			}
		});

		test("warns and sets null for missing env var", () => {
			delete process.env.NONEXISTENT_VAR_12345;
			const p = writeConfig({
				...minimalConfig(),
				upstreams: [{ id: "test", label: "Test", url: "http://localhost:9999", type: "llamacpp", apiKey: "$NONEXISTENT_VAR_12345" }],
			});
			const config = loadConfig(p);
			expect(config.upstreams[0].resolvedApiKey).toBeNull();
		});

		test("preserves literal API key", () => {
			const p = writeConfig({
				...minimalConfig(),
				upstreams: [{ id: "test", label: "Test", url: "http://localhost:9999", type: "llamacpp", apiKey: "literal-key" }],
			});
			const config = loadConfig(p);
			expect(config.upstreams[0].resolvedApiKey).toBe("literal-key");
		});

		test("handles null API key", () => {
			const p = writeConfig({
				...minimalConfig(),
				upstreams: [{ id: "test", label: "Test", url: "http://localhost:9999", type: "llamacpp", apiKey: null }],
			});
			const config = loadConfig(p);
			expect(config.upstreams[0].resolvedApiKey).toBeNull();
		});
	});

	describe("URL normalization", () => {
		test("strips trailing /v1", () => {
			const p = writeConfig({
				...minimalConfig(),
				upstreams: [{ id: "test", label: "Test", url: "http://localhost:9999/v1", type: "llamacpp" }],
			});
			const config = loadConfig(p);
			expect(config.upstreams[0].url).toBe("http://localhost:9999");
		});

		test("strips trailing /v1/", () => {
			const p = writeConfig({
				...minimalConfig(),
				upstreams: [{ id: "test", label: "Test", url: "http://localhost:9999/v1/", type: "llamacpp" }],
			});
			const config = loadConfig(p);
			expect(config.upstreams[0].url).toBe("http://localhost:9999");
		});

		test("leaves clean URL unchanged", () => {
			const p = writeConfig({
				...minimalConfig(),
				upstreams: [{ id: "test", label: "Test", url: "http://localhost:9999", type: "llamacpp" }],
			});
			const config = loadConfig(p);
			expect(config.upstreams[0].url).toBe("http://localhost:9999");
		});
	});

	describe("default values", () => {
		test("streaming defaults", () => {
			const p = writeConfig(minimalConfig());
			const config = loadConfig(p);
			expect(config.streaming.enabled).toBe(true);
			expect(config.streaming.bufferWords).toBe(0);
		});

		test("database defaults", () => {
			const p = writeConfig(minimalConfig());
			const config = loadConfig(p);
			expect(config.database.path).toBe("data/chat.db");
		});

		test("enabled defaults to true", () => {
			const p = writeConfig(minimalConfig());
			const config = loadConfig(p);
			expect(config.enabled).toBe(true);
		});

		test("upstream enabled defaults to true", () => {
			const p = writeConfig(minimalConfig());
			const config = loadConfig(p);
			expect(config.upstreams[0].enabled).toBe(true);
		});

		test("upstream modelList defaults to empty", () => {
			const p = writeConfig(minimalConfig());
			const config = loadConfig(p);
			expect(config.upstreams[0].modelList).toEqual([]);
		});
	});

	describe("resolved paths", () => {
		test("resolvedStaticDir is absolute and relative to config file", () => {
			const p = writeConfig(minimalConfig());
			const config = loadConfig(p);
			expect(config.resolvedStaticDir).toBeTruthy();
			expect(config.resolvedStaticDir.startsWith("/")).toBe(true);
		});

		test("resolvedDatabasePath is absolute", () => {
			const p = writeConfig(minimalConfig());
			const config = loadConfig(p);
			expect(config.resolvedDatabasePath.startsWith("/")).toBe(true);
		});
	});
});
