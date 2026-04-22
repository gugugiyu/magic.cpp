import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const conversations = sqliteTable('conversations', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	lastModified: integer('last_modified').notNull(),
	currNode: text('curr_node'),
	mcpServerOverrides: text('mcp_server_overrides'),
	forkedFromConversationId: text('forked_from_conversation_id'),
	createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
	pinned: integer('pinned', { mode: 'boolean' })
}, (table) => [
	index('idx_conv_last_modified').on(table.lastModified),
	index('idx_conv_forked').on(table.forkedFromConversationId)
]);

export const messages = sqliteTable('messages', {
	id: text('id').primaryKey(),
	convId: text('conv_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
	type: text('type').notNull(),
	timestamp: integer('timestamp').notNull(),
	role: text('role').notNull(),
	content: text('content').notNull().default(sql`''`),
	parentId: text('parent_id'),
	reasoningContent: text('reasoning_content'),
	toolCalls: text('tool_calls'),
	toolCallId: text('tool_call_id'),
	extra: text('extra'),
	timings: text('timings'),
	model: text('model'),
}, (table) => [
	index('idx_msg_conv_id').on(table.convId),
	index('idx_msg_parent').on(table.parentId),
	index('idx_msg_timestamp').on(table.timestamp)
]);

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type NewMessage = typeof messages.$inferInsert;
