/**
 * Unit tests: Header utilities.
 */

import { describe, test, expect } from "bun:test";
import { injectAuth, unwrapProxyHeaders, forwardHeaders } from "../../src/utils/headers.ts";

describe("injectAuth", () => {
	test("adds Authorization header when API key is present", () => {
		const headers: Record<string, string> = {};
		injectAuth(headers, "secret-key");
		expect(headers["Authorization"]).toBe("Bearer secret-key");
	});

	test("does not add header when API key is null", () => {
		const headers: Record<string, string> = {};
		injectAuth(headers, null);
		expect(headers["Authorization"]).toBeUndefined();
	});

	test("does not add header when API key is empty", () => {
		const headers: Record<string, string> = {};
		injectAuth(headers, "");
		expect(headers["Authorization"]).toBeUndefined();
	});

	test("overwrites existing Authorization header", () => {
		const headers: Record<string, string> = { "Authorization": "Bearer old-key" };
		injectAuth(headers, "new-key");
		expect(headers["Authorization"]).toBe("Bearer new-key");
	});
});

describe("unwrapProxyHeaders", () => {
	test("extracts proxied headers and strips prefix", () => {
		const incoming = new Headers({
			"x-proxy-header-content-type": "application/json",
			"x-proxy-header-custom": "custom-value",
			"other-header": "should-be-ignored",
		});
		const unwrapped = unwrapProxyHeaders(incoming);
		expect(unwrapped["content-type"]).toBe("application/json");
		expect(unwrapped["custom"]).toBe("custom-value");
		expect(unwrapped["other-header"]).toBeUndefined();
	});

	test("returns empty object when no proxy headers", () => {
		const incoming = new Headers({
			"content-type": "application/json",
		});
		const unwrapped = unwrapProxyHeaders(incoming);
		expect(Object.keys(unwrapped)).toHaveLength(0);
	});

	test("is case-insensitive for header names", () => {
		const incoming = new Headers({
			"X-Proxy-Header-Foo": "bar",
		});
		const unwrapped = unwrapProxyHeaders(incoming);
		expect(unwrapped["foo"]).toBe("bar");
	});
});

describe("forwardHeaders", () => {
	test("forwards safe headers", () => {
		const incoming = new Headers({
			"content-type": "application/json",
			"accept": "application/json",
			"x-custom-header": "custom-value",
		});
		const forwarded = forwardHeaders(incoming, null);
		expect(forwarded["content-type"]).toBe("application/json");
		expect(forwarded["x-custom-header"]).toBe("custom-value");
	});

	test("skips hop-by-hop headers", () => {
		const incoming = new Headers({
			"connection": "keep-alive",
			"keep-alive": "timeout=5",
			"transfer-encoding": "chunked",
			"content-type": "application/json",
		});
		const forwarded = forwardHeaders(incoming, null);
		expect(forwarded["connection"]).toBeUndefined();
		expect(forwarded["keep-alive"]).toBeUndefined();
		expect(forwarded["transfer-encoding"]).toBeUndefined();
		expect(forwarded["content-type"]).toBe("application/json");
	});

	test("skips browser/security headers", () => {
		const incoming = new Headers({
			"origin": "http://localhost:5173",
			"referer": "http://localhost:5173/chat",
			"cookie": "session=abc",
			"user-agent": "Mozilla/5.0",
			"content-type": "application/json",
		});
		const forwarded = forwardHeaders(incoming, null);
		expect(forwarded["origin"]).toBeUndefined();
		expect(forwarded["referer"]).toBeUndefined();
		expect(forwarded["cookie"]).toBeUndefined();
		expect(forwarded["user-agent"]).toBeUndefined();
		expect(forwarded["content-type"]).toBe("application/json");
	});

	test("injects API key as Authorization", () => {
		const incoming = new Headers({
			"content-type": "application/json",
		});
		const forwarded = forwardHeaders(incoming, "secret-key");
		expect(forwarded["Authorization"]).toBe("Bearer secret-key");
	});

	test("preserves streaming accept header", () => {
		const incoming = new Headers({
			"accept": "text/event-stream",
		});
		const forwarded = forwardHeaders(incoming, null);
		expect(forwarded["accept"]).toBe("text/event-stream");
	});

	test("sets JSON accept when not streaming", () => {
		const incoming = new Headers({
			"accept": "text/html",
		});
		const forwarded = forwardHeaders(incoming, null);
		expect(forwarded["accept"]).toBe("application/json");
	});

	test("strips proxy header prefix", () => {
		const incoming = new Headers({
			"x-proxy-header-content-type": "application/json",
			"content-type": "text/html",
		});
		const forwarded = forwardHeaders(incoming, null);
		expect(forwarded["x-proxy-header-content-type"]).toBeUndefined();
	});
});
