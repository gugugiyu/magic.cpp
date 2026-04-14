/**
 * Integration tests: Database message queries.
 * Uses in-memory SQLite with real query functions.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { ALL_SCHEMA } from "../../src/database/schema.ts";
import {
	createMessage,
	getMessageById,
	getConversationMessages,
	updateMessage,
	deleteMessage,
	deleteMessages,
	getMessageChildren,
	getDescendantMessageIds,
	reparentMessageChildren,
	createRootMessage,
	createSystemMessage,
	buildMessageTree,
} from "../../src/database/queries/messages.ts";
import { makeConversation, makeMessage } from "../helpers/test-env.ts";
import { createConversation } from "../../src/database/queries/conversations.ts";
import type { DatabaseMessage } from "#shared/types";

let db: Database;
let convId: string;

function setup() {
	db = new Database(":memory:");
	db.exec("PRAGMA journal_mode=WAL;");
	db.exec("PRAGMA foreign_keys=ON;");
	for (const sql of ALL_SCHEMA) {
		db.exec(sql);
	}
	const conv = makeConversation();
	convId = conv.id;
	createConversation(db, conv);
}

function teardown() {
	db.close();
}

afterEach(teardown);

describe("createMessage", () => {
	test("inserts message successfully", () => {
		setup();
		const msg = makeMessage({ convId });
		createMessage(db, msg);
		const retrieved = getMessageById(db, msg.id);
		expect(retrieved).toBeDefined();
		expect(retrieved?.content).toBe(msg.content);
	});

	test("stores JSON fields as parsed objects", () => {
		setup();
		const msg = makeMessage({
			convId,
			extra: [{ type: "TEXT", name: "file.txt", content: "hello" }],
			timings: { prompt_tokens: 10, completion_tokens: 20 },
		});
		createMessage(db, msg);
		const retrieved = getMessageById(db, msg.id);
		expect(retrieved?.extra).toEqual([{ type: "TEXT", name: "file.txt", content: "hello" }]);
		expect(retrieved?.timings).toEqual({ prompt_tokens: 10, completion_tokens: 20 });
	});

	test("stores toolCalls as string", () => {
		setup();
		const msg = makeMessage({ convId, toolCalls: JSON.stringify([{ name: "calc" }]) });
		createMessage(db, msg);
		const retrieved = getMessageById(db, msg.id);
		expect(retrieved?.toolCalls).toBe('[{"name":"calc"}]');
	});
});

describe("getMessageById", () => {
	test("returns undefined for non-existent ID", () => {
		setup();
		expect(getMessageById(db, "nonexistent")).toBeUndefined();
	});

	test("returns message by ID", () => {
		setup();
		const msg = makeMessage({ convId });
		createMessage(db, msg);
		const retrieved = getMessageById(db, msg.id);
		expect(retrieved?.id).toBe(msg.id);
	});
});

describe("getConversationMessages", () => {
	test("returns empty for conversation with no messages", () => {
		setup();
		expect(getConversationMessages(db, convId)).toEqual([]);
	});

	test("returns all messages sorted by timestamp ASC", () => {
		setup();
		const m1 = makeMessage({ convId, content: "First", timestamp: 1000 });
		const m2 = makeMessage({ convId, content: "Second", timestamp: 2000 });
		const m3 = makeMessage({ convId, content: "Third", timestamp: 1500 });
		createMessage(db, m1);
		createMessage(db, m2);
		createMessage(db, m3);
		const msgs = getConversationMessages(db, convId);
		expect(msgs).toHaveLength(3);
		expect(msgs[0].content).toBe("First");
		expect(msgs[1].content).toBe("Third");
		expect(msgs[2].content).toBe("Second");
	});

	test("only returns messages for the correct conversation", () => {
		setup();
		const otherConv = makeConversation();
		createConversation(db, otherConv);
		const msg1 = makeMessage({ convId });
		const msg2 = makeMessage({ convId: otherConv.id });
		createMessage(db, msg1);
		createMessage(db, msg2);
		const msgs = getConversationMessages(db, convId);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].id).toBe(msg1.id);
	});
});

describe("updateMessage", () => {
	test("updates content", () => {
		setup();
		const msg = makeMessage({ convId });
		createMessage(db, msg);
		updateMessage(db, msg.id, { content: "Updated content" });
		const retrieved = getMessageById(db, msg.id);
		expect(retrieved?.content).toBe("Updated content");
	});

	test("updates role", () => {
		setup();
		const msg = makeMessage({ convId, role: "user" });
		createMessage(db, msg);
		updateMessage(db, msg.id, { role: "assistant" });
		const retrieved = getMessageById(db, msg.id);
		expect(retrieved?.role).toBe("assistant");
	});

	test("updates parent", () => {
		setup();
		const m1 = makeMessage({ convId });
		const m2 = makeMessage({ convId });
		createMessage(db, m1);
		createMessage(db, m2);
		updateMessage(db, m2.id, { parent: m1.id });
		const retrieved = getMessageById(db, m2.id);
		expect(retrieved?.parent).toBe(m1.id);
	});

	test("sets parent to null", () => {
		setup();
		const parent = makeMessage({ convId, id: "parent-msg" });
		const m2 = makeMessage({ convId, id: "child-msg", parent: parent.id });
		createMessage(db, parent);
		createMessage(db, m2);
		updateMessage(db, m2.id, { parent: null });
		const retrieved = getMessageById(db, m2.id);
		expect(retrieved?.parent).toBeNull();
	});

	test("updates reasoningContent", () => {
		setup();
		const msg = makeMessage({ convId });
		createMessage(db, msg);
		updateMessage(db, msg.id, { reasoningContent: "Thinking about this..." });
		const retrieved = getMessageById(db, msg.id);
		expect(retrieved?.reasoningContent).toBe("Thinking about this...");
	});

	test("updates extra as JSON", () => {
		setup();
		const msg = makeMessage({ convId });
		createMessage(db, msg);
		updateMessage(db, msg.id, {
			extra: [{ type: "IMAGE", name: "pic.png" }],
		});
		const retrieved = getMessageById(db, msg.id);
		expect(retrieved?.extra).toEqual([{ type: "IMAGE", name: "pic.png" }]);
	});

	test("does nothing when no updates provided", () => {
		setup();
		const msg = makeMessage({ convId, content: "Original" });
		createMessage(db, msg);
		updateMessage(db, msg.id, {});
		const retrieved = getMessageById(db, msg.id);
		expect(retrieved?.content).toBe("Original");
	});
});

describe("deleteMessage", () => {
	test("deletes message", () => {
		setup();
		const msg = makeMessage({ convId });
		createMessage(db, msg);
		deleteMessage(db, msg.id);
		expect(getMessageById(db, msg.id)).toBeUndefined();
	});

	test("delete is idempotent", () => {
		setup();
		const msg = makeMessage({ convId });
		createMessage(db, msg);
		deleteMessage(db, msg.id);
		deleteMessage(db, msg.id);
	});
});

describe("deleteMessages (batch)", () => {
	test("deletes multiple messages", () => {
		setup();
		const m1 = makeMessage({ convId });
		const m2 = makeMessage({ convId });
		const m3 = makeMessage({ convId });
		createMessage(db, m1);
		createMessage(db, m2);
		createMessage(db, m3);
		deleteMessages(db, [m1.id, m2.id]);
		expect(getMessageById(db, m1.id)).toBeUndefined();
		expect(getMessageById(db, m2.id)).toBeUndefined();
		expect(getMessageById(db, m3.id)).toBeDefined();
	});

	test("handles empty array", () => {
		setup();
		deleteMessages(db, []); // Should not throw
	});
});

describe("getMessageChildren", () => {
	test("returns empty for message with no children", () => {
		setup();
		const msg = makeMessage({ convId });
		createMessage(db, msg);
		expect(getMessageChildren(db, msg.id)).toEqual([]);
	});

	test("returns direct children", () => {
		setup();
		const parent = makeMessage({ convId });
		const child1 = makeMessage({ convId, parent: parent.id });
		const child2 = makeMessage({ convId, parent: parent.id });
		createMessage(db, parent);
		createMessage(db, child1);
		createMessage(db, child2);
		const children = getMessageChildren(db, parent.id);
		expect(children).toHaveLength(2);
	});
});

describe("getDescendantMessageIds", () => {
	test("returns all descendants", () => {
		setup();
		const root = makeMessage({ convId });
		const child1 = makeMessage({ convId, parent: root.id });
		const child2 = makeMessage({ convId, parent: root.id });
		const grandchild = makeMessage({ convId, parent: child1.id });
		createMessage(db, root);
		createMessage(db, child1);
		createMessage(db, child2);
		createMessage(db, grandchild);
		const ids = getDescendantMessageIds(db, root.id);
		expect(ids).toHaveLength(3);
		expect(ids).toContain(child1.id);
		expect(ids).toContain(child2.id);
		expect(ids).toContain(grandchild.id);
	});
});

describe("reparentMessageChildren", () => {
	test("reparents children to new parent", () => {
		setup();
		const oldParent = makeMessage({ convId });
		const newParent = makeMessage({ convId });
		const child1 = makeMessage({ convId, parent: oldParent.id });
		const child2 = makeMessage({ convId, parent: oldParent.id });
		createMessage(db, oldParent);
		createMessage(db, newParent);
		createMessage(db, child1);
		createMessage(db, child2);
		reparentMessageChildren(db, [child1.id, child2.id], newParent.id);
		const c1 = getMessageById(db, child1.id);
		const c2 = getMessageById(db, child2.id);
		expect(c1?.parent).toBe(newParent.id);
		expect(c2?.parent).toBe(newParent.id);
	});

	test("reparents to null", () => {
		setup();
		const oldParent = makeMessage({ convId });
		const child = makeMessage({ convId, parent: oldParent.id });
		createMessage(db, oldParent);
		createMessage(db, child);
		reparentMessageChildren(db, [child.id], null);
		const c = getMessageById(db, child.id);
		expect(c?.parent).toBeNull();
	});
});

describe("createRootMessage", () => {
	test("creates a root message", () => {
		setup();
		const root = createRootMessage(db, convId);
		expect(root.type).toBe("root");
		expect(root.role).toBe("system");
		expect(root.content).toBe("");
		expect(root.parent).toBeNull();
		expect(root.convId).toBe(convId);
	});
});

describe("createSystemMessage", () => {
	test("creates a system message", () => {
		setup();
		const root = createRootMessage(db, convId);
		const sys = createSystemMessage(db, convId, "You are a helpful assistant", root.id);
		expect(sys.type).toBe("system");
		expect(sys.role).toBe("system");
		expect(sys.content).toBe("You are a helpful assistant");
		expect(sys.parent).toBe(root.id);
	});

	test("trims prompt content", () => {
		setup();
		const root = createRootMessage(db, convId);
		const sys = createSystemMessage(db, convId, "  Prompt with spaces  ", root.id);
		expect(sys.content).toBe("Prompt with spaces");
	});

	test("throws on empty content", () => {
		setup();
		const root = createRootMessage(db, convId);
		expect(() => createSystemMessage(db, convId, "   ", root.id)).toThrow("empty content");
	});
});

describe("buildMessageTree", () => {
	test("builds children arrays from parent_id relationships", () => {
		const messages: DatabaseMessage[] = [
			makeMessage({ id: "1", convId: "conv", parent: null }),
			makeMessage({ id: "2", convId: "conv", parent: "1" }),
			makeMessage({ id: "3", convId: "conv", parent: "1" }),
			makeMessage({ id: "4", convId: "conv", parent: "2" }),
		];
		const tree = buildMessageTree(messages);
		const root = tree.find(m => m.id === "1");
		expect(root?.children).toContain("2");
		expect(root?.children).toContain("3");
		const msg2 = tree.find(m => m.id === "2");
		expect(msg2?.children).toContain("4");
	});

	test("initializes empty children arrays", () => {
		const messages: DatabaseMessage[] = [
			makeMessage({ id: "1", convId: "conv", parent: null }),
		];
		const tree = buildMessageTree(messages);
		expect(tree[0].children).toEqual([]);
	});

	test("handles messages with no parent", () => {
		const messages: DatabaseMessage[] = [
			makeMessage({ id: "1", convId: "conv", parent: null }),
			makeMessage({ id: "2", convId: "conv", parent: null }),
		];
		const tree = buildMessageTree(messages);
		expect(tree[0].children).toEqual([]);
		expect(tree[1].children).toEqual([]);
	});
});
