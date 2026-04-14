/**
 * HTTP handlers for /api/messages/* endpoints.
 * All handlers return JSON responses with standard HTTP status codes.
 */

import { Database } from 'bun:sqlite';
import {
	getMessageById,
	getMessageChildren,
	updateMessage,
	deleteMessage,
	getDescendantMessageIds,
	reparentMessageChildren,
	buildMessageTree
} from '../database/queries/messages.ts';
import type { DatabaseMessage } from '../types/database';

/**
 * GET /api/messages/:id
 * Get a single message by ID.
 */
export function handleGetMessage(db: Database, id: string): Response {
	try {
		const message = getMessageById(db, id);
		if (!message) {
			return Response.json(
				{ error: 'Message not found' },
				{ status: 404 }
			);
		}

		// Build children array for compatibility
		const allMessagesRows = db
			.query('SELECT * FROM messages WHERE conv_id = $convId')
			.all({ $convId: message.convId }) as Record<string, unknown>[];
		const allMessages = allMessagesRows.map(row => ({
			id: row.id as string,
			convId: row.conv_id as string,
			type: row.type as string,
			timestamp: row.timestamp as number,
			role: row.role as string,
			content: row.content as string,
			parent: row.parent_id as string | null,
			reasoningContent: row.reasoning_content as string | undefined,
			toolCalls: row.tool_calls as string | undefined,
			toolCallId: row.tool_call_id as string | undefined,
			extra: row.extra ? JSON.parse(row.extra as string) : undefined,
			timings: row.timings ? JSON.parse(row.timings as string) : undefined,
			model: row.model as string | undefined,
			children: []
		}));
		const messagesWithTree = buildMessageTree(allMessages);
		const fullMessage = messagesWithTree.find((m) => m.id === id);

		return Response.json(fullMessage || message);
	} catch (error) {
		console.error('[api] failed to get message:', error);
		return Response.json(
			{ error: 'Failed to retrieve message' },
			{ status: 500 }
		);
	}
}

/**
 * PUT /api/messages/:id
 * Update a message.
 * Body: Partial<DatabaseMessage>
 */
export async function handleUpdateMessage(req: Request, db: Database, id: string): Promise<Response> {
	try {
		const existing = getMessageById(db, id);
		if (!existing) {
			return Response.json(
				{ error: 'Message not found' },
				{ status: 404 }
			);
		}

		const body = await req.json();
		const updates: Partial<Omit<DatabaseMessage, 'id'>> = {};

		if (body.content !== undefined) updates.content = body.content;
		if (body.type !== undefined) updates.type = body.type;
		if (body.role !== undefined) updates.role = body.role;
		if (body.parent !== undefined) updates.parent = body.parent;
		if (body.children !== undefined) updates.children = body.children;
		if (body.reasoningContent !== undefined) updates.reasoningContent = body.reasoningContent;
		if (body.toolCalls !== undefined) updates.toolCalls = body.toolCalls;
		if (body.toolCallId !== undefined) updates.toolCallId = body.toolCallId;
		if (body.extra !== undefined) updates.extra = body.extra;
		if (body.timings !== undefined) updates.timings = body.timings;
		if (body.model !== undefined) updates.model = body.model;
		if (body.timestamp !== undefined) updates.timestamp = body.timestamp;

		updateMessage(db, id, updates);

		const updated = getMessageById(db, id);
		return Response.json(updated);
	} catch (error) {
		console.error('[api] failed to update message:', error);
		return Response.json(
			{ error: 'Failed to update message' },
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/messages/:id
 * Delete a message, optionally reparenting children.
 * Query params: newParentId (optional)
 */
export function handleDeleteMessage(db: Database, id: string, url: URL): Response {
	try {
		const message = getMessageById(db, id);
		if (!message) {
			return Response.json(
				{ error: 'Message not found' },
				{ status: 404 }
			);
		}

		const newParentId = url.searchParams.get('newParentId') || undefined;

		db.transaction(() => {
			// Reparent children if newParentId is provided
			if (newParentId) {
				const children = getMessageChildren(db, id);
				if (children.length > 0) {
					reparentMessageChildren(db, children.map(c => c.id), newParentId);
				}
			}

			// Remove this message from its parent's children array
			if (message.parent) {
				const parent = getMessageById(db, message.parent);
				if (parent) {
					const updatedChildren = parent.children.filter((childId: string) => childId !== id);
					updateMessage(db, message.parent, { children: updatedChildren });
				}
			}

			// Delete the message
			deleteMessage(db, id);
		})();

		return new Response(null, { status: 204 });
	} catch (error) {
		console.error('[api] failed to delete message:', error);
		return Response.json(
			{ error: 'Failed to delete message' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/messages/:id/delete-cascading
 * Delete a message and all its descendants (cascading deletion).
 * Body: { conversationId: string }
 */
export async function handleDeleteMessageCascading(
	req: Request,
	db: Database,
	id: string
): Promise<Response> {
	try {
		const message = getMessageById(db, id);
		if (!message) {
			return Response.json(
				{ error: 'Message not found' },
				{ status: 404 }
			);
		}

		const body = await req.json();
		const conversationId = body.conversationId;

		if (!conversationId) {
			return Response.json(
				{ error: 'Missing "conversationId" field' },
				{ status: 400 }
			);
		}

		const allToDelete = db.transaction(() => {
			// Get all messages in the conversation to find descendants
			const allMessagesRows = db
				.query('SELECT * FROM messages WHERE conv_id = $convId')
				.all({ $convId: conversationId }) as Record<string, unknown>[];

			// We need to build children arrays first since they're not stored
			const messagesWithTree = buildMessageTree(
				allMessagesRows.map((row) => ({
					id: row.id as string,
					convId: row.conv_id as string,
					type: row.type as string,
					timestamp: row.timestamp as number,
					role: row.role as string,
					content: row.content as string,
					parent: row.parent_id as string | null,
					reasoningContent: row.reasoning_content as string | undefined,
					toolCalls: row.tool_calls as string | undefined,
					toolCallId: row.tool_call_id as string | undefined,
					extra: row.extra ? JSON.parse(row.extra as string) : undefined,
					timings: row.timings ? JSON.parse(row.timings as string) : undefined,
					model: row.model as string | undefined,
					children: []
				}))
			);

			// Find descendants using the tree structure
			const descendants = findDescendantMessageIds(messagesWithTree, id);
			return [id, ...descendants];
		})();

		db.transaction(() => {
			// Get the message to delete for parent cleanup
			const msg = getMessageById(db, id);
			if (msg && msg.parent) {
				const parent = getMessageById(db, msg.parent);
				if (parent) {
					const updatedChildren = parent.children.filter((childId: string) => childId !== id);
					updateMessage(db, msg.parent, { children: updatedChildren });
				}
			}

			// Delete all messages in the branch
			for (const msgId of allToDelete) {
				deleteMessage(db, msgId);
			}
		})();

		return Response.json(allToDelete);
	} catch (error) {
		console.error('[api] failed to delete message cascading:', error);
		return Response.json(
			{ error: 'Failed to delete message cascading' },
			{ status: 500 }
		);
	}
}

/**
 * Helper: Find all descendant message IDs from a tree structure.
 */
function findDescendantMessageIds(messages: DatabaseMessage[], messageId: string): string[] {
	const nodeMap = new Map<string, DatabaseMessage>();
	for (const msg of messages) {
		nodeMap.set(msg.id, msg);
	}

	const descendants: string[] = [];
	const queue: string[] = [messageId];

	while (queue.length > 0) {
		const currentId = queue.shift()!;
		const currentNode = nodeMap.get(currentId);

		if (currentNode) {
			for (const childId of currentNode.children) {
				descendants.push(childId);
				queue.push(childId);
			}
		}
	}

	return descendants;
}
