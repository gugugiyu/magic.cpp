/**
 * Database schema definitions for SQLite.
 * All SQL statements used to initialize the database.
 */

export const SCHEMA_VERSION = 1;

export const CREATE_CONVERSATIONS_TABLE = `
	CREATE TABLE IF NOT EXISTS conversations (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		last_modified INTEGER NOT NULL,
		curr_node TEXT,
		mcp_server_overrides TEXT,
		forked_from_conversation_id TEXT,
		created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
		FOREIGN KEY (forked_from_conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
	);
`;

export const CREATE_MESSAGES_TABLE = `
	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		conv_id TEXT NOT NULL,
		type TEXT NOT NULL,
		timestamp INTEGER NOT NULL,
		role TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		parent_id TEXT,
		reasoning_content TEXT,
		tool_calls TEXT,
		tool_call_id TEXT,
		extra TEXT,
		timings TEXT,
		model TEXT,
		FOREIGN KEY (conv_id) REFERENCES conversations(id) ON DELETE CASCADE,
		FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE SET NULL
	);
`;

export const CREATE_INDEXES = [
	'CREATE INDEX IF NOT EXISTS idx_conv_last_modified ON conversations(last_modified DESC);',
	'CREATE INDEX IF NOT EXISTS idx_conv_forked ON conversations(forked_from_conversation_id);',
	'CREATE INDEX IF NOT EXISTS idx_msg_conv_id ON messages(conv_id);',
	'CREATE INDEX IF NOT EXISTS idx_msg_parent ON messages(parent_id);',
	'CREATE INDEX IF NOT EXISTS idx_msg_timestamp ON messages(timestamp ASC);'
];

export const ALL_SCHEMA = [
	CREATE_CONVERSATIONS_TABLE,
	CREATE_MESSAGES_TABLE,
	...CREATE_INDEXES
];
