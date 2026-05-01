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

const log = createLogger("router");

type RouteHandler = (
  req: Request,
  pool: ModelPool,
  config: Config,
) => Promise<Response>;
type RoutePattern = {
  pattern: RegExp | string;
  method?: string | string[];
  handler: RouteHandler;
};

const routes: RoutePattern[] = [];

function addRoute(
  pattern: RegExp | string,
  method: string | string[] | undefined,
  handler: RouteHandler,
) {
  routes.push({ pattern, method, handler });
}

function matchRoute(
  pathname: string,
  method: string,
): RouteHandler | null {
  for (const route of routes) {
    const isMatch =
      typeof route.pattern === "string"
        ? route.pattern === pathname
        : route.pattern.test(pathname);

    if (isMatch) {
      if (!route.method) return route.handler;
      const methods = Array.isArray(route.method)
        ? route.method
        : [route.method];
      if (methods.includes(method)) return route.handler;
    }
  }
  return null;
}

function extractId(pathname: string, pattern: RegExp): string | null {
  const match = pathname.match(pattern);
  return match?.[1] ?? null;
}

// Initialize routes
function initializeRoutes(pool: ModelPool, config: Config) {
  routes.length = 0;

  // API routes - models
  addRoute("/v1/models", "GET", async () => handleV1Models(pool));
  addRoute("/v1/chat/completions", "POST", (req) => handleChat(req, pool));
  addRoute("/compact", "POST", (req) => handleCompact(req, pool));
  addRoute("/props", "GET", (req) => handleProps(req, pool));
  addRoute("/models", "GET", (req) => handleModels(req, pool));
  addRoute(
    "/cors-proxy",
    ["GET", "HEAD"],
    (req) => handleCorsProxy(req),
  );
  addRoute("/health", "GET", async () => handleHealth(pool));

  // Database API - conversations collection
  addRoute(
    "/api/conversations",
    "GET",
    async () => conversationHandlers.handleGetConversations(getDatabase()),
  );
  addRoute(
    "/api/conversations",
    "POST",
    (req) => conversationHandlers.handleCreateConversation(req, getDatabase()),
  );
  addRoute(
    "/api/conversations",
    "DELETE",
    async (req) => conversationHandlers.handleDeleteAllConversations(getDatabase(), new URL(req.url)),
  );
  addRoute(
    "/api/conversations/import",
    "POST",
    (req) => conversationHandlers.handleImportConversations(req, getDatabase()),
  );
  addRoute(
    "/api/conversations/export",
    "GET",
    async (req) => conversationHandlers.handleExportConversations(getDatabase(), new URL(req.url)),
  );

  // Database API - conversations by ID
  addRoute(
    /^\/api\/conversations\/([^/]+)$/,
    "GET",
    async (req) => {
      const convId = extractId(new URL(req.url).pathname, /^\/api\/conversations\/([^/]+)$/);
      return conversationHandlers.handleGetConversation(getDatabase(), convId!);
    },
  );
  addRoute(
    /^\/api\/conversations\/([^/]+)$/,
    "PUT",
    (req) => {
      const convId = extractId(new URL(req.url).pathname, /^\/api\/conversations\/([^/]+)$/);
      return conversationHandlers.handleUpdateConversation(req, getDatabase(), convId!);
    },
  );
  addRoute(
    /^\/api\/conversations\/([^/]+)$/,
    "DELETE",
    async (req) => {
      const convId = extractId(new URL(req.url).pathname, /^\/api\/conversations\/([^/]+)$/);
      return conversationHandlers.handleDeleteConversation(getDatabase(), convId!, new URL(req.url));
    },
  );

  // Database API - conversation fork
  addRoute(
    /^\/api\/conversations\/[^/]+\/fork$/,
    "POST",
    (req) => {
      const convId = new URL(req.url).pathname.split("/")[3];
      return conversationHandlers.handleForkConversation(getDatabase(), convId, req);
    },
  );

  // Database API - conversation messages
  addRoute(
    /^\/api\/conversations\/[^/]+\/messages$/,
    "GET",
    async (req) => {
      const convId = new URL(req.url).pathname.split("/")[3];
      return conversationHandlers.handleGetConversationMessages(getDatabase(), convId);
    },
  );
  addRoute(
    /^\/api\/conversations\/[^/]+\/messages$/,
    "POST",
    (req) => {
      const convId = new URL(req.url).pathname.split("/")[3];
      return conversationHandlers.handleCreateMessage(req, getDatabase(), convId, new URL(req.url));
    },
  );

  // Database API - subagent sessions
  addRoute(
    /^\/api\/conversations\/[^/]+\/subagent-sessions$/,
    "GET",
    async (req) => {
      const convId = new URL(req.url).pathname.split("/")[3];
      return conversationHandlers.handleGetSubagentSessions(getDatabase(), convId);
    },
  );
  addRoute(
    /^\/api\/conversations\/[^/]+\/subagent-messages$/,
    "GET",
    async (req) => {
      const convId = new URL(req.url).pathname.split("/")[3];
      return conversationHandlers.handleGetSubagentMessages(getDatabase(), convId, new URL(req.url));
    },
  );

  // Database API - messages by ID
  addRoute(
    /^\/api\/messages\/([^/]+)$/,
    "GET",
    async (req) => {
      const msgId = extractId(new URL(req.url).pathname, /^\/api\/messages\/([^/]+)$/);
      return messageHandlers.handleGetMessage(getDatabase(), msgId!);
    },
  );
  addRoute(
    /^\/api\/messages\/([^/]+)$/,
    "PUT",
    (req) => {
      const msgId = extractId(new URL(req.url).pathname, /^\/api\/messages\/([^/]+)$/);
      return messageHandlers.handleUpdateMessage(req, getDatabase(), msgId!);
    },
  );
  addRoute(
    /^\/api\/messages\/([^/]+)$/,
    "DELETE",
    async (req) => {
      const msgId = extractId(new URL(req.url).pathname, /^\/api\/messages\/([^/]+)$/);
      return messageHandlers.handleDeleteMessage(getDatabase(), msgId!, new URL(req.url));
    },
  );

  // Database API - message cascading delete
  addRoute(
    /^\/api\/messages\/[^/]+\/delete-cascading$/,
    "POST",
    (req) => {
      const msgId = new URL(req.url).pathname.split("/")[3];
      return messageHandlers.handleDeleteMessageCascading(req, getDatabase(), msgId);
    },
  );

  // Tool execution
  addRoute(
    "/api/tools/execute",
    "POST",
    (req) => handleExecuteTool(req, config),
  );
  addRoute(
    "/api/tools/allowed-commands",
    "GET",
    (req) => handleGetAllowedCommands(req, config),
  );

  // File system API
  addRoute(
    "/api/file-system",
    "GET",
    (req) => handleFileSystem(req, config),
  );
  addRoute(
    "/api/file-system/diff",
    "POST",
    (req) => handleFileSystemDiff(req, config),
  );

  // Skill API routes
  addRoute(
    "/api/skills",
    "GET",
    () => skillHandlers.handleListSkills(getDatabase()),
  );
  addRoute(
    "/api/skills",
    "POST",
    (req) => skillHandlers.handleCreateSkill(req, getDatabase()),
  );

  // Database API - skills by name
  addRoute(
    /^\/api\/skills\/([^/]+)$/,
    "GET",
    (req) => {
      const skillName = extractId(new URL(req.url).pathname, /^\/api\/skills\/([^/]+)$/);
      return skillHandlers.handleReadSkill(getDatabase(), skillName!);
    },
  );
  addRoute(
    /^\/api\/skills\/([^/]+)$/,
    "PUT",
    (req) => {
      const skillName = extractId(new URL(req.url).pathname, /^\/api\/skills\/([^/]+)$/);
      return skillHandlers.handleUpdateSkill(req, getDatabase(), skillName!);
    },
  );
  addRoute(
    /^\/api\/skills\/([^/]+)$/,
    "DELETE",
    (req) => {
      const skillName = extractId(new URL(req.url).pathname, /^\/api\/skills\/([^/]+)$/);
      return skillHandlers.handleDeleteSkill(getDatabase(), skillName!);
    },
  );

  // Preset API routes
  addRoute(
    "/api/presets",
    "GET",
    () => presetHandlers.handleListPresets(getDatabase()),
  );
  addRoute(
    "/api/presets",
    "POST",
    (req) => presetHandlers.handleCreatePreset(req, getDatabase()),
  );
  addRoute(
    /^\/api\/presets\/([^/]+)$/,
    "GET",
    (req) => {
      const presetId = extractId(new URL(req.url).pathname, /^\/api\/presets\/([^/]+)$/);
      return presetHandlers.handleGetPreset(getDatabase(), presetId!);
    },
  );
  addRoute(
    /^\/api\/presets\/([^/]+)$/,
    "PUT",
    (req) => {
      const presetId = extractId(new URL(req.url).pathname, /^\/api\/presets\/([^/]+)$/);
      return presetHandlers.handleUpdatePreset(req, getDatabase(), presetId!);
    },
  );
  addRoute(
    /^\/api\/presets\/([^/]+)$/,
    "DELETE",
    (req) => {
      const presetId = extractId(new URL(req.url).pathname, /^\/api\/presets\/([^/]+)$/);
      return presetHandlers.handleDeletePreset(getDatabase(), presetId!);
    },
  );
}

export function createRouter(pool: ModelPool, config: Config) {
  initializeRoutes(pool, config);

  return async function router(req: Request): Promise<Response> {
    try {
      return await dispatchRoute(req, pool, config);
    } catch (err) {
      log.error(
        `unhandled error in ${req.method} ${new URL(req.url).pathname}:`,
        err,
      );
      return Response.json(
        { error: "Internal server error", detail: (err as Error).message },
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  };
}


async function dispatchRoute(
  req: Request,
  pool: ModelPool,
  config: Config,
): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const method = req.method.toUpperCase();

  // Try to match route in registry
  const handler = matchRoute(pathname, method);
  if (handler) {
    return handler(req, pool, config);
  }

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // Static file serving + SPA fallback for all unmatched GET requests
  if (method === "GET") {
    return serveStatic(req, config.resolvedStaticDir);
  }

  return new Response("Method Not Allowed", { status: 405 });
}
