/**
 * Unit tests: CORS utilities.
 */

import { describe, test, expect } from "bun:test";
import { corsHeaders, applyCorsHeaders } from "../../src/utils/cors.ts";
import { createTestConfig } from "../helpers/test-env.ts";

describe("corsHeaders", () => {
	test("returns wildcard in debug mode", () => {
		const config = createTestConfig({ debug: true });
		const headers = corsHeaders(config);
		expect(headers["Access-Control-Allow-Origin"]).toBe("*");
	});

	test("returns localhost in non-debug mode", () => {
		const config = createTestConfig({ debug: false });
		const headers = corsHeaders(config);
		expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
	});

	test("always includes correct methods", () => {
		const config = createTestConfig();
		const headers = corsHeaders(config);
		expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, DELETE, OPTIONS, HEAD");
	});

	test("always includes correct headers", () => {
		const config = createTestConfig();
		const headers = corsHeaders(config);
		expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization");
	});
});

describe("applyCorsHeaders", () => {
	test("sets CORS headers on Headers object", () => {
		const headers = new Headers();
		applyCorsHeaders(headers);
		expect(headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS, HEAD");
		expect(headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
	});

	test("overwrites existing headers", () => {
		const headers = new Headers({
			"Access-Control-Allow-Origin": "http://example.com",
		});
		applyCorsHeaders(headers);
		expect(headers.get("Access-Control-Allow-Origin")).toBe("*");
	});
});
