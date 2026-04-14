/**
 * Integration tests: Database conversation queries.
 * Uses in-memory SQLite with real query functions (not getDatabase() singleton).
 */

import { describe, test, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { ALL_SCHEMA } from "../../src/database/schema.ts";
import {
	createConversation,
	getConversation,
	getAllConversations,
	updateConversation,
	deleteConversation,
	getChildrenConversations,
	getDescendantConversationIds,
} from "../../src/database/queries/conversations.ts";
import { makeConversation } from "../helpers/test-env.ts";
import type { DatabaseConversation } from "#shared/types";

let db: Database;

function setup() {
	db = new Database(":memory:");
	db.exec("PRAGMA journal_mode=WAL;");
	db.exec("PRAGMA foreign_keys=ON;");
	for (const sql of ALL_SCHEMA) {
		db.exec(sql);
	}
}

function teardown() {
	db.close();
}

afterEach(teardown);

describe("createConversation", () => {
	test("inserts conversation successfully", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		const retrieved = getConversation(db, conv.id);
		expect(retrieved).toBeDefined();
		expect(retrieved?.name).toBe(conv.name);
	});

	test("stores mcpServerOverrides as JSON", () => {
		setup();
		const overrides = [{ serverId: "srv-1", enabled: true }];
		const conv = makeConversation({ mcpServerOverrides: overrides });
		createConversation(db, conv);
		const retrieved = getConversation(db, conv.id);
		expect(retrieved?.mcpServerOverrides).toBeDefined();
		expect(retrieved?.mcpServerOverrides).toHaveLength(1);
		expect(retrieved?.mcpServerOverrides?.[0].serverId).toBe("srv-1");
	});

	test("stores forkedFromConversationId", () => {
		setup();
		const parent = makeConversation();
		createConversation(db, parent);
		const child = makeConversation({ forkedFromConversationId: parent.id });
		createConversation(db, child);
		const retrieved = getConversation(db, child.id);
		expect(retrieved?.forkedFromConversationId).toBe(parent.id);
	});
});

describe("getConversation", () => {
	test("returns undefined for non-existent ID", () => {
		setup();
		expect(getConversation(db, "nonexistent")).toBeUndefined();
	});

	test("returns conversation by ID", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		const retrieved = getConversation(db, conv.id);
		expect(retrieved?.id).toBe(conv.id);
		expect(retrieved?.name).toBe(conv.name);
	});
});

describe("getAllConversations", () => {
	test("returns empty array when no conversations", () => {
		setup();
		expect(getAllConversations(db)).toEqual([]);
	});

	test("returns all conversations", () => {
		setup();
		const c1 = makeConversation({ name: "First", lastModified: 1000 });
		const c2 = makeConversation({ name: "Second", lastModified: 2000 });
		createConversation(db, c1);
		createConversation(db, c2);
		const all = getAllConversations(db);
		expect(all).toHaveLength(2);
	});

	test("sorted by last_modified DESC", () => {
		setup();
		const c1 = makeConversation({ name: "Old", lastModified: 1000 });
		const c2 = makeConversation({ name: "New", lastModified: 2000 });
		const c3 = makeConversation({ name: "Middle", lastModified: 1500 });
		createConversation(db, c1);
		createConversation(db, c2);
		createConversation(db, c3);
		const all = getAllConversations(db);
		expect(all[0].name).toBe("New");
		expect(all[1].name).toBe("Middle");
		expect(all[2].name).toBe("Old");
	});
});

describe("updateConversation", () => {
	test("updates name", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		updateConversation(db, conv.id, { name: "Updated Name" });
		const retrieved = getConversation(db, conv.id);
		expect(retrieved?.name).toBe("Updated Name");
	});

	test("updates currNode", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		updateConversation(db, conv.id, { currNode: "msg-123" });
		const retrieved = getConversation(db, conv.id);
		expect(retrieved?.currNode).toBe("msg-123");
	});

	test("updates mcpServerOverrides", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		updateConversation(db, conv.id, {
			mcpServerOverrides: [{ serverId: "srv-2", enabled: false }],
		});
		const retrieved = getConversation(db, conv.id);
		expect(retrieved?.mcpServerOverrides).toEqual([{ serverId: "srv-2", enabled: false }]);
	});

	test("auto-updates lastModified when not provided", () => {
		setup();
		const conv = makeConversation({ lastModified: 1000 });
		createConversation(db, conv);
		const before = Date.now();
		updateConversation(db, conv.id, { name: "Updated" });
		const after = Date.now();
		const retrieved = getConversation(db, conv.id);
		expect(retrieved?.lastModified).toBeGreaterThanOrEqual(before);
		expect(retrieved?.lastModified).toBeLessThanOrEqual(after);
	});

	test("uses provided lastModified when given", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		updateConversation(db, conv.id, { name: "Updated", lastModified: 9999 });
		const retrieved = getConversation(db, conv.id);
		expect(retrieved?.lastModified).toBe(9999);
	});

	test("does nothing when no updates provided", () => {
		setup();
		const conv = makeConversation({ name: "Original" });
		createConversation(db, conv);
		updateConversation(db, conv.id, {});
		const retrieved = getConversation(db, conv.id);
		expect(retrieved?.name).toBe("Original");
	});
});

describe("deleteConversation", () => {
	test("deletes conversation", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		deleteConversation(db, conv.id);
		expect(getConversation(db, conv.id)).toBeUndefined();
	});

	test("delete is idempotent", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		deleteConversation(db, conv.id);
		deleteConversation(db, conv.id); // Should not throw
	});
});

describe("getChildrenConversations", () => {
	test("returns empty for no forks", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		expect(getChildrenConversations(db, conv.id)).toEqual([]);
	});

	test("returns direct children", () => {
		setup();
		const parent = makeConversation();
		createConversation(db, parent);
		const child1 = makeConversation({ forkedFromConversationId: parent.id });
		const child2 = makeConversation({ forkedFromConversationId: parent.id });
		createConversation(db, child1);
		createConversation(db, child2);
		const children = getChildrenConversations(db, parent.id);
		expect(children).toHaveLength(2);
		expect(children.map(c => c.id)).toContain(child1.id);
		expect(children.map(c => c.id)).toContain(child2.id);
	});

	test("does not return grandchildren", () => {
		setup();
		const grandparent = makeConversation();
		const parent = makeConversation({ forkedFromConversationId: grandparent.id });
		const child = makeConversation({ forkedFromConversationId: parent.id });
		createConversation(db, grandparent);
		createConversation(db, parent);
		createConversation(db, child);
		const children = getChildrenConversations(db, grandparent.id);
		expect(children).toHaveLength(1);
		expect(children[0].id).toBe(parent.id);
	});
});

describe("getDescendantConversationIds", () => {
	test("returns empty for leaf", () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		expect(getDescendantConversationIds(db, conv.id)).toEqual([]);
	});

	test("returns all descendants recursively", () => {
		setup();
		const root = makeConversation({ name: "root" });
		const child1 = makeConversation({ forkedFromConversationId: root.id });
		const child2 = makeConversation({ forkedFromConversationId: root.id });
		const grandchild = makeConversation({ forkedFromConversationId: child1.id });
		createConversation(db, root);
		createConversation(db, child1);
		createConversation(db, child2);
		createConversation(db, grandchild);
		const ids = getDescendantConversationIds(db, root.id);
		expect(ids).toHaveLength(3);
		expect(ids).toContain(child1.id);
		expect(ids).toContain(child2.id);
		expect(ids).toContain(grandchild.id);
	});
});
