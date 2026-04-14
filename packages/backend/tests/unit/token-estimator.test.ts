/**
 * Unit tests: Token estimation utilities.
 */

import { describe, test, expect } from "bun:test";
import { estimateTokenCount, estimateMessagesTokenCount } from "../../src/utils/token-estimator.ts";

describe("estimateTokenCount", () => {
	test("returns 0 for empty string", () => {
		expect(estimateTokenCount("")).toBe(0);
	});

	test("returns 0 for whitespace-only string", () => {
		expect(estimateTokenCount("   \n\t  ")).toBe(0);
	});

	test("estimates ASCII text", () => {
		const text = "The quick brown fox jumps over the lazy dog";
		const count = estimateTokenCount(text);
		expect(count).toBeGreaterThan(0);
		// ~9 words, ~43 chars, should be roughly 10-15 tokens
		expect(count).toBeGreaterThanOrEqual(8);
	});

	test("estimates CJK characters", () => {
		const text = "你好世界";
		const count = estimateTokenCount(text);
		expect(count).toBeGreaterThan(0);
		// CJK is ~1.5 chars/token, so 4 chars ≈ 3 tokens minimum
		expect(count).toBeGreaterThanOrEqual(2);
	});

	test("estimates mixed ASCII and CJK", () => {
		const text = "Hello 世界 and more text 你好";
		const count = estimateTokenCount(text);
		expect(count).toBeGreaterThan(0);
	});

	test("estimates emoji", () => {
		const text = "🚀🎉🔥💡";
		const count = estimateTokenCount(text);
		expect(count).toBeGreaterThan(0);
	});

	test("short text gets slight boost", () => {
		const shortText = "Hi";
		const longText = "The quick brown fox jumps over the lazy dog and then some more text to make it longer than fifty characters total";
		const shortPerChar = estimateTokenCount(shortText) / Math.max(shortText.length, 1);
		const longPerChar = estimateTokenCount(longText) / Math.max(longText.length, 1);
		// Short text should have higher per-char ratio due to 1.1x boost
		expect(shortPerChar).toBeGreaterThanOrEqual(longPerChar);
	});

	test("long text gets slight reduction", () => {
		const longText = "a".repeat(2000);
		const count = estimateTokenCount(longText);
		expect(count).toBeGreaterThan(0);
	});
});

describe("estimateMessagesTokenCount", () => {
	test("returns 0 for empty messages array", () => {
		expect(estimateMessagesTokenCount([])).toBe(0);
	});

	test("counts tokens for single message", () => {
		const messages = [{ content: "Hello world" }];
		const count = estimateMessagesTokenCount(messages);
		// Should include per-message overhead + reply prime
		expect(count).toBeGreaterThan(estimateTokenCount("Hello world"));
	});

	test("counts tokens for multiple messages", () => {
		const messages = [
			{ content: "Hello" },
			{ content: "Hi there" },
			{ content: "How are you?" },
		];
		const count = estimateMessagesTokenCount(messages);
		expect(count).toBeGreaterThan(0);
	});

	test("handles missing content field", () => {
		const messages = [{}];
		const count = estimateMessagesTokenCount(messages);
		// Should count per-message overhead even with no content
		expect(count).toBeGreaterThan(0);
	});

	test("handles undefined content field", () => {
		const messages = [{ content: undefined }];
		const count = estimateMessagesTokenCount(messages);
		expect(count).toBeGreaterThan(0);
	});
});
