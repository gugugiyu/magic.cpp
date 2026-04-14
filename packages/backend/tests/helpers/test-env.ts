/**
 * Test environment helper.
 * Provides: in-memory SQLite DB, temp skill directory, config factory, cleanup.
 */

import { Database } from 'bun:sqlite';
import { ALL_SCHEMA } from '../../src/database/schema.ts';
import type { Config, UpstreamConfig } from '../../src/config.ts';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

export interface TestEnv {
	db: Database;
	skillDir: string;
	config: Config;
	cleanup: () => void;
}

/**
 * Create a test environment with an in-memory SQLite database and a temporary skill directory.
 * The db instance must be passed explicitly to query functions (don't use getDatabase()).
 */
export function createTestEnv(upstreams?: UpstreamConfig[]): TestEnv {
	const skillDir = join(tmpdir(), `magic-test-skills-${crypto.randomUUID()}`);
	mkdirSync(skillDir, { recursive: true });

	// Create in-memory database
	const db = new Database(':memory:');
	db.exec('PRAGMA journal_mode=WAL;');
	db.exec('PRAGMA foreign_keys=ON;');
	db.exec('PRAGMA busy_timeout=5000;');

	// Run schema
	for (const sql of ALL_SCHEMA) {
		db.exec(sql);
	}

	const defaultUpstreams: UpstreamConfig[] = upstreams ?? [
		{
			id: 'test-upstream-1',
			label: 'Test Upstream 1',
			url: 'http://localhost:9999',
			type: 'llamacpp',
			apiKey: 'test-key-1',
			enabled: true,
			modelList: [],
			resolvedApiKey: 'test-key-1',
		},
		{
			id: 'test-upstream-2',
			label: 'Test Upstream 2',
			url: 'http://localhost:9998',
			type: 'openai',
			apiKey: 'test-key-2',
			enabled: true,
			modelList: [],
			resolvedApiKey: 'test-key-2',
		},
	];

	const config: Config = {
		port: 0,
		staticDir: '../public',
		heartbeatInterval: 30,
		upstreams: defaultUpstreams,
		enabled: true,
		modelList: [],
		debug: true,
		streaming: { enabled: true, bufferWords: 0 },
		database: { path: ':memory:' },
		resolvedStaticDir: skillDir,
		resolvedDatabasePath: ':memory:',
	};

	return {
		db,
		skillDir,
		config,
		cleanup: () => {
			try { db.close(); } catch { /* ignore */ }
			try { rmSync(skillDir, { recursive: true, force: true }); } catch { /* ignore */ }
		},
	};
}

/**
 * Create a minimal config for unit tests that don't need DB or filesystem.
 */
export function createTestConfig(overrides?: Partial<Config>): Config {
	return {
		port: 3000,
		staticDir: '../public',
		heartbeatInterval: 30,
		upstreams: [
			{
				id: 'test',
				label: 'Test',
				url: 'http://localhost:9999',
				type: 'llamacpp',
				apiKey: 'test-key',
				enabled: true,
				modelList: [],
				resolvedApiKey: 'test-key',
			},
		],
		enabled: true,
		modelList: [],
		debug: true,
		streaming: { enabled: true, bufferWords: 0 },
		database: { path: 'data/chat.db' },
		resolvedStaticDir: '/tmp/test-static',
		resolvedDatabasePath: 'data/chat.db',
		...overrides,
	};
}

/**
 * Factory: create a conversation with sensible defaults.
 */
export function makeConversation(overrides?: {
	id?: string;
	name?: string;
	lastModified?: number;
	currNode?: string | null;
	forkedFromConversationId?: string;
	mcpServerOverrides?: Array<{ serverId: string; enabled: boolean }>;
}) {
	return {
		id: overrides?.id ?? crypto.randomUUID(),
		name: overrides?.name ?? 'Test Conversation',
		lastModified: overrides?.lastModified ?? Date.now(),
		currNode: overrides?.currNode ?? null,
		mcpServerOverrides: overrides?.mcpServerOverrides,
		forkedFromConversationId: overrides?.forkedFromConversationId,
	};
}

/**
 * Factory: create a message with sensible defaults.
 */
export function makeMessage(overrides?: {
	id?: string;
	convId?: string;
	type?: string;
	role?: string;
	content?: string;
	parent?: string | null;
	timestamp?: number;
	reasoningContent?: string;
	toolCalls?: string;
	toolCallId?: string;
	extra?: unknown[];
	timings?: unknown;
	model?: string;
}) {
	return {
		id: overrides?.id ?? crypto.randomUUID(),
		convId: overrides?.convId ?? 'test-conv-id',
		type: overrides?.type ?? 'text',
		timestamp: overrides?.timestamp ?? Date.now(),
		role: overrides?.role ?? 'user',
		content: overrides?.content ?? 'Test message content',
		parent: overrides?.parent ?? null,
		reasoningContent: overrides?.reasoningContent,
		toolCalls: overrides?.toolCalls,
		toolCallId: overrides?.toolCallId,
		extra: overrides?.extra,
		timings: overrides?.timings,
		model: overrides?.model,
		children: [],
	};
}
