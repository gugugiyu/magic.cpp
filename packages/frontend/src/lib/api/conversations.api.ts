/**
 * Conversation API service.
 * Replaces DatabaseService with HTTP API calls to backend SQLite.
 */

import { apiFetch, apiPost, apiFetchWithParams } from '$lib/utils/api-fetch';
import { routeUrl, RouteHandlers } from '$lib/utils/api-routes';
import type { DatabaseConversation, DatabaseMessage, McpServerOverride } from '$lib/types/database';

export interface CreateConversationParams {
	name: string;
	mcpServerOverrides?: McpServerOverride[];
}

export interface ForkConversationParams {
	messageId: string;
	name: string;
	includeAttachments: boolean;
}

/**
 * Create a new conversation.
 */
export async function createConversation(
	params: CreateConversationParams
): Promise<DatabaseConversation> {
	return apiPost<DatabaseConversation, CreateConversationParams>(
		routeUrl(RouteHandlers.createConversation),
		params
	);
}

/**
 * Get a conversation by ID.
 */
export async function getConversation(id: string): Promise<DatabaseConversation> {
	return apiFetch<DatabaseConversation>(routeUrl(RouteHandlers.getConversation, { id }));
}

/**
 * Get all conversations sorted by lastModified DESC.
 */
export async function getAllConversations(): Promise<DatabaseConversation[]> {
	return apiFetch<DatabaseConversation[]>(routeUrl(RouteHandlers.getConversations));
}

/**
 * Update a conversation.
 */
export async function updateConversation(
	id: string,
	updates: Partial<Omit<DatabaseConversation, 'id'>>
): Promise<DatabaseConversation> {
	return apiFetch<DatabaseConversation>(routeUrl(RouteHandlers.updateConversation, { id }), {
		method: 'PUT',
		body: JSON.stringify(updates)
	});
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(
	id: string,
	options?: { deleteWithForks?: boolean }
): Promise<void> {
	const params = options?.deleteWithForks ? { deleteWithForks: 'true' } : undefined;
	const url = routeUrl(RouteHandlers.deleteConversation, { id }, params);
	const response = await apiFetch(url, {
		method: 'DELETE'
	});
	// 204 No Content
	return response as void;
}

/**
 * Fork a conversation at a specific message.
 */
export async function forkConversation(
	convId: string,
	params: ForkConversationParams
): Promise<DatabaseConversation> {
	return apiPost<DatabaseConversation, ForkConversationParams>(
		routeUrl(RouteHandlers.forkConversation, { id: convId }),
		params
	);
}

/**
 * Import conversations from exported data.
 */
export async function importConversations(
	data: { conv: DatabaseConversation; messages: DatabaseMessage[] }[]
): Promise<{ imported: number; skipped: number }> {
	return apiPost<{ imported: number; skipped: number }, typeof data>(
		routeUrl(RouteHandlers.importConversations),
		data
	);
}

/**
 * Export all conversations.
 * @param limit - Optional maximum number of conversations to export (most recent first)
 */
export async function exportConversations(
	limit?: number
): Promise<{ conv: DatabaseConversation; messages: DatabaseMessage[] }[]> {
	const params: Record<string, string> = {};
	if (limit !== undefined && limit > 0) {
		params.limit = limit.toString();
	}
	return apiFetchWithParams<{ conv: DatabaseConversation; messages: DatabaseMessage[] }[]>(
		routeUrl(RouteHandlers.exportConversations),
		params
	);
}

/**
 * Delete all conversations.
 * @param deleteWithForks - If true, recursively delete all forked conversations too
 */
export async function deleteAllConversations(deleteWithForks: boolean = false): Promise<void> {
	const params = deleteWithForks ? { deleteWithForks: 'true' } : undefined;
	const url = routeUrl(RouteHandlers.deleteAllConversations, undefined, params);
	await apiFetch(url, {
		method: 'DELETE'
	});
}
