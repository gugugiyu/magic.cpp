/**
 * Shared route tree definitions for type-safe API routing.
 * Used by both frontend (API client generation) and backend (router dispatch).
 */

export type Method = "GET" | "POST" | "PUT" | "DELETE" | "HEAD";

export type RouteDef = {
  path: string;
  children?: RouteDef[];
  methods?: Partial<Record<Method, string>>;
};

export type CompiledRoute = {
  method: Method;
  regex: RegExp;
  keys: string[];
  handlerKey: string;
};

export function compilePath(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];

  const pattern = path
    .split("/")
    .map((part) => {
      if (part.startsWith(":")) {
        keys.push(part.slice(1));
        return "([^/]+)";
      }
      return part;
    })
    .join("/");

  return {
    regex: new RegExp(`^${pattern}$`),
    keys,
  };
}

export function buildRoutes(defs: RouteDef[], base = ""): CompiledRoute[] {
  const result: CompiledRoute[] = [];

  for (const def of defs) {
    const fullPath = `${base}/${def.path}`.replace(/\/+/g, "/");

    if (def.methods) {
      const { regex, keys } = compilePath(fullPath);

      for (const [method, handlerKey] of Object.entries(def.methods)) {
        result.push({
          method: method as Method,
          regex,
          keys,
          handlerKey: handlerKey!,
        });
      }
    }

    if (def.children) {
      result.push(...buildRoutes(def.children, fullPath));
    }
  }

  return result;
}

export const apiRoutes: RouteDef[] = [
  {
    path: "/api",
    children: [
      {
        path: "conversations",
        methods: {
          GET: "getConversations",
          POST: "createConversation",
          DELETE: "deleteAllConversations",
        },
        children: [
          { path: "import", methods: { POST: "importConversations" } },
          { path: "export", methods: { GET: "exportConversations" } },
          {
            path: ":id",
            methods: {
              GET: "getConversation",
              PUT: "updateConversation",
              DELETE: "deleteConversation",
            },
            children: [
              { path: "fork", methods: { POST: "forkConversation" } },
              {
                path: "messages",
                methods: {
                  GET: "getMessages",
                  POST: "createMessage",
                },
              },
              {
                path: "subagent-sessions",
                methods: { GET: "getSubagentSessions" },
              },
              {
                path: "subagent-messages",
                methods: { GET: "getSubagentMessages" },
              },
            ],
          },
        ],
      },
      {
        path: "messages/:id",
        methods: {
          GET: "getMessage",
          PUT: "updateMessage",
          DELETE: "deleteMessage",
        },
        children: [
          {
            path: "delete-cascading",
            methods: { POST: "deleteMessageCascading" },
          },
        ],
      },
      {
        path: "skills",
        methods: {
          GET: "listSkills",
          POST: "createSkill",
        },
        children: [
          {
            path: ":name",
            methods: {
              GET: "readSkill",
              PUT: "updateSkill",
              DELETE: "deleteSkill",
            },
          },
        ],
      },
      {
        path: "presets",
        methods: {
          GET: "listPresets",
          POST: "createPreset",
        },
        children: [
          {
            path: ":id",
            methods: {
              GET: "getPreset",
              PUT: "updatePreset",
              DELETE: "deletePreset",
            },
          },
        ],
      },
      {
        path: "tools/execute",
        methods: { POST: "executeTool" },
      },
      {
        path: "tools/allowed-commands",
        methods: { GET: "getAllowedCommands" },
      },
      {
        path: "file-system",
        methods: { GET: "getFileSystem" },
        children: [
          {
            path: "diff",
            methods: { POST: "getFileSystemDiff" },
          },
        ],
      },
    ],
  },
  {
    path: "/v1/models",
    methods: { GET: "getV1Models" },
  },
  {
    path: "/v1/chat/completions",
    methods: { POST: "handleChat" },
  },
  {
    path: "/compact",
    methods: { POST: "handleCompact" },
  },
  {
    path: "/props",
    methods: { GET: "handleProps" },
  },
  {
    path: "/models",
    methods: { GET: "getModels" },
    children: [
      { path: "load", methods: { POST: "loadModel" } },
      { path: "unload", methods: { POST: "unloadModel" } },
    ],
  },
  {
    path: "/cors-proxy",
    methods: { GET: "handleCorsProxy", HEAD: "handleCorsProxy" },
  },
  {
    path: "/health",
    methods: { GET: "handleHealth" },
  },
];
