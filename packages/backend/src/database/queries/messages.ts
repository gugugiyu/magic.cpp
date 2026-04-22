/**
 * Message database queries using Drizzle ORM.
 * Tree/branching support: children arrays are computed, never stored.
 */

import { eq, asc, inArray } from 'drizzle-orm';
import { messages as messagesTable } from '../schema-drizzle.ts';
import type { Message } from '../schema-drizzle.ts';
import type { DrizzleDB } from '../index.ts';
import type { DatabaseMessage } from '../../types/database';

export function createMessage(db: DrizzleDB, message: DatabaseMessage): void {
	db.insert(messagesTable).values({
		id: message.id,
		convId: message.convId,
		type: message.type,
		timestamp: message.timestamp,
		role: message.role,
		content: message.content,
		parentId: message.parent ?? null,
		reasoningContent: message.reasoningContent ?? null,
		toolCalls: message.toolCalls ?? null,
		toolCallId: message.toolCallId ?? null,
		extra: message.extra ? JSON.stringify(message.extra) : null,
		timings: message.timings ? JSON.stringify(message.timings) : null,
		model: message.model ?? null
	}).run();
}

export function getMessageById(db: DrizzleDB, id: string): DatabaseMessage | undefined {
	const row = db.select().from(messagesTable).where(eq(messagesTable.id, id)).get();
	if (!row) return undefined;
	return rowToMessage(row);
}

export function getConversationMessages(db: DrizzleDB, convId: string): DatabaseMessage[] {
	const rows = db
		.select()
		.from(messagesTable)
		.where(eq(messagesTable.convId, convId))
		.orderBy(asc(messagesTable.timestamp))
		.all();
	return rows.map(rowToMessage);
}

export function updateMessage(
	db: DrizzleDB,
	id: string,
	updates: Partial<Omit<DatabaseMessage, 'id'>>
): void {
	const set: Partial<typeof messagesTable.$inferInsert> = {};

	if (updates.content !== undefined) set.content = updates.content;
	if (updates.type !== undefined) set.type = updates.type;
	if (updates.role !== undefined) set.role = updates.role;
	if (updates.parent !== undefined) set.parentId = updates.parent ?? null;
	if (updates.reasoningContent !== undefined) set.reasoningContent = updates.reasoningContent ?? null;
	if (updates.toolCalls !== undefined) set.toolCalls = updates.toolCalls ?? null;
	if (updates.toolCallId !== undefined) set.toolCallId = updates.toolCallId ?? null;
	if (updates.extra !== undefined) {
		set.extra = updates.extra ? JSON.stringify(updates.extra) : null;
	}
	if (updates.timings !== undefined) {
		set.timings = updates.timings ? JSON.stringify(updates.timings) : null;
	}
	if (updates.model !== undefined) set.model = updates.model ?? null;
	if (updates.timestamp !== undefined) set.timestamp = updates.timestamp;
	// children is computed from parent_id relationships, not stored

	if (Object.keys(set).length === 0) return;

	db.update(messagesTable).set(set).where(eq(messagesTable.id, id)).run();
}

export function deleteMessage(db: DrizzleDB, id: string): void {
	db.delete(messagesTable).where(eq(messagesTable.id, id)).run();
}

export function deleteMessages(db: DrizzleDB, ids: string[]): void {
	if (ids.length === 0) return;
	db.delete(messagesTable).where(inArray(messagesTable.id, ids)).run();
}

export function getMessageChildren(db: DrizzleDB, parentId: string): DatabaseMessage[] {
	const rows = db
		.select()
		.from(messagesTable)
		.where(eq(messagesTable.parentId, parentId))
		.orderBy(asc(messagesTable.timestamp))
		.all();
	return rows.map(rowToMessage);
}

export function getDescendantMessageIds(db: DrizzleDB, messageId: string): string[] {
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

export function reparentMessageChildren(
	db: DrizzleDB,
	childIds: string[],
	newParentId: string | null
): void {
	if (childIds.length === 0) return;
	db.update(messagesTable)
		.set({ parentId: newParentId })
		.where(inArray(messagesTable.id, childIds))
		.run();
}

export function createRootMessage(db: DrizzleDB, convId: string): DatabaseMessage {
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

export function createSystemMessage(
	db: DrizzleDB,
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
 * SQLite stores only parent_id; this computes children for the frontend.
 */
export function buildMessageTree(messages: DatabaseMessage[]): DatabaseMessage[] {
	const messageMap = new Map<string, DatabaseMessage>();

	for (const msg of messages) {
		messageMap.set(msg.id, { ...msg, children: [] });
	}

	for (const msg of messages) {
		if (msg.parent && messageMap.has(msg.parent)) {
			const parent = messageMap.get(msg.parent)!;
			parent.children.push(msg.id);
		}
	}

	return Array.from(messageMap.values());
}

function rowToMessage(row: Message): DatabaseMessage {
	return {
		id: row.id,
		convId: row.convId,
		type: row.type as DatabaseMessage['type'],
		timestamp: row.timestamp,
		role: row.role as DatabaseMessage['role'],
		content: row.content,
		parent: row.parentId ?? null,
		reasoningContent: row.reasoningContent ?? undefined,
		toolCalls: row.toolCalls ?? undefined,
		toolCallId: row.toolCallId ?? undefined,
		extra: row.extra ? JSON.parse(row.extra) : undefined,
		timings: row.timings ? JSON.parse(row.timings) : undefined,
		model: row.model ?? undefined,
		children: []
	};
}
