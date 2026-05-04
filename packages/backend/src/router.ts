import type { ModelPool } from "./pool/model-pool.ts";
import type { Config } from "./config.ts";
import { handleV1Models, handleModels } from "./handlers/models.ts";
import { handleChat } from "./handlers/chat.ts";
import { handleCompact } from "./handlers/compact.ts";
import { handleProps } from "./handlers/props.ts";
import { handleCorsProxy } from "./handlers/cors-proxy.ts";
import { handleHealth } from "./handlers/health.ts";
import { serveStatic } from "./handlers/static.ts";
import { getDatabase } from "./database/index.ts";
import * as conversationHandlers from "./handlers/conversations.ts";
import * as messageHandlers from "./handlers/messages.ts";
import * as skillHandlers from "./handlers/skills.ts";
import * as presetHandlers from "./handlers/presets.ts";
import { handleExecuteTool, handleGetAllowedCommands } from "./handlers/tools.ts";
import { handleFileSystem, handleFileSystemDiff } from "./handlers/filesystem.ts";
import { createLogger } from "./utils/logger.ts";
import { apiRoutes, buildRoutes, type CompiledRoute } from "#shared/types/routes.ts";

const log = createLogger("router");

type Handler = (
  req: Request,
  params: Record<string, string>,
  context: { pool: ModelPool; config: Config; query: URLSearchParams },
) => Promise<Response> | Response;

function matchRoute(
  compiled: CompiledRoute[],
  pathname: string,
  method: string,
): { route: CompiledRoute; params: Record<string, string> } | null {
  for (const route of compiled) {
    if (route.method !== method) continue;

    const match = pathname.match(route.regex);
    if (!match) continue;

    const params: Record<string, string> = {};
    route.keys.forEach((k: string, i: number) => {
      params[k] = match[i + 1];
    });

    return { route, params };
  }

  return null;
}

const compiledRoutes = buildRoutes(apiRoutes);

const handlers: Record<string, Handler> = {
  getV1Models: (_req, _params, { pool }) => handleV1Models(pool),
  handleChat: (req, _params, { pool }) => handleChat(req, pool),
  handleCompact: (req, _params, { pool }) => handleCompact(req, pool),
  handleProps: (req, _params, { pool }) => handleProps(req, pool),
  getModels: (req, _params, { pool }) => handleModels(req, pool),
  handleCorsProxy: (req, _params, _ctx) => handleCorsProxy(req),
  handleHealth: (_req, _params, { pool }) => handleHealth(pool),

  getConversations: (_req, _params, _ctx) =>
    conversationHandlers.handleGetConversations(getDatabase()),

  createConversation: (req, _params, _ctx) =>
    conversationHandlers.handleCreateConversation(req, getDatabase()),

  deleteAllConversations: (req, _params, { query }) =>
    conversationHandlers.handleDeleteAllConversations(getDatabase(), new URLSearchParams(query)),

  importConversations: (req, _params, _ctx) =>
    conversationHandlers.handleImportConversations(req, getDatabase()),

  exportConversations: (_req, _params, { query }) =>
    conversationHandlers.handleExportConversations(getDatabase(), new URLSearchParams(query)),

  getConversation: (_req, { id }, _ctx) =>
    conversationHandlers.handleGetConversation(getDatabase(), id),

  updateConversation: (req, { id }, _ctx) =>
    conversationHandlers.handleUpdateConversation(req, getDatabase(), id),

  deleteConversation: (req, { id }, { query }) =>
    conversationHandlers.handleDeleteConversation(getDatabase(), id, new URLSearchParams(query)),

  forkConversation: (req, { id }, _ctx) =>
    conversationHandlers.handleForkConversation(getDatabase(), id, req),

  getMessages: (_req, { id }, _ctx) =>
    conversationHandlers.handleGetConversationMessages(getDatabase(), id),

  createMessage: (req, { id }, { query }) =>
    conversationHandlers.handleCreateMessage(req, getDatabase(), id, new URLSearchParams(query)),

  getSubagentSessions: (_req, { id }, _ctx) =>
    conversationHandlers.handleGetSubagentSessions(getDatabase(), id),

  getSubagentMessages: (_req, { id }, { query }) =>
    conversationHandlers.handleGetSubagentMessages(getDatabase(), id, new URLSearchParams(query)),

  getMessage: (_req, { id }, _ctx) =>
    messageHandlers.handleGetMessage(getDatabase(), id),

  updateMessage: (req, { id }, _ctx) =>
    messageHandlers.handleUpdateMessage(req, getDatabase(), id),

  deleteMessage: (req, { id }, { query }) =>
    messageHandlers.handleDeleteMessage(getDatabase(), id, new URLSearchParams(query)),

  deleteMessageCascading: (req, { id }, _ctx) =>
    messageHandlers.handleDeleteMessageCascading(req, getDatabase(), id),

  listSkills: (_req, _params, _ctx) =>
    skillHandlers.handleListSkills(getDatabase()),

  createSkill: (req, _params, _ctx) =>
    skillHandlers.handleCreateSkill(req, getDatabase()),

  readSkill: (_req, { name }, _ctx) =>
    skillHandlers.handleReadSkill(getDatabase(), name),

  updateSkill: (req, { name }, _ctx) =>
    skillHandlers.handleUpdateSkill(req, getDatabase(), name),

  deleteSkill: (_req, { name }, _ctx) =>
    skillHandlers.handleDeleteSkill(getDatabase(), name),

  listPresets: (_req, _params, _ctx) =>
    presetHandlers.handleListPresets(getDatabase()),

  createPreset: (req, _params, _ctx) =>
    presetHandlers.handleCreatePreset(req, getDatabase()),

  getPreset: (_req, { id }, _ctx) =>
    presetHandlers.handleGetPreset(getDatabase(), id),

  updatePreset: (req, { id }, _ctx) =>
    presetHandlers.handleUpdatePreset(req, getDatabase(), id),

  deletePreset: (_req, { id }, _ctx) =>
    presetHandlers.handleDeletePreset(getDatabase(), id),

  executeTool: (req, _params, { config }) =>
    handleExecuteTool(req, config),

  getAllowedCommands: (req, _params, { config }) =>
    handleGetAllowedCommands(req, config),

  getFileSystem: (req, _params, { config }) =>
    handleFileSystem(req, config),

  getFileSystemDiff: (req, _params, { config }) =>
    handleFileSystemDiff(req, config),
};

export function createRouter(pool: ModelPool, config: Config) {
  return async function router(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const startTime = Date.now();

    try {
      const found = matchRoute(compiledRoutes, url.pathname, method);

      if (found) {
        const { route, params } = found;
        const handler = handlers[route.handlerKey];

        if (!handler) {
          log.error(`no handler registered for ${route.handlerKey}`);
          return Response.json(
            { error: "Handler not found" },
            { status: 500 },
          );
        }

        const response = await handler(req, params, {
          pool,
          config,
          query: url.searchParams,
        });

        const elapsed = Date.now() - startTime;
        log.info(`${method} ${url.pathname} ${response.status} (${elapsed}ms)`);

        return response;
      }

      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE, HEAD",
            "Access-Control-Allow-Headers": "*",
          },
        });
      }

      if (method === "GET") {
        const response = await serveStatic(req, config.resolvedStaticDir);
        const elapsed = Date.now() - startTime;
        log.info(`${method} ${url.pathname} ${response.status} (${elapsed}ms)`);
        return response;
      }

      const response = new Response("Method Not Allowed", { status: 405 });
      const elapsed = Date.now() - startTime;
      log.info(`${method} ${url.pathname} ${response.status} (${elapsed}ms)`);
      return response;
    } catch (err) {
      log.error(
        `unhandled error in ${method} ${url.pathname}:`,
        err,
      );
      return Response.json(
        { error: "Internal server error", detail: (err as Error).message },
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  };
}
