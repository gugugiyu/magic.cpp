/**
 * HTTP handlers for /api/messages/* endpoints.
 * All handlers return JSON responses with standard HTTP status codes.
 */

import type { DrizzleDB } from '../database/index.ts';
import {
	getConversationMessages,
	getMessageById,
	updateMessage,
	deleteMessage,
	reparentMessageChildren,
	buildMessageTree
} from '../database/queries/messages.ts';
import type { DatabaseMessage } from '../types/database';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('api');

/**
 * GET /api/messages/:id
 */
export function handleGetMessage(db: DrizzleDB, id: string): Response {
	try {
		const message = getMessageById(db, id);
		if (!message) {
			return Response.json(
				{ error: 'Message not found' },
				{ status: 404 }
			);
		}

		const allMessages = getConversationMessages(db, message.convId);
		const messagesWithTree = buildMessageTree(allMessages);
		const fullMessage = messagesWithTree.find((m) => m.id === id);

		return Response.json(fullMessage || message);
	} catch (error) {
		log.error('failed to get message:', error);
		return Response.json(
			{ error: 'Failed to retrieve message' },
			{ status: 500 }
		);
	}
}

/**
 * PUT /api/messages/:id
 * Body: Partial<DatabaseMessage>
 */
export async function handleUpdateMessage(req: Request, db: DrizzleDB, id: string): Promise<Response> {
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
		log.error('failed to update message:', error);
		return Response.json(
			{ error: 'Failed to update message' },
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/messages/:id
 * Query params: newParentId (optional)
 */
export function handleDeleteMessage(db: DrizzleDB, id: string, params: URLSearchParams): Response {
  try {
    const message = getMessageById(db, id);
    if (!message) {
      return Response.json(
        { error: 'Message not found' },
        { status: 404 }
      );
    }

    const newParentId = params.get('newParentId') || undefined;

		db.transaction((tx) => {
			if (newParentId && message.children.length > 0) {
				reparentMessageChildren(tx, message.children, newParentId);
			}

			if (message.parent) {
				const parent = getMessageById(tx, message.parent);
				if (parent) {
					const updatedChildren = parent.children.filter((childId: string) => childId !== id);
					updateMessage(tx, message.parent, { children: updatedChildren });
				}
			}

			deleteMessage(tx, id);
		});

		return new Response(null, { status: 204 });
	} catch (error) {
		log.error('failed to delete message:', error);
		return Response.json(
			{ error: 'Failed to delete message' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/messages/:id/delete-cascading
 * Body: { conversationId: string }
 */
export async function handleDeleteMessageCascading(
	req: Request,
	db: DrizzleDB,
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

		const allToDelete = db.transaction((tx) => {
			const allMessages = getConversationMessages(tx, conversationId);
			const messagesWithTree = buildMessageTree(allMessages);
			const descendants = findDescendantMessageIds(messagesWithTree, id);
			return [id, ...descendants];
		});

		db.transaction((tx) => {
			const msg = getMessageById(tx, id);
			if (msg && msg.parent) {
				const parent = getMessageById(tx, msg.parent);
				if (parent) {
					const updatedChildren = parent.children.filter((childId: string) => childId !== id);
					updateMessage(tx, msg.parent, { children: updatedChildren });
				}
			}

			for (const msgId of allToDelete) {
				deleteMessage(tx, msgId);
			}
		});

		return Response.json(allToDelete);
	} catch (error) {
		log.error('failed to delete message cascading:', error);
		return Response.json(
			{ error: 'Failed to delete message cascading' },
			{ status: 500 }
		);
	}
}

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
