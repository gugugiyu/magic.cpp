/**
 * Message API service.
 * Replaces DatabaseService message operations with HTTP API calls to backend SQLite.
 */

import { apiFetch, apiPost } from '$lib/utils/api-fetch';
import type { DatabaseMessage, DatabaseConversation } from '$lib/types/database';

export interface CreateMessageParams {
	convId: string;
	type: string;
	role: string;
	content: string;
	parentId?: string | null;
	reasoningContent?: string;
	toolCalls?: string;
	toolCallId?: string;
	extra?: DatabaseMessage['extra'];
	timings?: DatabaseMessage['timings'];
	model?: string;
	timestamp?: number;
	subagentSessionId?: string;
}

/**
 * Get a message by ID.
 */
export async function getMessageById(id: string): Promise<DatabaseMessage> {
	return apiFetch<DatabaseMessage>(`/api/messages/${id}`);
}

/**
 * Get all messages for a conversation.
 */
export async function getConversationMessages(convId: string): Promise<DatabaseMessage[]> {
	return apiFetch<DatabaseMessage[]>(`/api/conversations/${convId}/messages`);
}

/**
 * Update a message.
 */
export async function updateMessage(
	id: string,
	updates: Partial<Omit<DatabaseMessage, 'id'>>
): Promise<DatabaseMessage> {
	return apiFetch<DatabaseMessage>(`/api/messages/${id}`, {
		method: 'PUT',
		body: JSON.stringify(updates)
	});
}

/**
 * Delete a message, optionally reparenting children.
 */
export async function deleteMessage(id: string, options?: { newParentId?: string }): Promise<void> {
	const params = options?.newParentId ? `?newParentId=${options.newParentId}` : '';
	await apiFetch(`/api/messages/${id}${params}`, {
		method: 'DELETE'
	});
}

/**
 * Delete a message and all its descendants (cascading deletion).
 */
export async function deleteMessageCascading(
	id: string,
	conversationId: string
): Promise<string[]> {
	return apiPost<string[], { conversationId: string }>(`/api/messages/${id}/delete-cascading`, {
		conversationId
	});
}

/**
 * Create a new message in a conversation.
 */
export async function createMessage(
	convId: string,
	params: Omit<CreateMessageParams, 'convId'>,
	options?: { parentId?: string | null; type?: 'root' | 'system' }
): Promise<DatabaseMessage> {
	const queryParams = new URLSearchParams();
	if (options?.parentId) queryParams.set('parentId', options.parentId);
	if (options?.type) queryParams.set('type', options.type);

	const queryString = queryParams.toString();
	return apiPost<DatabaseMessage, CreateMessageParams>(
		`/api/conversations/${convId}/messages${queryString ? `?${queryString}` : ''}`,
		{ ...params, convId }
	);
}

/**
 * Create a root message for a new conversation.
 */
export async function createRootMessage(convId: string): Promise<DatabaseMessage> {
	return createMessage(
		convId,
		{
			type: 'root',
			role: 'system',
			content: ''
		},
		{ type: 'root' }
	);
}

/**
 * Create a system prompt message.
 */
export async function createSystemMessage(
	convId: string,
	content: string,
	parentId: string
): Promise<DatabaseMessage> {
	return createMessage(
		convId,
		{
			type: 'system',
			role: 'system',
			content
		},
		{ parentId, type: 'system' }
	);
}

/**
 * Get all subagent session IDs for a conversation.
 */
export async function getSubagentSessions(convId: string): Promise<string[]> {
	return apiFetch<string[]>(`/api/conversations/${convId}/subagent-sessions`);
}

/**
 * Get subagent messages for a specific session.
 */
export async function getSubagentMessages(
	convId: string,
	sessionId: string
): Promise<DatabaseMessage[]> {
	return apiFetch<DatabaseMessage[]>(
		`/api/conversations/${convId}/subagent-messages?sessionId=${sessionId}`
	);
}

/**
 * Create a message branch (reply to existing message).
 */
export async function createMessageBranch(
	params: Omit<CreateMessageParams, 'convId'>,
	convId: string,
	parentId: string | null
): Promise<DatabaseMessage> {
	return createMessage(convId, params, { parentId });
}

/**
 * Update the current node (active branch) of a conversation.
 */
export async function updateCurrentNode(
	convId: string,
	nodeId: string
): Promise<DatabaseConversation> {
	return apiFetch<DatabaseConversation>(`/api/conversations/${convId}`, {
		method: 'PUT',
		body: JSON.stringify({ currNode: nodeId })
	});
}
