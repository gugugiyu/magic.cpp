/**
 * Message database queries.
 * All operations related to messages in SQLite using bun:sqlite with tree/branching support.
 */

import { Database } from 'bun:sqlite';
import type { DatabaseMessage } from '../../types/database';

/**
 * Create a new message.
 */
export function createMessage(db: Database, message: DatabaseMessage): void {
	console.log(message)
	const stmt = db.prepare(
		`INSERT INTO messages (id, conv_id, type, timestamp, role, content, parent_id, reasoning_content, tool_calls, tool_call_id, extra, timings, model)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	stmt.run([
		message.id,
		message.convId,
		message.type,
		message.timestamp,
		message.role,
		message.content,
		message.parent || null,
		message.reasoningContent || null,
		message.toolCalls || null,
		message.toolCallId || null,
		message.extra ? JSON.stringify(message.extra) : null,
		message.timings ? JSON.stringify(message.timings) : null,
		message.model || null
	] as any);
}

/**
 * Get a message by ID.
 */
export function getMessageById(db: Database, id: string): DatabaseMessage | undefined {
	const row = db.query('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown> | undefined;
	if (!row) return undefined;
	return rowToMessage(row);
}

/**
 * Get all messages in a conversation sorted by timestamp.
 */
export function getConversationMessages(db: Database, convId: string): DatabaseMessage[] {
	const rows = db
		.query('SELECT * FROM messages WHERE conv_id = ? ORDER BY timestamp ASC')
		.all(convId) as Record<string, unknown>[];

	return rows.map(rowToMessage);
}

/**
 * Update a message. Only provided fields are updated.
 */
export function updateMessage(
	db: Database,
	id: string,
	updates: Partial<Omit<DatabaseMessage, 'id'>>
): void {
	const sets: string[] = [];
	const values: unknown[] = [];

	if (updates.content !== undefined) {
		sets.push('content = ?');
		values.push(updates.content);
	}
	if (updates.type !== undefined) {
		sets.push('type = ?');
		values.push(updates.type);
	}
	if (updates.role !== undefined) {
		sets.push('role = ?');
		values.push(updates.role);
	}
	if (updates.parent !== undefined) {
		sets.push('parent_id = ?');
		values.push(updates.parent || null);
	}
	if (updates.reasoningContent !== undefined) {
		sets.push('reasoning_content = ?');
		values.push(updates.reasoningContent || null);
	}
	if (updates.toolCalls !== undefined) {
		sets.push('tool_calls = ?');
		values.push(updates.toolCalls || null);
	}
	if (updates.toolCallId !== undefined) {
		sets.push('tool_call_id = ?');
		values.push(updates.toolCallId || null);
	}
	if (updates.extra !== undefined) {
		sets.push('extra = ?');
		values.push(updates.extra ? JSON.stringify(updates.extra) : null);
	}
	if (updates.timings !== undefined) {
		sets.push('timings = ?');
		values.push(updates.timings ? JSON.stringify(updates.timings) : null);
	}
	if (updates.model !== undefined) {
		sets.push('model = ?');
		values.push(updates.model || null);
	}
	if (updates.timestamp !== undefined) {
		sets.push('timestamp = ?');
		values.push(updates.timestamp);
	}

	if (sets.length === 0) return;

	values.push(id);
	const sql = `UPDATE messages SET ${sets.join(', ')} WHERE id = ?`;
	const stmt = db.prepare(sql);
	stmt.run(values as any);
}

/**
 * Delete a message by ID.
 */
export function deleteMessage(db: Database, id: string): void {
	const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
	stmt.run([id] as any);
}

/**
 * Delete multiple messages by IDs.
 */
export function deleteMessages(db: Database, ids: string[]): void {
	if (ids.length === 0) return;
	const placeholders = ids.map(() => '?').join(', ');
	const stmt = db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`);
	stmt.run(ids as any);
}

/**
 * Get direct children of a message.
 */
export function getMessageChildren(db: Database, parentId: string): DatabaseMessage[] {
	const rows = db
		.query('SELECT * FROM messages WHERE parent_id = ? ORDER BY timestamp ASC')
		.all(parentId) as Record<string, unknown>[];

	return rows.map(rowToMessage);
}

/**
 * Get all descendant message IDs (for cascading delete).
 */
export function getDescendantMessageIds(db: Database, messageId: string): string[] {
	const ids: string[] = [];
	const queue = [messageId];

	while (queue.length > 0) {
		const currentId = queue.pop()!;
		const children = getMessageChildren(db, currentId);
		for (const child of children) {
			ids.push(child.id);
			queue.push(child.id);
		}
	}

	return ids;
}

/**
 * Reparent message children to a new parent.
 */
export function reparentMessageChildren(
	db: Database,
	childIds: string[],
	newParentId: string | null
): void {
	if (childIds.length === 0) return;

	const placeholders = childIds.map(() => '?').join(', ');
	const sql = `UPDATE messages SET parent_id = ? WHERE id IN (${placeholders})`;
	const stmt = db.prepare(sql);
	stmt.run([newParentId, ...childIds] as any);
}

/**
 * Create a root message for a new conversation.
 */
export function createRootMessage(
	db: Database,
	convId: string
): DatabaseMessage {
	const rootMessage: DatabaseMessage = {
		id: crypto.randomUUID(),
		convId,
		type: 'root',
		timestamp: Date.now(),
		role: 'system',
		content: '',
		parent: null,
		toolCalls: '',
		children: []
	};

	createMessage(db, rootMessage);
	return rootMessage;
}

/**
 * Create a system prompt message.
 */
export function createSystemMessage(
	db: Database,
	convId: string,
	systemPrompt: string,
	parentId: string
): DatabaseMessage {
	const trimmedPrompt = systemPrompt.trim();
	if (!trimmedPrompt) {
		throw new Error('Cannot create system message with empty content');
	}

	const systemMessage: DatabaseMessage = {
		id: crypto.randomUUID(),
		convId,
		type: 'system',
		timestamp: Date.now(),
		role: 'system',
		content: trimmedPrompt,
		parent: parentId,
		children: []
	};

	createMessage(db, systemMessage);
	return systemMessage;
}

/**
 * Build children arrays for messages from parent_id relationships.
 * SQLite stores only parent_id, so we compute children for the frontend.
 */
export function buildMessageTree(messages: DatabaseMessage[]): DatabaseMessage[] {
	const messageMap = new Map<string, DatabaseMessage>();
	
	// Initialize all messages with empty children arrays
	for (const msg of messages) {
		messageMap.set(msg.id, { ...msg, children: [] });
	}

	// Build parent-child relationships
	for (const msg of messages) {
		if (msg.parent && messageMap.has(msg.parent)) {
			const parent = messageMap.get(msg.parent)!;
			parent.children.push(msg.id);
		}
	}

	return Array.from(messageMap.values());
}

/**
 * Helper: Convert a database row to DatabaseMessage.
 */
function rowToMessage(row: Record<string, unknown>): DatabaseMessage {
	return {
		id: row.id as string,
		convId: row.conv_id as string,
		type: row.type as DatabaseMessage['type'],
		timestamp: row.timestamp as number,
		role: row.role as DatabaseMessage['role'],
		content: row.content as string,
		parent: row.parent_id as string | null,
		reasoningContent: row.reasoning_content as string | undefined,
		toolCalls: row.tool_calls as string | undefined,
		toolCallId: row.tool_call_id as string | undefined,
		extra: row.extra ? JSON.parse(row.extra as string) : undefined,
		timings: row.timings ? JSON.parse(row.timings as string) : undefined,
		model: row.model as string | undefined,
		children: [] // Will be populated by buildMessageTree
	};
}
