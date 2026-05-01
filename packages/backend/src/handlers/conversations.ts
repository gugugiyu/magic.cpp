/**
 * HTTP handlers for /api/conversations/* endpoints.
 * All handlers return JSON responses with standard HTTP status codes.
 */

import type { DrizzleDB } from "../database/index.ts";
import {
  getAllConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  getDescendantConversationIds,
  getChildrenConversations,
  getRootConversationIds,
  clearForkParentForAll,
} from "../database/queries/conversations.ts";
import {
  getConversationMessages,
  getMessageById,
  createMessage,
  createRootMessage,
  createSystemMessage,
  buildMessageTree,
  deleteMessages,
  updateMessage,
  getSubagentMessages,
  getSubagentSessions,
} from "../database/queries/messages.ts";
import { filterByLeafNodeId } from "../utils/branching.ts";
import type {
  DatabaseConversation,
  DatabaseMessage,
  McpServerOverride,
} from "../types/database";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("api");

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * GET /api/conversations
 */
export function handleGetConversations(db: DrizzleDB): Response {
  try {
    const conversations = getAllConversations(db);
    return Response.json(conversations);
  } catch (error) {
    log.error("failed to get conversations:", error);
    return Response.json(
      { error: "Failed to retrieve conversations" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/conversations/:id
 */
export function handleGetConversation(db: DrizzleDB, id: string): Response {
  try {
    const conversation = getConversation(db, id);
    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    return Response.json(conversation);
  } catch (error) {
    log.error("failed to get conversation:", error);
    return Response.json(
      { error: "Failed to retrieve conversation" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/conversations
 * Body: { name: string, mcpServerOverrides?: McpServerOverride[] }
 */
export async function handleCreateConversation(
  req: Request,
  db: DrizzleDB,
): Promise<Response> {
  try {
    const body = await req.json();
    if (!body.name || typeof body.name !== "string") {
      return Response.json(
        { error: 'Missing or invalid "name" field' },
        { status: 400 },
      );
    }

    const conversation: DatabaseConversation = {
      id: uuid(),
      name: body.name,
      lastModified: Date.now(),
      currNode: "",
    };

    if (body.mcpServerOverrides) {
      conversation.mcpServerOverrides = body.mcpServerOverrides;
    }
    if (body.todos) {
      conversation.todos = body.todos;
    }

    createConversation(db, conversation);

    return Response.json(conversation, { status: 201 });
  } catch (error) {
    log.error("failed to create conversation:", error);
    return Response.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/conversations/:id
 * Body: Partial<DatabaseConversation>
 */
export async function handleUpdateConversation(
  req: Request,
  db: DrizzleDB,
  id: string,
): Promise<Response> {
  try {
    const existing = getConversation(db, id);
    if (!existing) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const updates: Partial<Omit<DatabaseConversation, "id">> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.currNode !== undefined) updates.currNode = body.currNode;
    if (body.mcpServerOverrides !== undefined)
      updates.mcpServerOverrides = body.mcpServerOverrides;
    if (body.forkedFromConversationId !== undefined)
      updates.forkedFromConversationId = body.forkedFromConversationId;
    if (body.lastModified !== undefined)
      updates.lastModified = body.lastModified;
    if (body.pinned !== undefined) updates.pinned = body.pinned;
    if (body.todos !== undefined) updates.todos = body.todos;

    updateConversation(db, id, updates);

    const updated = getConversation(db, id);
    return Response.json(updated);
  } catch (error) {
    log.error("failed to update conversation:", error);
    return Response.json(
      { error: "Failed to update conversation" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/conversations/:id
 * Query params: deleteWithForks (boolean)
 */
export function handleDeleteConversation(
  db: DrizzleDB,
  id: string,
  url: URL,
): Response {
  try {
    const existing = getConversation(db, id);
    if (!existing) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const deleteWithForks = url.searchParams.get("deleteWithForks") === "true";

    db.transaction((tx) => {
      if (deleteWithForks) {
        const descendantIds = getDescendantConversationIds(tx, id);
        for (const descId of descendantIds) {
          deleteConversation(tx, descId);
        }
      } else {
        const newParent = existing.forkedFromConversationId ?? null;
        const directChildren = getChildrenConversations(tx, id);
        for (const child of directChildren) {
          updateConversation(tx, child.id, {
            forkedFromConversationId: newParent,
          });
        }
      }
      deleteConversation(tx, id);
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    log.error("failed to delete conversation:", error);
    return Response.json(
      { error: "Failed to delete conversation" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/conversations/:id/messages
 */
export function handleGetConversationMessages(
  db: DrizzleDB,
  convId: string,
): Response {
  try {
    const conversation = getConversation(db, convId);
    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const messages = getConversationMessages(db, convId);
    const messagesWithTree = buildMessageTree(messages);

    return Response.json(messagesWithTree);
  } catch (error) {
    log.error("failed to get messages:", error);
    return Response.json(
      { error: "Failed to retrieve messages" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/conversations/:id/subagent-sessions
 */
export function handleGetSubagentSessions(
  db: DrizzleDB,
  convId: string,
): Response {
  try {
    const conversation = getConversation(db, convId);
    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const sessions = getSubagentSessions(db, convId);
    return Response.json(sessions);
  } catch (error) {
    log.error("failed to get subagent sessions:", error);
    return Response.json(
      { error: "Failed to retrieve subagent sessions" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/conversations/:id/subagent-messages?sessionId=xxx
 */
export function handleGetSubagentMessages(
  db: DrizzleDB,
  convId: string,
  url: URL,
): Response {
  try {
    const conversation = getConversation(db, convId);
    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return Response.json(
        { error: "Missing sessionId query parameter" },
        { status: 400 },
      );
    }

    const messages = getSubagentMessages(db, convId, sessionId);
    const messagesWithTree = buildMessageTree(messages);

    return Response.json(messagesWithTree);
  } catch (error) {
    log.error("failed to get subagent messages:", error);
    return Response.json(
      { error: "Failed to retrieve subagent messages" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/conversations/:id/messages
 * Query params: parentId (optional), type (optional: 'root', 'system', or default)
 * Body: { content, role, reasoningContent, toolCalls, toolCallId, extra, timings, model, timestamp }
 */
export async function handleCreateMessage(
  req: Request,
  db: DrizzleDB,
  convId: string,
  url: URL,
): Promise<Response> {
  try {
    const conversation = getConversation(db, convId);
    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const parentId = url.searchParams.get("parentId");
    const messageType = url.searchParams.get("type");

    return db.transaction((tx) => {
      let newMessage: DatabaseMessage;

      if (messageType === "root") {
        newMessage = createRootMessage(tx, convId);
      } else if (messageType === "system" && parentId) {
        if (
          !body.content ||
          typeof body.content !== "string" ||
          !body.content.trim()
        ) {
          return Response.json(
            { error: "System message content cannot be empty" },
            { status: 400 },
          );
        }
        newMessage = createSystemMessage(
          tx,
          convId,
          body.content.trim(),
          parentId,
        );
      } else {
        if (body.role === undefined || body.role === null || body.role === "") {
          return Response.json(
            { error: 'Missing "role" field' },
            { status: 400 },
          );
        }
        if (body.content === undefined || body.content === null) {
          return Response.json(
            { error: 'Missing "content" field' },
            { status: 400 },
          );
        }

        if (parentId !== null) {
          const parentMessage = getMessageById(tx, parentId);
          if (!parentMessage) {
            return Response.json(
              { error: `Parent message ${parentId} not found` },
              { status: 404 },
            );
          }
        }

        newMessage = {
          id: uuid(),
          convId,
          type: body.type || "message",
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
          subagentSessionId: body.subagentSessionId,
          children: [],
        };

        createMessage(tx, newMessage);

        if (parentId) {
          const parentMessage = getMessageById(tx, parentId);
          if (parentMessage) {
            const updatedChildren = [...parentMessage.children, newMessage.id];
            updateMessage(tx, parentId, { children: updatedChildren });
          }
        }
      }

      updateConversation(tx, convId, {
        currNode: newMessage.id,
        lastModified: Date.now(),
      });

      const allMessages = getConversationMessages(tx, convId);
      const messagesForTree = allMessages.some((m) => m.id === newMessage.id)
        ? allMessages
        : [...allMessages, newMessage];
      const messagesWithTree = buildMessageTree(messagesForTree);
      const fullMessage = messagesWithTree.find((m) => m.id === newMessage.id)!;

      return Response.json(fullMessage, { status: 201 });
    });
  } catch (error) {
    log.error("failed to create message:", error);
    return Response.json(
      { error: "Failed to create message" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/conversations/:id/fork
 * Body: { messageId: string, name: string, includeAttachments: boolean }
 */
export async function handleForkConversation(
  db: DrizzleDB,
  convId: string,
  req: Request,
): Promise<Response> {
  try {
    const sourceConv = getConversation(db, convId);
    if (!sourceConv) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const body = (await req.json()) as {
      messageId: string;
      name: string;
      includeAttachments: boolean;
    };

    if (!body.messageId || !body.name) {
      return Response.json(
        { error: 'Missing "messageId" or "name" field' },
        { status: 400 },
      );
    }

    return db.transaction((tx) => {
      const allMessages = getConversationMessages(tx, convId);

      const pathMessages = filterByLeafNodeId(
        allMessages,
        body.messageId,
        true,
      ) as DatabaseMessage[];
      if (pathMessages.length === 0) {
        return Response.json(
          { error: `Could not resolve message path to ${body.messageId}` },
          { status: 404 },
        );
      }

      const idMap = new Map<string, string>();
      for (const msg of pathMessages) {
        idMap.set(msg.id, uuid());
      }

      const newConvId = uuid();
      const now = Date.now();

      const newConv: DatabaseConversation = {
        id: newConvId,
        name: body.name,
        lastModified: now,
        currNode: "",
        forkedFromConversationId: convId,
        mcpServerOverrides: sourceConv.mcpServerOverrides
          ? sourceConv.mcpServerOverrides.map((o: McpServerOverride) => ({
              serverId: o.serverId,
              enabled: o.enabled,
            }))
          : undefined,
      };

      createConversation(tx, newConv);

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
          extra: body.includeAttachments ? msg.extra : undefined,
        };
      });

      for (const msg of clonedMessages) {
        createMessage(tx, msg);
      }

      const lastClonedMessage = clonedMessages[clonedMessages.length - 1];
      updateConversation(tx, newConvId, {
        currNode: lastClonedMessage.id,
        lastModified: now,
      });

      const createdConv = getConversation(tx, newConvId);
      return Response.json(createdConv, { status: 201 });
    });
  } catch (error) {
    log.error("failed to fork conversation:", error);
    return Response.json(
      { error: "Failed to fork conversation" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/conversations/import
 * Body: Array of { conv, messages } or single object
 */
export async function handleImportConversations(
  req: Request,
  db: DrizzleDB,
): Promise<Response> {
  try {
    const body = await req.json();
    const data = Array.isArray(body) ? body : [body];

    if (!Array.isArray(data)) {
      return Response.json(
        { error: "Invalid import data format" },
        { status: 400 },
      );
    }

    let importedCount = 0;
    let skippedCount = 0;

    db.transaction((tx) => {
      const sortedItems = topologicalSort(data);
      const importableIds = new Set(sortedItems.map((item) => item.conv.id));

      for (const item of sortedItems) {
        const { conv, messages } = item;

        const existing = getConversation(tx, conv.id);
        if (existing) {
          log.warn(
            `Conversation "${conv.name}" already exists, skipping...`,
          );
          skippedCount++;
          continue;
        }

        const conversationToInsert = { ...conv };
        if (
          conv.forkedFromConversationId &&
          !importableIds.has(conv.forkedFromConversationId)
        ) {
          log.warn(
            `Conversation "${conv.name}" references external parent "${conv.forkedFromConversationId}", setting to null`,
          );
          conversationToInsert.forkedFromConversationId = null;
        }

        createConversation(tx, conversationToInsert);
        for (const msg of messages) {
          createMessage(tx, msg);
        }

        importedCount++;
      }
    });

    return Response.json({ imported: importedCount, skipped: skippedCount });
  } catch (error) {
    log.error("failed to import conversations:", error);
    return Response.json(
      { error: "Failed to import conversations" },
      { status: 500 },
    );
  }
}

function topologicalSort(
  items: { conv: DatabaseConversation; messages: DatabaseMessage[] }[],
): { conv: DatabaseConversation; messages: DatabaseMessage[] }[] {
  const convMap = new Map<
    string,
    { conv: DatabaseConversation; messages: DatabaseMessage[] }
  >();
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

  const sorted: { conv: DatabaseConversation; messages: DatabaseMessage[] }[] =
    [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(convMap.get(id)!);
    for (const childId of adjacency.get(id)!) {
      inDegree.set(childId, inDegree.get(childId)! - 1);
      if (inDegree.get(childId) === 0) queue.push(childId);
    }
  }

  if (sorted.length !== items.length) {
    log.warn(
      "circular dependency detected, some conversations may be out of order",
    );
    const sortedIds = new Set(sorted.map((s) => s.conv.id));
    for (const item of items) {
      if (!sortedIds.has(item.conv.id)) sorted.push(item);
    }
  }

  return sorted;
}

/**
 * DELETE /api/conversations
 * Query params: deleteWithForks (boolean)
 */
export function handleDeleteAllConversations(
  db: DrizzleDB,
  url: URL,
): Response {
  try {
    const deleteWithForks = url.searchParams.get("deleteWithForks") === "true";

    db.transaction((tx) => {
      if (deleteWithForks) {
        const allConversations = getAllConversations(tx);
        for (const conv of allConversations) {
          deleteConversation(tx, conv.id);
        }
      } else {
        const rootIds = getRootConversationIds(tx);
        for (const id of rootIds) {
          deleteConversation(tx, id);
        }
        clearForkParentForAll(tx);
      }
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    log.error("failed to delete all conversations:", error);
    return Response.json(
      { error: "Failed to delete conversations" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/conversations/export
 * Query params: limit (number, optional)
 */
export function handleExportConversations(db: DrizzleDB, url: URL): Response {
  try {
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : -1;

    let conversations = getAllConversations(db);

    conversations.sort((a, b) => b.lastModified - a.lastModified);

    if (limit > 0) {
      conversations = conversations.slice(0, limit);
    }

    const exportData = conversations.map((conv) => {
      const messages = getConversationMessages(db, conv.id);
      return { conv, messages };
    });

    return Response.json(exportData);
  } catch (error) {
    log.error("failed to export conversations:", error);
    return Response.json(
      { error: "Failed to export conversations" },
      { status: 500 },
    );
  }
}
