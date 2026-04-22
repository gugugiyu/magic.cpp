/**
 * Conversation database queries using Drizzle ORM.
 */

import { eq, desc, isNull } from 'drizzle-orm';
import { conversations as conversationsTable } from '../schema-drizzle.ts';
import type { Conversation } from '../schema-drizzle.ts';
import type { DrizzleDB } from '../index.ts';
import type { DatabaseConversation } from '../../types/database';

export function createConversation(db: DrizzleDB, conversation: DatabaseConversation): void {
	db.insert(conversationsTable).values({
		id: conversation.id,
		name: conversation.name,
		lastModified: conversation.lastModified,
		currNode: conversation.currNode ?? null,
		mcpServerOverrides: conversation.mcpServerOverrides
			? JSON.stringify(conversation.mcpServerOverrides)
			: null,
		forkedFromConversationId: conversation.forkedFromConversationId ?? null,
		pinned: conversation.pinned ?? null
	}).run();
}

export function getConversation(db: DrizzleDB, id: string): DatabaseConversation | undefined {
	const row = db.select().from(conversationsTable).where(eq(conversationsTable.id, id)).get();
	if (!row) return undefined;
	return rowToConversation(row);
}

export function getAllConversations(db: DrizzleDB): DatabaseConversation[] {
	const rows = db
		.select()
		.from(conversationsTable)
		.orderBy(desc(conversationsTable.lastModified))
		.all();
	return rows.map(rowToConversation);
}

export function updateConversation(
	db: DrizzleDB,
	id: string,
	updates: Partial<Omit<DatabaseConversation, 'id'>>
): void {
	const set: Partial<typeof conversationsTable.$inferInsert> = {
		lastModified: updates.lastModified ?? Date.now()
	};

	if (updates.name !== undefined) set.name = updates.name;
	if (updates.currNode !== undefined) set.currNode = updates.currNode ?? null;
	if (updates.mcpServerOverrides !== undefined) {
		set.mcpServerOverrides = updates.mcpServerOverrides
			? JSON.stringify(updates.mcpServerOverrides)
			: null;
	}
	if (updates.forkedFromConversationId !== undefined) {
		set.forkedFromConversationId = updates.forkedFromConversationId ?? null;
	}
	if (updates.pinned !== undefined) {
		set.pinned = updates.pinned ?? null;
	}

	db.update(conversationsTable).set(set).where(eq(conversationsTable.id, id)).run();
}

export function deleteConversation(db: DrizzleDB, id: string): void {
	db.delete(conversationsTable).where(eq(conversationsTable.id, id)).run();
}

export function getChildrenConversations(db: DrizzleDB, parentId: string): DatabaseConversation[] {
	const rows = db
		.select()
		.from(conversationsTable)
		.where(eq(conversationsTable.forkedFromConversationId, parentId))
		.all();
	return rows.map(rowToConversation);
}

export function getDescendantConversationIds(db: DrizzleDB, parentId: string): string[] {
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

export function getRootConversationIds(db: DrizzleDB): string[] {
	const rows = db
		.select({ id: conversationsTable.id })
		.from(conversationsTable)
		.where(isNull(conversationsTable.forkedFromConversationId))
		.all();
	return rows.map((r) => r.id);
}

export function clearForkParentForAll(db: DrizzleDB): void {
	db.update(conversationsTable).set({ forkedFromConversationId: null }).run();
}

function rowToConversation(row: Conversation): DatabaseConversation {
	return {
		id: row.id,
		name: row.name,
		lastModified: row.lastModified,
		currNode: row.currNode ?? null,
		mcpServerOverrides: row.mcpServerOverrides
			? JSON.parse(row.mcpServerOverrides)
			: undefined,
		forkedFromConversationId: row.forkedFromConversationId ?? undefined,
		pinned: row.pinned ?? undefined
	};
}
