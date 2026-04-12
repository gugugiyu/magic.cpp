/**
 * Conversation database queries.
 * All operations related to conversations in SQLite using bun:sqlite.
 */

import { Database } from 'bun:sqlite';
import type { DatabaseConversation, McpServerOverride } from '../../types/database';

/**
 * Create a new conversation.
 */
export function createConversation(
	db: Database,
	conversation: DatabaseConversation
): void {
	const stmt = db.prepare(
		`INSERT INTO conversations (id, name, last_modified, curr_node, mcp_server_overrides, forked_from_conversation_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	);
	stmt.run(
		conversation.id,
		conversation.name,
		conversation.lastModified,
		conversation.currNode || null,
		conversation.mcpServerOverrides ? JSON.stringify(conversation.mcpServerOverrides) : null,
		conversation.forkedFromConversationId || null,
		Date.now()
	);
}

/**
 * Get a conversation by ID.
 */
export function getConversation(db: Database, id: string): DatabaseConversation | undefined {
	const row = db
		.query('SELECT * FROM conversations WHERE id = ?')
		.get(id) as Record<string, unknown> | undefined;

	if (!row) return undefined;
	return rowToConversation(row);
}

/**
 * Get all conversations sorted by last_modified DESC.
 */
export function getAllConversations(db: Database): DatabaseConversation[] {
	const rows = db
		.query('SELECT * FROM conversations ORDER BY last_modified DESC')
		.all() as Record<string, unknown>[];

	return rows.map(rowToConversation);
}

/**
 * Update a conversation. Only provided fields are updated.
 * Always updates last_modified timestamp.
 */
export function updateConversation(
	db: Database,
	id: string,
	updates: Partial<Omit<DatabaseConversation, 'id'>>
): void {
	const sets: string[] = [];
	const values: unknown[] = [];

	if (updates.name !== undefined) {
		sets.push('name = ?');
		values.push(updates.name);
	}
	if (updates.lastModified !== undefined) {
		sets.push('last_modified = ?');
		values.push(updates.lastModified);
	} else {
		sets.push('last_modified = ?');
		values.push(Date.now());
	}
	if (updates.currNode !== undefined) {
		sets.push('curr_node = ?');
		values.push(updates.currNode);
	}
	if (updates.mcpServerOverrides !== undefined) {
		sets.push('mcp_server_overrides = ?');
		values.push(updates.mcpServerOverrides ? JSON.stringify(updates.mcpServerOverrides) : null);
	}
	if (updates.forkedFromConversationId !== undefined) {
		sets.push('forked_from_conversation_id = ?');
		values.push(updates.forkedFromConversationId || null);
	}

	if (sets.length === 0) return;

	values.push(id);
	const sql = `UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`;
	const stmt = db.prepare(sql);
	stmt.run(values as any);
}

/**
 * Delete a conversation by ID.
 * Messages are deleted via ON DELETE CASCADE.
 */
export function deleteConversation(db: Database, id: string): void {
	const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
	stmt.run([id] as any);
}

/**
 * Get direct children conversations (forks) of a conversation.
 */
export function getChildrenConversations(db: Database, parentId: string): DatabaseConversation[] {
	const rows = db
		.query('SELECT * FROM conversations WHERE forked_from_conversation_id = ?')
		.all(parentId) as Record<string, unknown>[];

	return rows.map(rowToConversation);
}

/**
 * Recursively get all descendant conversation IDs (for deleteWithForks).
 */
export function getDescendantConversationIds(db: Database, parentId: string): string[] {
	const ids: string[] = [];
	const queue = [parentId];

	while (queue.length > 0) {
		const currentId = queue.pop()!;
		const children = getChildrenConversations(db, currentId);
		for (const child of children) {
			ids.push(child.id);
			queue.push(child.id);
		}
	}

	return ids;
}

/**
 * Helper: Convert a database row to DatabaseConversation.
 */
function rowToConversation(row: Record<string, unknown>): DatabaseConversation {
	return {
		id: row.id as string,
		name: row.name as string,
		lastModified: row.last_modified as number,
		currNode: row.curr_node as string | null,
		mcpServerOverrides: row.mcp_server_overrides
			? JSON.parse(row.mcp_server_overrides as string)
			: undefined,
		forkedFromConversationId: row.forked_from_conversation_id as string | undefined
	};
}
