/**
 * Unit tests: Prompts and built-in tools.
 */

import { describe, test, expect } from "bun:test";
import {
	buildCompactSystemMessage,
	COMPACT_SUMMARIZER_BASE_PROMPT,
	SUBAGENT_DEFAULT_PROMPT,
	TOOL_OUTPUT_SUMMARIZER_PROMPT,
	BUILTIN_TOOLS,
	TOOL_CALCULATOR,
	TOOL_GET_TIME,
	TOOL_GET_LOCATION,
	TOOL_SEQUENTIAL_THINKING,
	TOOL_CALL_SUBAGENT,
	TOOL_LIST_SKILL,
	TOOL_READ_SKILL,
} from "#shared/constants/prompts-and-tools";

describe("buildCompactSystemMessage", () => {
	test("returns system message with base prompt", () => {
		const msg = buildCompactSystemMessage();
		expect(msg.role).toBe("system");
		expect(msg.content).toContain(COMPACT_SUMMARIZER_BASE_PROMPT);
	});

	test("includes previous summary when provided", () => {
		const summary = "Previous summary of conversation";
		const msg = buildCompactSystemMessage(summary);
		expect(msg.content).toContain(summary);
		expect(msg.content).toContain("PREVIOUS_COMPACT_SUMMARY");
		expect(msg.content).toContain("MUST incorporate key context");
	});

	test("does not include previous summary section when not provided", () => {
		const msg = buildCompactSystemMessage();
		expect(msg.content).not.toContain("PREVIOUS_COMPACT_SUMMARY");
		expect(msg.content).not.toContain("MUST incorporate key context");
	});
});

describe("built-in tool definitions", () => {
	test("BUILTIN_TOOLS has 7 tools", () => {
		expect(BUILTIN_TOOLS).toHaveLength(7);
	});

	test("each tool has required structure", () => {
		for (const tool of BUILTIN_TOOLS) {
			expect(tool.type).toBe("function");
			expect(tool.function.name).toBeTruthy();
			expect(tool.function.description).toBeTruthy();
			expect(tool.function.parameters).toBeTruthy();
			expect(tool.function.parameters.type).toBe("object");
			expect(tool.function.parameters.properties).toBeTruthy();
		}
	});

	test("TOOL_CALCULATOR has expression parameter", () => {
		expect(TOOL_CALCULATOR.function.name).toBe("calculator");
		expect(TOOL_CALCULATOR.function.parameters.properties.expression).toBeTruthy();
		expect(TOOL_CALCULATOR.function.parameters.required).toContain("expression");
	});

	test("TOOL_GET_TIME has no required parameters", () => {
		expect(TOOL_GET_TIME.function.name).toBe("get_time");
		expect(TOOL_GET_TIME.function.parameters.required).toHaveLength(0);
	});

	test("TOOL_GET_LOCATION has no required parameters", () => {
		expect(TOOL_GET_LOCATION.function.name).toBe("get_location");
		expect(TOOL_GET_LOCATION.function.parameters.required).toHaveLength(0);
	});

	test("TOOL_SEQUENTIAL_THINKING has required parameters", () => {
		expect(TOOL_SEQUENTIAL_THINKING.function.name).toBe("sequential_thinking");
		const required = TOOL_SEQUENTIAL_THINKING.function.parameters.required;
		expect(required).toContain("thought");
		expect(required).toContain("thoughtNumber");
		expect(required).toContain("totalThoughts");
		expect(required).toContain("nextThoughtNeeded");
	});

	test("TOOL_CALL_SUBAGENT has prompt parameter", () => {
		expect(TOOL_CALL_SUBAGENT.function.name).toBe("call_subagent");
		expect(TOOL_CALL_SUBAGENT.function.parameters.properties.prompt).toBeTruthy();
		expect(TOOL_CALL_SUBAGENT.function.parameters.required).toContain("prompt");
	});

	test("TOOL_LIST_SKILL has no required parameters", () => {
		expect(TOOL_LIST_SKILL.function.name).toBe("list_skill");
		expect(TOOL_LIST_SKILL.function.parameters.required).toHaveLength(0);
	});

	test("TOOL_READ_SKILL has name parameter", () => {
		expect(TOOL_READ_SKILL.function.name).toBe("read_skill");
		expect(TOOL_READ_SKILL.function.parameters.properties.name).toBeTruthy();
		expect(TOOL_READ_SKILL.function.parameters.required).toContain("name");
	});
});

describe("prompt constants", () => {
	test("SUBAGENT_DEFAULT_PROMPT is non-empty", () => {
		expect(SUBAGENT_DEFAULT_PROMPT.length).toBeGreaterThan(10);
	});

	test("COMPACT_SUMMARIZER_BASE_PROMPT is non-empty", () => {
		expect(COMPACT_SUMMARIZER_BASE_PROMPT.length).toBeGreaterThan(10);
	});

	test("TOOL_OUTPUT_SUMMARIZER_PROMPT is non-empty", () => {
		expect(TOOL_OUTPUT_SUMMARIZER_PROMPT.length).toBeGreaterThan(10);
	});
});
