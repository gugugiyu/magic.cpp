/**
 * HTTP handlers for /api/conversations/* endpoints.
 * All handlers return JSON responses with standard HTTP status codes.
 */

import { Database } from 'bun:sqlite';
import {
	getAllConversations,
	getConversation,
	createConversation,
	updateConversation,
	deleteConversation,
	getDescendantConversationIds
} from '../database/queries/conversations.ts';
import {
	getConversationMessages,
	getMessageById,
	createMessage,
	createRootMessage,
	createSystemMessage,
	buildMessageTree,
	deleteMessages,
	updateMessage,
	reparentMessageChildren
} from '../database/queries/messages.ts';
import {
	filterByLeafNodeId
} from '../utils/branching.ts';
import type {
	DatabaseConversation,
	DatabaseMessage,
	McpServerOverride
} from '../types/database';

/**
 * Generate a UUID v4 using crypto.randomUUID().
 */
function uuid(): string {
	return crypto.randomUUID();
}

/**
 * GET /api/conversations
 * List all conversations sorted by lastModified DESC.
 */
export function handleGetConversations(db: Database): Response {
	try {
		const conversations = getAllConversations(db);
		return Response.json(conversations);
	} catch (error) {
		console.error('[api] failed to get conversations:', error);
		return Response.json(
			{ error: 'Failed to retrieve conversations' },
			{ status: 500 }
		);
	}
}

/**
 * GET /api/conversations/:id
 * Get a single conversation by ID.
 */
export function handleGetConversation(db: Database, id: string): Response {
	try {
		const conversation = getConversation(db, id);
		if (!conversation) {
			return Response.json(
				{ error: 'Conversation not found' },
				{ status: 404 }
			);
		}
		return Response.json(conversation);
	} catch (error) {
		console.error('[api] failed to get conversation:', error);
		return Response.json(
			{ error: 'Failed to retrieve conversation' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/conversations
 * Create a new conversation.
 * Body: { name: string, mcpServerOverrides?: McpServerOverride[] }
 */
export async function handleCreateConversation(req: Request, db: Database): Promise<Response> {
	try {
		const body = await req.json();
		if (!body.name || typeof body.name !== 'string') {
			return Response.json(
				{ error: 'Missing or invalid "name" field' },
				{ status: 400 }
			);
		}

		const conversation: DatabaseConversation = {
			id: uuid(),
			name: body.name,
			lastModified: Date.now(),
			currNode: ''
		};

		if (body.mcpServerOverrides) {
			conversation.mcpServerOverrides = body.mcpServerOverrides;
		}

		createConversation(db, conversation);

		return Response.json(conversation, { status: 201 });
	} catch (error) {
		console.error('[api] failed to create conversation:', error);
		return Response.json(
			{ error: 'Failed to create conversation' },
			{ status: 500 }
		);
	}
}

/**
 * PUT /api/conversations/:id
 * Update a conversation.
 * Body: Partial<DatabaseConversation>
 */
export async function handleUpdateConversation(req: Request, db: Database, id: string): Promise<Response> {
	try {
		const existing = getConversation(db, id);
		if (!existing) {
			return Response.json(
				{ error: 'Conversation not found' },
				{ status: 404 }
			);
		}

		const body = await req.json();
		const updates: Partial<Omit<DatabaseConversation, 'id'>> = {};

		if (body.name !== undefined) updates.name = body.name;
		if (body.currNode !== undefined) updates.currNode = body.currNode;
		if (body.mcpServerOverrides !== undefined) updates.mcpServerOverrides = body.mcpServerOverrides;
		if (body.forkedFromConversationId !== undefined) updates.forkedFromConversationId = body.forkedFromConversationId;
		if (body.lastModified !== undefined) updates.lastModified = body.lastModified;

		updateConversation(db, id, updates);

		const updated = getConversation(db, id);
		return Response.json(updated);
	} catch (error) {
		console.error('[api] failed to update conversation:', error);
		return Response.json(
			{ error: 'Failed to update conversation' },
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/conversations/:id
 * Delete a conversation and all its messages.
 * Query params: deleteWithForks (boolean)
 */
export function handleDeleteConversation(db: Database, id: string, url: URL): Response {
	try {
		const existing = getConversation(db, id);
		if (!existing) {
			return Response.json(
				{ error: 'Conversation not found' },
				{ status: 404 }
			);
		}

		const deleteWithForks = url.searchParams.get('deleteWithForks') === 'true';

		db.transaction(() => {
			if (deleteWithForks) {
				// Recursively delete all descendant conversations
				const descendantIds = getDescendantConversationIds(db, id);
				for (const descId of descendantIds) {
					deleteConversation(db, descId);
				}
			} else {
				// Reparent direct children to deleted conv's parent
				const newParent = existing.forkedFromConversationId;
				const directChildren = db
					.query('SELECT id FROM conversations WHERE forked_from_conversation_id = $parentId')
					.all({ $parentId: id }) as Array<{ id: string }>;

				for (const row of directChildren) {
					updateConversation(db, row.id, {
						forkedFromConversationId: newParent
					});
				}
			}

			deleteConversation(db, id);
		})();

		return new Response(null, { status: 204 });
	} catch (error) {
		console.error('[api] failed to delete conversation:', error);
		return Response.json(
			{ error: 'Failed to delete conversation' },
			{ status: 500 }
		);
	}
}

/**
 * GET /api/conversations/:id/messages
 * Get all messages for a conversation with tree structure.
 */
export function handleGetConversationMessages(db: Database, convId: string): Response {
	try {
		const conversation = getConversation(db, convId);
		if (!conversation) {
			return Response.json(
				{ error: 'Conversation not found' },
				{ status: 404 }
			);
		}

		const messages = getConversationMessages(db, convId);
		const messagesWithTree = buildMessageTree(messages);

		return Response.json(messagesWithTree);
	} catch (error) {
		console.error('[api] failed to get messages:', error);
		return Response.json(
			{ error: 'Failed to retrieve messages' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/conversations/:id/messages
 * Create a new message in a conversation.
 * Query params: parentId (optional), type (optional: 'root', 'system', or default)
 * Body: { content, role, reasoningContent, toolCalls, toolCallId, extra, timings, model, timestamp }
 */
export async function handleCreateMessage(
	req: Request,
	db: Database,
	convId: string,
	url: URL
): Promise<Response> {
	try {
		const conversation = getConversation(db, convId);
		if (!conversation) {
			return Response.json(
				{ error: 'Conversation not found' },
				{ status: 404 }
			);
		}

		const body = await req.json();
		const parentId = url.searchParams.get('parentId');
		const messageType = url.searchParams.get('type');

		return db.transaction(() => {
			let newMessage: DatabaseMessage;

			if (messageType === 'root') {
				// Create root message
				newMessage = createRootMessage(db, convId);
			} else if (messageType === 'system' && parentId) {
				// Create system message
				if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
					return Response.json(
						{ error: 'System message content cannot be empty' },
						{ status: 400 }
					);
				}
				newMessage = createSystemMessage(db, convId, body.content.trim(), parentId);
			} else {
				// Create regular message
				if (body.role === undefined || body.role === null || body.role === '') {
					return Response.json(
						{ error: 'Missing "role" field' },
						{ status: 400 }
					);
				}
				if (body.content === undefined || body.content === null) {
					return Response.json(
						{ error: 'Missing "content" field' },
						{ status: 400 }
					);
				}

				if (parentId !== null) {
					const parentMessage = getMessageById(db, parentId);
					if (!parentMessage) {
						return Response.json(
							{ error: `Parent message ${parentId} not found` },
							{ status: 404 }
						);
					}
				}

				newMessage = {
					id: uuid(),
					convId,
					type: body.type || 'message',
					timestamp: body.timestamp || Date.now(),
					role: body.role,
					content: body.content,
					parent: parentId || null,
					reasoningContent: body.reasoningContent,
					toolCalls: body.toolCalls,
					toolCallId: body.toolCallId,
					extra: body.extra,
					timings: body.timings,
					model: body.model,
					children: []
				};

				createMessage(db, newMessage);

				// Update parent's children array if parent exists
				if (parentId) {
					const parentMessage = getMessageById(db, parentId);
					if (parentMessage) {
						const updatedChildren = [...parentMessage.children, newMessage.id];
						updateMessage(db, parentId, { children: updatedChildren });
					}
				}
			}

			// Update conversation's currNode to point to the new message
			updateConversation(db, convId, {
				currNode: newMessage.id,
				lastModified: Date.now()
			});

			// Fetch the message with tree context
			const allMessages = getConversationMessages(db, convId);
			const messagesWithTree = buildMessageTree(allMessages);
			const fullMessage = messagesWithTree.find((m) => m.id === newMessage.id)!;

			return Response.json(fullMessage, { status: 201 });
		})();
	} catch (error) {
		console.error('[api] failed to create message:', error);
		return Response.json(
			{ error: 'Failed to create message' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/conversations/:id/fork
 * Fork a conversation at a specific message.
 * Body: { messageId: string, name: string, includeAttachments: boolean }
 */
export async function handleForkConversation(db: Database, convId: string, req: Request): Promise<Response> {
	try {
		const sourceConv = getConversation(db, convId);
		if (!sourceConv) {
			return Response.json(
				{ error: 'Conversation not found' },
				{ status: 404 }
			);
		}

		const body = await req.json() as { messageId: string; name: string; includeAttachments: boolean };

		if (!body.messageId || !body.name) {
			return Response.json(
				{ error: 'Missing "messageId" or "name" field' },
				{ status: 400 }
			);
		}

		return db.transaction(() => {
			// Get all messages from source conversation
			const allMessages = getConversationMessages(db, convId);
			
			// Find the path to the target message
			const pathMessages = filterByLeafNodeId(allMessages, body.messageId, true) as DatabaseMessage[];
			if (pathMessages.length === 0) {
				return Response.json(
					{ error: `Could not resolve message path to ${body.messageId}` },
					{ status: 404 }
				);
			}

			// Create ID mapping for new messages
			const idMap = new Map<string, string>();
			for (const msg of pathMessages) {
				idMap.set(msg.id, uuid());
			}

			// Create new conversation
			const newConvId = uuid();
			const now = Date.now();

			const newConv: DatabaseConversation = {
				id: newConvId,
				name: body.name,
				lastModified: now,
				currNode: '',
				forkedFromConversationId: convId,
				mcpServerOverrides: sourceConv.mcpServerOverrides
					? sourceConv.mcpServerOverrides.map((o: McpServerOverride) => ({
							serverId: o.serverId,
							enabled: o.enabled
						}))
					: undefined
			};

			createConversation(db, newConv);

			// Clone messages with new IDs
			const clonedMessages: DatabaseMessage[] = pathMessages.map((msg) => {
				const newId = idMap.get(msg.id)!;
				const newParent = msg.parent ? (idMap.get(msg.parent) ?? null) : null;
				const newChildren = msg.children
					.filter((childId: string) => idMap.has(childId))
					.map((childId: string) => idMap.get(childId)!);

				return {
					...msg,
					id: newId,
					convId: newConvId,
					parent: newParent,
					children: newChildren,
					extra: body.includeAttachments ? msg.extra : undefined
				};
			});

			// Insert cloned messages
			for (const msg of clonedMessages) {
				createMessage(db, msg);
			}

			// Update currNode to the last cloned message
			const lastClonedMessage = clonedMessages[clonedMessages.length - 1];
			updateConversation(db, newConvId, {
				currNode: lastClonedMessage.id,
				lastModified: now
			});

			const createdConv = getConversation(db, newConvId);
			return Response.json(createdConv, { status: 201 });
		})();
	} catch (error) {
		console.error('[api] failed to fork conversation:', error);
		return Response.json(
			{ error: 'Failed to fork conversation' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/conversations/import
 * Import conversations from exported data.
 * Body: Array of { conv, messages } or single object
 */
export async function handleImportConversations(req: Request, db: Database): Promise<Response> {
	try {
		const body = await req.json();
		const data = Array.isArray(body) ? body : [body];

		if (!Array.isArray(data)) {
			return Response.json(
				{ error: 'Invalid import data format' },
				{ status: 400 }
			);
		}

		let importedCount = 0;
		let skippedCount = 0;

		db.transaction(() => {
			const sortedItems = topologicalSort(data);
			const importableIds = new Set(sortedItems.map((item) => item.conv.id));

			for (const item of sortedItems) {
				const { conv, messages } = item;

				const existing = getConversation(db, conv.id);
				if (existing) {
					console.warn(`Conversation "${conv.name}" already exists, skipping...`);
					skippedCount++;
					continue;
				}

				const conversationToInsert = { ...conv };
				if (conv.forkedFromConversationId && !importableIds.has(conv.forkedFromConversationId)) {
					console.warn(
						`Conversation "${conv.name}" references external parent "${conv.forkedFromConversationId}", setting to null`
					);
					conversationToInsert.forkedFromConversationId = undefined;
				}

				createConversation(db, conversationToInsert);
				for (const msg of messages) {
					createMessage(db, msg);
				}

				importedCount++;
			}
		})();

		return Response.json({ imported: importedCount, skipped: skippedCount });
	} catch (error) {
		console.error('[api] failed to import conversations:', error);
		return Response.json(
			{ error: 'Failed to import conversations' },
			{ status: 500 }
		);
	}
}

/**
 * Topologically sort conversations so parents are imported before their forks.
 */
function topologicalSort(
	items: { conv: DatabaseConversation; messages: DatabaseMessage[] }[]
): { conv: DatabaseConversation; messages: DatabaseMessage[] }[] {
	const convMap = new Map<string, { conv: DatabaseConversation; messages: DatabaseMessage[] }>();
	const inDegree = new Map<string, number>();
	const adjacency = new Map<string, string[]>();

	for (const item of items) {
		const id = item.conv.id;
		convMap.set(id, item);
		inDegree.set(id, 0);
		adjacency.set(id, []);
	}

	for (const item of items) {
		const parentId = item.conv.forkedFromConversationId;
		if (parentId && convMap.has(parentId)) {
			adjacency.get(parentId)!.push(item.conv.id);
			inDegree.set(item.conv.id, inDegree.get(item.conv.id)! + 1);
		}
	}

	const queue: string[] = [];
	for (const [id, degree] of inDegree) {
		if (degree === 0) queue.push(id);
	}

	const sorted: { conv: DatabaseConversation; messages: DatabaseMessage[] }[] = [];
	while (queue.length > 0) {
		const id = queue.shift()!;
		sorted.push(convMap.get(id)!);
		for (const childId of adjacency.get(id)!) {
			inDegree.set(childId, inDegree.get(childId)! - 1);
			if (inDegree.get(childId) === 0) queue.push(childId);
		}
	}

	if (sorted.length !== items.length) {
		console.warn('[import] circular dependency detected, some conversations may be out of order');
		const sortedIds = new Set(sorted.map((s) => s.conv.id));
		for (const item of items) {
			if (!sortedIds.has(item.conv.id)) sorted.push(item);
		}
	}

	return sorted;
}

/**
 * DELETE /api/conversations
 * Delete all conversations (bulk delete).
 * Query params: deleteWithForks (boolean) - if true, recursively delete all forks
 */
export function handleDeleteAllConversations(db: Database, url: URL): Response {
	try {
		const deleteWithForks = url.searchParams.get('deleteWithForks') === 'true';

		db.transaction(() => {
			if (deleteWithForks) {
				// Recursively delete all conversations including forks
				const allConversations = getAllConversations(db);
				for (const conv of allConversations) {
					deleteConversation(db, conv.id);
				}
			} else {
				// Only delete root conversations (those without forkedFromConversationId)
				// Forked conversations are reparented to have no parent
				const rootConversations = db
					.query('SELECT id FROM conversations WHERE forked_from_conversation_id IS NULL')
					.all() as Array<{ id: string }>;

				for (const row of rootConversations) {
					deleteConversation(db, row.id);
				}

				// Clear forkedFromConversationId for remaining conversations
				db.query('UPDATE conversations SET forked_from_conversation_id = NULL').run();
			}
		})();

		return new Response(null, { status: 204 });
	} catch (error) {
		console.error('[api] failed to delete all conversations:', error);
		return Response.json(
			{ error: 'Failed to delete conversations' },
			{ status: 500 }
		);
	}
}

/**
 * GET /api/conversations/export
 * Export all conversations with their messages.
 * Query params: limit (number, optional) - maximum number of conversations to export
 */
export function handleExportConversations(db: Database, url: URL): Response {
	try {
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? parseInt(limitParam, 10) : -1;

		let conversations = getAllConversations(db);

		// Sort by lastModified DESC (most recent first)
		conversations.sort((a, b) => b.lastModified - a.lastModified);

		// Apply limit if specified
		if (limit > 0) {
			conversations = conversations.slice(0, limit);
		}

		const exportData = conversations.map((conv) => {
			const messages = getConversationMessages(db, conv.id);
			return { conv, messages };
		});

		return Response.json(exportData);
	} catch (error) {
		console.error('[api] failed to export conversations:', error);
		return Response.json(
			{ error: 'Failed to export conversations' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/conversations/:id/compact
 * Compact a conversation by replacing old messages with a summary.
 * Body: { summaryMessage, messagesToCompact: [], anchorMessageId }
 */
export async function handleCompactConversation(db: Database, convId: string, req: Request): Promise<Response> {
	try {
		const body = await req.json() as {
			summaryMessage: DatabaseMessage;
			messagesToCompact: DatabaseMessage[];
			anchorMessageId: string;
		};

		const { summaryMessage, messagesToCompact, anchorMessageId } = body;

		if (!summaryMessage || !messagesToCompact || !anchorMessageId) {
			return Response.json(
				{ error: 'Missing required fields' },
				{ status: 400 }
			);
		}

		return db.transaction(() => {
			const compactedIds = new Set(messagesToCompact.map((m) => m.id));

			// Collect all messages we need to read
			const idsToFetch = new Set<string>();
			for (const msg of messagesToCompact) {
				idsToFetch.add(msg.id);
				if (msg.parent) idsToFetch.add(msg.parent);
				for (const cid of msg.children) idsToFetch.add(cid);
			}
			idsToFetch.add(anchorMessageId);
			if (summaryMessage.parent) idsToFetch.add(summaryMessage.parent);

			// Fetch all messages
			const allMessages: DatabaseMessage[] = [];
			for (const id of idsToFetch) {
				const msg = getMessageById(db, id);
				if (msg) allMessages.push(msg);
			}

			const messageMap = new Map<string, DatabaseMessage>();
			for (const msg of allMessages) {
				messageMap.set(msg.id, msg);
			}

			const messagesToPut: DatabaseMessage[] = [];

			// 1. Reparent children of compacted messages to the summary
			const orphanedChildIds = new Set<string>();
			for (const msg of messagesToCompact) {
				const message = messageMap.get(msg.id);
				if (!message) continue;

				for (const childId of message.children) {
					if (compactedIds.has(childId)) continue;
					const child = messageMap.get(childId);
					if (child) {
						child.parent = summaryMessage.id;
						messagesToPut.push(child);
					} else {
						orphanedChildIds.add(childId);
					}
				}
			}

			// 2. Remove compacted messages from their parents' children arrays
			const parentIdsToUpdate = new Set<string>();
			for (const msg of messagesToCompact) {
				if (msg.parent) parentIdsToUpdate.add(msg.parent);
			}
			for (const parentId of parentIdsToUpdate) {
				const parent = messageMap.get(parentId);
				if (parent) {
					parent.children = parent.children.filter((cid: string) => !compactedIds.has(cid));
					messagesToPut.push(parent);
				}
			}

			// 3. Update anchor message: set its parent to the summary message
			const anchorMessage = messageMap.get(anchorMessageId);
			if (anchorMessage) {
				anchorMessage.parent = summaryMessage.id;
				messagesToPut.push(anchorMessage);
			}

			// 4. Update the summary's parent's children array
			if (summaryMessage.parent) {
				const summaryParent = messageMap.get(summaryMessage.parent);
				if (summaryParent) {
					summaryParent.children = summaryParent.children.filter(
						(cid: string) => !compactedIds.has(cid)
					);
					summaryParent.children.push(summaryMessage.id);
					messagesToPut.push(summaryParent);
				}
			}

			// Execute updates
			for (const msg of messagesToPut) {
				updateMessage(db, msg.id, {
					parent: msg.parent,
					children: msg.children
				});
			}

			// Delete compacted messages
			deleteMessages(db, [...compactedIds]);

			// Clean up orphaned child references from summary
			if (orphanedChildIds.size > 0) {
				summaryMessage.children = summaryMessage.children.filter(
					(cid: string) => !orphanedChildIds.has(cid)
				);
			}

			// Insert summary message
			createMessage(db, summaryMessage);

			return Response.json({ success: true });
		})();
	} catch (error) {
		console.error('[api] failed to compact conversation:', error);
		return Response.json(
			{ error: 'Failed to compact conversation' },
			{ status: 500 }
		);
	}
}
