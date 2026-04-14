/**
 * Unit tests: Message branching utilities.
 */

import { describe, test, expect } from "bun:test";
import {
	findMessageById,
	filterByLeafNodeId,
	findLeafNode,
	findDescendantMessages,
	getMessageSiblings,
	getMessageDisplayList,
	hasMessageSiblings,
	getNextSibling,
	getPreviousSibling,
} from "../../src/utils/branching.ts";
import type { DatabaseMessage } from "#shared/types";

function msg(id: string, parent: string | null, type = "text", role = "user", timestamp = 100): DatabaseMessage {
	return {
		id,
		convId: "conv-1",
		type,
		timestamp: timestamp + parseInt(id.replace(/[^0-9]/g, "").slice(0, 3) || "0"),
		role,
		content: `Content ${id}`,
		parent,
		children: [],
	};
}

describe("findMessageById", () => {
	const messages: DatabaseMessage[] = [
		msg("1", null),
		msg("2", "1"),
		msg("3", "2"),
	];

	test("finds existing message", () => {
		const found = findMessageById(messages, "2");
		expect(found).toBeDefined();
		expect(found?.id).toBe("2");
	});

	test("returns undefined for non-existent ID", () => {
		const found = findMessageById(messages, "999");
		expect(found).toBeUndefined();
	});

	test("returns undefined for null ID", () => {
		const found = findMessageById(messages, null);
		expect(found).toBeUndefined();
	});

	test("returns undefined for undefined ID", () => {
		const found = findMessageById(messages, undefined);
		expect(found).toBeUndefined();
	});
});

describe("filterByLeafNodeId", () => {
	// Tree: 1(root) -> 2 -> 3(leaf)
	//                -> 4(leaf)
	const messages: DatabaseMessage[] = [
		msg("1", null, "root", "system", 100),
		msg("2", "1"),
		msg("3", "2"),
		msg("4", "2"),
	];

	// Set children for proper leaf traversal
	messages[0].children = ["2"];
	messages[1].children = ["3", "4"];
	messages[2].children = [];
	messages[3].children = [];

	test("traces path to leaf node", () => {
		const path = filterByLeafNodeId(messages, "3");
		const ids = path.map(m => m.id);
		expect(ids).toContain("3");
		expect(ids).toContain("2");
	});

	test("excludes root messages by default", () => {
		const path = filterByLeafNodeId(messages, "3");
		const hasRoot = path.some(m => m.type === "root");
		expect(hasRoot).toBe(false);
	});

	test("includes root when includeRoot=true", () => {
		const path = filterByLeafNodeId(messages, "3", true);
		const hasRoot = path.some(m => m.type === "root");
		expect(hasRoot).toBe(true);
	});

	test("sorts system messages first", () => {
		const path = filterByLeafNodeId(messages, "3", true);
		if (path.length > 1) {
			expect(path[0].role).toBe("system");
		}
	});

	test("uses latest message if leaf not found", () => {
		const path = filterByLeafNodeId(messages, "nonexistent");
		expect(path.length).toBeGreaterThan(0);
	});
});

describe("findLeafNode", () => {
	// Tree: 1 -> 2 -> 3
	//           -> 4 -> 5
	const messages: DatabaseMessage[] = [
		msg("1", null),
		msg("2", "1"),
		msg("3", "2"),
		msg("4", "2"),
		msg("5", "4"),
	];

	messages[0].children = ["2"];
	messages[1].children = ["3", "4"];
	messages[2].children = [];
	messages[3].children = ["5"];
	messages[4].children = [];

	test("returns same ID for leaf node", () => {
		expect(findLeafNode(messages, "3")).toBe("3");
	});

	test("traverses to deepest child", () => {
		expect(findLeafNode(messages, "1")).toBe("5");
		expect(findLeafNode(messages, "2")).toBe("5");
		expect(findLeafNode(messages, "4")).toBe("5");
	});
});

describe("findDescendantMessages", () => {
	// Tree: 1 -> 2 -> 4
	//           -> 3
	const messages: DatabaseMessage[] = [
		msg("1", null),
		msg("2", "1"),
		msg("3", "1"),
		msg("4", "2"),
	];

	messages[0].children = ["2", "3"];
	messages[1].children = ["4"];
	messages[2].children = [];
	messages[3].children = [];

	test("finds all descendants", () => {
		const descendants = findDescendantMessages(messages, "1");
		expect(descendants).toContain("2");
		expect(descendants).toContain("3");
		expect(descendants).toContain("4");
		expect(descendants).toHaveLength(3);
	});

	test("finds direct children only", () => {
		const descendants = findDescendantMessages(messages, "2");
		expect(descendants).toContain("4");
		expect(descendants).toHaveLength(1);
	});

	test("returns empty for leaf node", () => {
		const descendants = findDescendantMessages(messages, "4");
		expect(descendants).toHaveLength(0);
	});
});

describe("getMessageSiblings", () => {
	// Tree: 1(root) -> 2 -> 3
	//                 -> 4
	const messages: DatabaseMessage[] = [
		msg("1", null, "root", "system", 100),
		msg("2", "1"),
		msg("3", "2"),
		msg("4", "2"),
	];

	messages[0].children = ["2"];
	messages[1].children = ["3", "4"];
	messages[2].children = [];
	messages[3].children = [];

	test("returns sibling info for messages with same parent", () => {
		const sibs3 = getMessageSiblings(messages, "3");
		expect(sibs3).not.toBeNull();
		expect(sibs3?.totalSiblings).toBe(2);
		expect(sibs3?.currentIndex).toBe(0);

		const sibs4 = getMessageSiblings(messages, "4");
		expect(sibs4?.totalSiblings).toBe(2);
		expect(sibs4?.currentIndex).toBe(1);
	});

	test("returns single message for root with no siblings", () => {
		const sibs = getMessageSiblings(messages, "1");
		expect(sibs?.totalSiblings).toBe(1);
	});

	test("returns null for non-existent message", () => {
		const sibs = getMessageSiblings(messages, "nonexistent");
		expect(sibs).toBeNull();
	});
});

describe("getMessageDisplayList", () => {
	const messages: DatabaseMessage[] = [
		msg("1", null, "root", "system", 100),
		msg("2", "1"),
		msg("3", "2"),
	];

	messages[0].children = ["2"];
	messages[1].children = ["3"];
	messages[2].children = [];

	test("returns display list excluding root", () => {
		const list = getMessageDisplayList(messages, "3");
		const hasRoot = list.some(s => s.message.type === "root");
		expect(hasRoot).toBe(false);
		expect(list.length).toBeGreaterThan(0);
	});
});

describe("hasMessageSiblings", () => {
	const messages: DatabaseMessage[] = [
		msg("1", null, "root", "system", 100),
		msg("2", "1"),
		msg("3", "1"),
	];

	messages[0].children = ["2", "3"];
	messages[1].children = [];
	messages[2].children = [];

	test("returns true when siblings exist", () => {
		expect(hasMessageSiblings(messages, "2")).toBe(true);
	});

	test("returns false for only child", () => {
		const singleMessages: DatabaseMessage[] = [
			msg("1", null, "root", "system", 100),
			msg("2", "1"),
		];
		singleMessages[0].children = ["2"];
		singleMessages[1].children = [];
		expect(hasMessageSiblings(singleMessages, "2")).toBe(false);
	});
});

describe("getNextSibling / getPreviousSibling", () => {
	const messages: DatabaseMessage[] = [
		msg("1", null, "root", "system", 100),
		msg("2", "1"),
		msg("3", "1"),
		msg("4", "1"),
	];

	messages[0].children = ["2", "3", "4"];
	messages[1].children = [];
	messages[2].children = [];
	messages[3].children = [];

	test("getNextSibling returns next", () => {
		expect(getNextSibling(messages, "2")).toBe("3");
		expect(getNextSibling(messages, "3")).toBe("4");
	});

	test("getNextSibling returns null at end", () => {
		expect(getNextSibling(messages, "4")).toBeNull();
	});

	test("getPreviousSibling returns previous", () => {
		expect(getPreviousSibling(messages, "4")).toBe("3");
		expect(getPreviousSibling(messages, "3")).toBe("2");
	});

	test("getPreviousSibling returns null at start", () => {
		expect(getPreviousSibling(messages, "2")).toBeNull();
	});
});
