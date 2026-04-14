/**
 * Integration tests: HTTP handlers (direct calls with mock Request objects).
 * Tests handler logic without full server, using in-memory DB.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { ALL_SCHEMA } from "../../src/database/schema.ts";
import { ModelPool } from "../../src/pool/model-pool.ts";
import { handleHealth } from "../../src/handlers/health.ts";
import { handleV1Models, handleModels } from "../../src/handlers/models.ts";
import { handleProps } from "../../src/handlers/props.ts";
import {
	handleGetConversations,
	handleCreateConversation,
	handleGetConversation,
} from "../../src/handlers/conversations.ts";
import {
	handleGetMessage,
	handleUpdateMessage,
} from "../../src/handlers/messages.ts";
import { handleListSkills, handleCreateSkill } from "../../src/handlers/skills.ts";
import { createConversation } from "../../src/database/queries/conversations.ts";
import { makeConversation, makeMessage } from "../helpers/test-env.ts";
import { createTestConfig } from "../helpers/test-env.ts";
import { createMessage } from "../../src/database/queries/messages.ts";
import { FileStore } from "../../src/services/fs/file-store.ts";
import { tmpdir } from "os";
import { rmSync } from "fs";
import { join } from "path";

let db: Database;
let pool: ModelPool;
let skillDir: string;
let skillStore: FileStore;

function setup() {
	db = new Database(":memory:");
	db.exec("PRAGMA journal_mode=WAL;");
	db.exec("PRAGMA foreign_keys=ON;");
	for (const sql of ALL_SCHEMA) {
		db.exec(sql);
	}

	const config = createTestConfig();
	pool = new ModelPool(config);

	skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
	skillStore = new FileStore({
		directory: "skills",
		extension: ".md",
		dataDir: skillDir,
	});
}

function teardown() {
	try { db.close(); } catch { /* ignore */ }
	try { rmSync(skillDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

afterEach(teardown);

// ─── Health Handler ──────────────────────────────────────────────────────────

describe("handleHealth", () => {
	test("returns 503 initializing before refresh", async () => {
		setup();
		const resp = await handleHealth(pool);
		expect(resp.status).toBe(503);
		const body = await resp.json() as Record<string, unknown>;
		expect(body.status).toBe("initializing");
	});
});

// ─── Models Handlers ─────────────────────────────────────────────────────────

describe("handleV1Models", () => {
	test("returns 503 initializing before refresh", async () => {
		setup();
		const resp = await handleV1Models(pool);
		expect(resp.status).toBe(503);
		const body = await resp.json() as Record<string, unknown>;
		expect(body.status).toBe("initializing");
	});
});

describe("handleModels (router format)", () => {
	test("returns 503 when no llamacpp upstream available", async () => {
		setup();
		const resp = await handleModels(new Request("http://localhost/models"), pool);
		// Returns 503 because pool isn't initialized and no upstream is healthy
		expect(resp.status).toBeGreaterThanOrEqual(400);
	});
});

// ─── Conversation Handlers ───────────────────────────────────────────────────

describe("handleGetConversations", () => {
	test("returns empty list", async () => {
		setup();
		const resp = await handleGetConversations(db);
		expect(resp.status).toBe(200);
		const body = await resp.json() as unknown[];
		expect(body).toEqual([]);
	});

	test("returns all conversations", async () => {
		setup();
		const c1 = makeConversation({ name: "First" });
		const c2 = makeConversation({ name: "Second" });
		createConversation(db, c1);
		createConversation(db, c2);
		const resp = await handleGetConversations(db);
		expect(resp.status).toBe(200);
		const body = await resp.json() as Array<{ name: string }>;
		expect(body).toHaveLength(2);
	});
});

describe("handleCreateConversation", () => {
	test("creates conversation from request body", async () => {
		setup();
		const body = { id: "conv-1", name: "New Conversation" };
		const req = new Request("http://localhost/api/conversations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const resp = await handleCreateConversation(req, db);
		expect(resp.status).toBe(201);
	});

	test("returns 500 for invalid body", async () => {
		setup();
		const req = new Request("http://localhost/api/conversations", {
			method: "POST",
			body: "not-json",
		});
		const resp = await handleCreateConversation(req, db);
		expect(resp.status).toBe(500);
	});
});

describe("handleGetConversation", () => {
	test("returns 404 for non-existent conversation", async () => {
		setup();
		const resp = await handleGetConversation(db, "nonexistent");
		expect(resp.status).toBe(404);
	});

	test("returns conversation by ID", async () => {
		setup();
		const conv = makeConversation({ id: "conv-1" });
		createConversation(db, conv);
		const resp = await handleGetConversation(db, "conv-1");
		expect(resp.status).toBe(200);
		const body = await resp.json() as { id: string };
		expect(body.id).toBe("conv-1");
	});
});

// ─── Message Handlers ────────────────────────────────────────────────────────

describe("handleGetMessage", () => {
	test("returns 404 for non-existent message", async () => {
		setup();
		const resp = await handleGetMessage(db, "nonexistent");
		expect(resp.status).toBe(404);
	});

	test("returns message by ID", async () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		const msg = makeMessage({ convId: conv.id, id: "msg-1" });
		createMessage(db, msg);
		const resp = await handleGetMessage(db, "msg-1");
		expect(resp.status).toBe(200);
		const body = await resp.json() as { id: string };
		expect(body.id).toBe("msg-1");
	});
});

describe("handleUpdateMessage", () => {
	test("updates message", async () => {
		setup();
		const conv = makeConversation();
		createConversation(db, conv);
		const msg = makeMessage({ convId: conv.id, id: "msg-1", content: "Original" });
		createMessage(db, msg);
		const req = new Request(`http://localhost/api/messages/${msg.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content: "Updated" }),
		});
		const resp = await handleUpdateMessage(req, db, msg.id);
		expect(resp.status).toBe(200);
	});

	test("returns 404 for non-existent message", async () => {
		setup();
		const req = new Request("http://localhost/api/messages/nonexistent", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content: "Updated" }),
		});
		const resp = await handleUpdateMessage(req, db, "nonexistent");
		expect(resp.status).toBe(404);
	});
});

// ─── Skills Handlers ─────────────────────────────────────────────────────────

describe("handleListSkills", () => {
	test("returns list of skills", async () => {
		setup();
		const resp = await handleListSkills(db);
		expect(resp.status).toBe(200);
		const body = await resp.json() as Array<{ name: string }>;
		expect(Array.isArray(body)).toBe(true);
		// Note: uses real data/skills/ directory which may have pre-existing skills
	});
});

describe("handleCreateSkill", () => {
	test("creates skill from request body", async () => {
		setup();
		const uniqueName = `test-skill-${Date.now()}`;
		const req = new Request("http://localhost/api/skills", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: uniqueName,
				content: "---\ntitle: Test\n---\nContent",
			}),
		});
		const resp = await handleCreateSkill(req, db);
		// Note: this uses the hardcoded skillFileStore, so the skill goes to the real data/skills/ dir
		// For true isolation, we'd need dependency injection. This test verifies the handler structure.
		expect(resp.status).toBe(201);
	});

	test("returns 400 for missing name", async () => {
		setup();
		const req = new Request("http://localhost/api/skills", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content: "no name" }),
		});
		const resp = await handleCreateSkill(req, db);
		expect(resp.status).toBe(400);
	});
});
