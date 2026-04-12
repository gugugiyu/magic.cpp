/**
 * DatabaseService - Compatibility layer for migration from Dexie to SQLite.
 * 
 * This module provides the same interface as the old Dexie-based DatabaseService,
 * but now makes HTTP API calls to the backend SQLite database.
 * 
 * All stores (conversations.svelte.ts, chat.svelte.ts) can use this without changes.
 */

import * as conversationsAPI from '$lib/api/conversations.api';
import * as messagesAPI from '$lib/api/messages.api';
import { findDescendantMessages, uuid, filterByLeafNodeId } from '$lib/utils';
import type { McpServerOverride } from '$lib/types/database';
import { MessageRole } from '$lib/enums';

/**
 * DatabaseService - Static class providing backward-compatible API for conversation/message operations.
 */
export class DatabaseService {
	/**
	 * Conversations
	 */

	static async createConversation(name: string): Promise<DatabaseConversation> {
		return conversationsAPI.createConversation({ name });
	}

	static async getConversation(id: string): Promise<DatabaseConversation | undefined> {
		try {
			return await conversationsAPI.getConversation(id);
		} catch {
			return undefined;
		}
	}

	static async getAllConversations(): Promise<DatabaseConversation[]> {
		return conversationsAPI.getAllConversations();
	}

	static async updateConversation(
		id: string,
		updates: Partial<Omit<DatabaseConversation, 'id'>>
	): Promise<void> {
		await conversationsAPI.updateConversation(id, updates);
	}

	static async deleteConversation(
		id: string,
		options?: { deleteWithForks?: boolean }
	): Promise<void> {
		await conversationsAPI.deleteConversation(id, options);
	}

	static async forkConversation(
		sourceConvId: string,
		atMessageId: string,
		options: { name: string; includeAttachments: boolean }
	): Promise<DatabaseConversation> {
		return conversationsAPI.forkConversation(sourceConvId, {
			messageId: atMessageId,
			name: options.name,
			includeAttachments: options.includeAttachments
		});
	}

	static async importConversations(
		data: { conv: DatabaseConversation; messages: DatabaseMessage[] }[]
	): Promise<{ imported: number; skipped: number }> {
		return conversationsAPI.importConversations(data);
	}

	static async exportConversations(): Promise<
		{ conv: DatabaseConversation; messages: DatabaseMessage[] }[]
	> {
		return conversationsAPI.exportConversations();
	}

	/**
	 * Messages
	 */

	static async createRootMessage(convId: string): Promise<string> {
		const message = await messagesAPI.createRootMessage(convId);
		return message.id;
	}

	static async createSystemMessage(
		convId: string,
		systemPrompt: string,
		parentId: string
	): Promise<DatabaseMessage> {
		return messagesAPI.createSystemMessage(convId, systemPrompt, parentId);
	}

	static async createMessageBranch(
		message: Omit<DatabaseMessage, 'id'>,
		parentId: string | null
	): Promise<DatabaseMessage> {
		return messagesAPI.createMessageBranch(
			{
				type: message.type,
				role: message.role,
				content: message.content,
				reasoningContent: message.reasoningContent,
				toolCalls: message.toolCalls ?? '',
				toolCallId: message.toolCallId,
				extra: message.extra,
				timings: message.timings,
				model: message.model,
				timestamp: message.timestamp
			},
			message.convId,
			parentId
		);
	}

	static async getConversationMessages(convId: string): Promise<DatabaseMessage[]> {
		return messagesAPI.getConversationMessages(convId);
	}

	static async getMessageById(id: string): Promise<DatabaseMessage | undefined> {
		try {
			return await messagesAPI.getMessageById(id);
		} catch {
			return undefined;
		}
	}

	static async addMessageToDatabase(message: DatabaseMessage): Promise<DatabaseMessage> {
		return messagesAPI.createMessage(message.convId, {
			type: message.type,
			role: message.role,
			content: message.content,
			parentId: message.parent,
			reasoningContent: message.reasoningContent,
			toolCalls: message.toolCalls,
			toolCallId: message.toolCallId,
			extra: message.extra,
			timings: message.timings,
			model: message.model,
			timestamp: message.timestamp
		}, { parentId: message.parent });
	}

	static async updateMessage(
		id: string,
		updates: Partial<Omit<DatabaseMessage, 'id'>>
	): Promise<void> {
		await messagesAPI.updateMessage(id, updates);
	}

	static async deleteMessage(messageId: string, newParentId?: string): Promise<void> {
		await messagesAPI.deleteMessage(messageId, { newParentId });
	}

	static async deleteMessageCascading(
		conversationId: string,
		messageId: string
	): Promise<string[]> {
		return messagesAPI.deleteMessageCascading(messageId, conversationId);
	}

	/**
	 * Navigation
	 */

	static async updateCurrentNode(convId: string, nodeId: string): Promise<void> {
		await messagesAPI.updateCurrentNode(convId, nodeId);
	}

	/**
	 * Compaction
	 */

	static async compactMessageTree(
		convId: string,
		summaryMessage: DatabaseMessage,
		messagesToCompact: DatabaseMessage[],
		anchorMessageId: string
	): Promise<void> {
		await conversationsAPI.compactConversation(convId, {
			summaryMessage,
			messagesToCompact,
			anchorMessageId
		});
	}
}

// Export db compatibility object for callers that need it
export const db = {
	conversations: {
		add: async (conv: DatabaseConversation) => {
			await conversationsAPI.createConversation({ 
				name: conv.name, 
				mcpServerOverrides: conv.mcpServerOverrides 
			});
		},
		get: async (id: string) => {
			try {
				return await conversationsAPI.getConversation(id);
			} catch {
				return undefined;
			}
		},
		update: async (id: string, updates: Partial<DatabaseConversation>) => {
			await conversationsAPI.updateConversation(id, updates);
		},
		delete: async (id: string) => {
			await conversationsAPI.deleteConversation(id);
		},
		orderBy: (field: string) => ({
			reverse: () => ({
				toArray: async () => conversationsAPI.getAllConversations()
			})
		}),
		filter: () => ({
			toArray: async () => []
		})
	},
	messages: {
		add: async (msg: DatabaseMessage) => {
			await messagesAPI.createMessage(msg.convId, {
				type: msg.type,
				role: msg.role,
				content: msg.content,
				parentId: msg.parent,
				timestamp: msg.timestamp
			}, { parentId: msg.parent });
		},
		get: async (id: string) => {
			try {
				return await messagesAPI.getMessageById(id);
			} catch {
				return undefined;
			}
		},
		update: async (id: string, updates: Partial<DatabaseMessage>) => {
			await messagesAPI.updateMessage(id, updates);
		},
		delete: async (id: string) => {
			await messagesAPI.deleteMessage(id);
		},
		put: async (msg: DatabaseMessage) => {
			await messagesAPI.updateMessage(msg.id, msg);
		},
		where: (field: string) => ({
			equals: (value: string) => ({
				delete: async () => {
					// Bulk delete not supported via this interface
				},
				sortBy: async (sortField: string) => {
					return messagesAPI.getConversationMessages(value);
				},
				toArray: async () => {
					return messagesAPI.getConversationMessages(value);
				}
			})
		}),
		bulkGet: async (ids: string[]) => {
			const results = [];
			for (const id of ids) {
				try {
					results.push(await messagesAPI.getMessageById(id));
				} catch {
					results.push(undefined);
				}
			}
			return results;
		},
		bulkPut: async (messages: DatabaseMessage[]) => {
			for (const msg of messages) {
				await messagesAPI.updateMessage(msg.id, msg);
			}
		},
		bulkDelete: async (ids: string[]) => {
			for (const id of ids) {
				await messagesAPI.deleteMessage(id);
			}
		}
	},
	transaction: async (mode: string, tables: any[], callback: () => Promise<any>) => {
		// Transactions are handled server-side
		return callback();
	}
};
