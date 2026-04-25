# magic.cpp Backend — Architecture

A lightweight HTTP gateway that sits between the frontend and one or more llama-server (or OpenAI-compatible) upstreams. It centralizes model discovery, API key injection, CORS handling, SQLite persistence, and static file serving.

---

## Overview

```
Frontend (browser)          Backend (:3000)              Upstreams
      │                        │                         │
      │  relative paths       │  ModelPool               │
      │  only               ├──┴── Heartbeat           │
      ▼                    │  Router ────────────────┼──► llama-server
 HTTP/JSON               │    │                    │      OpenAI API
      │                  │    ▼                    │      Others
      │          ┌────────┴────┐
      │          ▼           ▼
      │      Handlers     Database
      │      (routes)    (Drizzle + SQLite)
      │          │           │
      │          ▼           ▼
      │      API Routes    Tables:
      │      ────────    • conversations
      │      /v1/*      • messages
      │      /api/*     • skills
      │      /health    • presets
      │      /*        • skill_metadata
```

---

## Core Components

### `src/index.ts` — Server Entry

- Loads `config.toml` with Zod validation
- Initializes SQLite database via Drizzle
- Creates ModelPool, Heartbeat, Router
- Starts Bun.serve on configured port
- Handles config hot-reload (watcher)
- Graceful SIGINT/SIGTERM shutdown

### `src/config.ts` — Configuration

- Loads `config.toml` from project root
- Validates with Zod schema
- Resolves `$ENV_VAR` placeholders from `.env`
- Provides `resolved*` paths (database, staticDir, filesystemRoot)

### `src/router.ts` — Route Registry

- Pattern-based route matching (string or RegExp)
- Dispatches to handlers by method + pathname
- All handlers receive `(req, pool, config)`
- Returns JSON responses or static files

### `src/pool/model-pool.ts` — Model Pool

- Polls each upstream's `/v1/models`
- Merges into single list with `upstreamId` routing
- Maintains `model → upstream` map
- `getMergedModels()`, `findUpstreamForModel()`

### `src/pool/heartbeat.ts` — Health Check

- Runs on configurable interval (default: 30s)
- Refreshes model pool each tick
- Checks `/health` on each upstream
- Updates upstream status: `healthy` | `degraded` | `offline`

---

## Database

### Schema (`src/database/schema-drizzle.ts`)

```typescript
// conversations — message threads
conversations: {
  id: text('id').primaryKey(),
  title: text('title'),
  currentNode: text('current_node'),     // msg ID for branch navigation
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
  model: text('model'),            // model used in last message
  modelNickname: text('model_nickname'),
  presetId: text('preset_id'),    // FK to presets
}

// messages — tree structure (parent/children)
messages: {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references('id'),
  parentId: text('parent_id'),     // null for root message
  children: text('children'),    // JSON array of child IDs
  role: text('role'),           // 'user' | 'assistant' | 'system'
  content: text('content'),       // message text
  extras: text('extras'),       // JSON (attachments, tool_calls, etc.)
  thinking: text('thinking'),     // reasoning content
  model: text('model'),
  modelNickname: text('model_nickname'),
  createdAt: integer('created_at'),
  timings: text('timings'),      // JSON (prompt_eval, eval, etc.)
}

// skills — user-managed skill files
skills: {
  name: text('name').primaryKey(),
  content: text('content'),    // markdown content
  description: text('description'),
  enabled: integer('enabled'), // 0 or 1
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
}

// skill_metadata — skill enable states per conversation
skill_metadata: {
  conversationId: text('conversation_id').primaryKey(),
  skillName: text('skill_name').primaryKey(),
  enabled: integer('enabled'),
}

// presets — saved parameter configurations
presets: {
  id: text('id').primaryKey(),
  name: text('name'),
  parameters: text('parameters'), // JSON (temp, top_p, etc.)
  isDefault: integer('is_default'),
  createdAt: integer('created_at'),
}
```

### Queries (`src/database/queries/`)

- `conversations.ts` — CRUD + import/export + fork
- `messages.ts` — CRUD + cascading delete + tree navigation
- `presets.ts` — CRUD

---

## Handlers (`src/handlers/`)

| Handler | Routes | Description |
|---------|--------|------------|
| `chat.ts` | `POST /v1/chat/completions` | Streams to upstream, injects auth |
| `models.ts` | `GET /v1/models`, `GET /models` | Merges or proxies model list |
| `props.ts` | `GET /props` | Proxies server properties |
| `health.ts` | `GET /health` | Pool status summary |
| `conversations.ts` | `/api/conversations/*` | CRUD, import/export, fork |
| `messages.ts` | `/api/messages/*` | CRUD, cascading delete |
| `skills.ts` | `/api/skills/*` | CRUD skill files |
| `presets.ts` | `/api/presets/*` | CRUD parameter presets |
| `tools.ts` | `POST /api/tools/execute` | Shell command execution |
| `compact.ts` | `POST /compact` | Context condenser |
| `cors-proxy.ts` | `GET /cors-proxy` | Fetch-on-behalf-of |
| `static.ts` | `GET /*` | Static files + SPA fallback |

---

## API Routes

### Upstream Proxy

| Method | Path | Description |
|-------|------|-------------|
| `GET` | `/v1/models` | Merged model list |
| `POST` | `/v1/chat/completions` | Chat completions (streaming) |
| `GET` | `/props` | Server properties |
| `GET` | `/models` | Extended model list |
| `POST` | `/models/load` | Load model |
| `POST` | `/models/unload` | Unload model |
| `GET` | `/health` | Pool health |
| `GET` | `/cors-proxy?url=` | Proxy arbitrary GET |

### Conversations

| Method | Path | Description |
|-------|------|-------------|
| `GET` | `/api/conversations` | List all |
| `POST` | `/api/conversations` | Create |
| `GET` | `/api/conversations/:id` | Get by ID |
| `PUT` | `/api/conversations/:id` | Update |
| `DELETE` | `/api/conversations/:id` | Delete |
| `POST` | `/api/conversations/:id/fork` | Fork conversation |
| `GET` | `/api/conversations/:id/messages` | Get messages |
| `POST` | `/api/conversations/:id/messages` | Create message |
| `POST` | `/api/conversations/import` | Import JSON |
| `GET` | `/api/conversations/export` | Export JSON |

### Messages

| Method | Path | Description |
|-------|------|-------------|
| `GET` | `/api/messages/:id` | Get by ID |
| `PUT` | `/api/messages/:id` | Update |
| `DELETE` | `/api/messages/:id` | Delete |
| `POST` | `/api/messages/:id/delete-cascading` | Delete + children |

### Skills

| Method | Path | Description |
|-------|------|-------------|
| `GET` | `/api/skills` | List all |
| `POST` | `/api/skills` | Create |
| `GET` | `/api/skills/:name` | Get by name |
| `PUT` | `/api/skills/:name` | Update |
| `DELETE` | `/api/skills/:name` | Delete |

### Presets

| Method | Path | Description |
|-------|------|-------------|
| `GET` | `/api/presets` | List all |
| `POST` | `/api/presets` | Create |
| `GET` | `/api/presets/:id` | Get by ID |
| `PUT` | `/api/presets/:id` | Update |
| `DELETE` | `/api/presets/:id` | Delete |

### Tools

| Method | Path | Description |
|-------|------|-------------|
| `GET` | `/api/tools/allowed-commands` | List allowed commands |
| `POST` | `/api/tools/execute` | Execute command |

### Context

| Method | Path | Description |
|-------|------|-------------|
| `POST` | `/compact` | Condense context |

### Static

| Method | Path | Description |
|-------|------|-------------|
| `GET` | `/*` | Static files + SPA fallback |

---

## Utility Functions

| Module | Purpose |
|--------|----------|
| `utils/headers.ts` | Auth injection (`injectAuth`) |
| `utils/proxy.ts` | Upstream request proxy with streaming |
| `utils/cors.ts` | CORS header application |
| `utils/token-estimator.ts` | Token count estimation |
| `utils/branching.ts` | Message tree manipulation |
| `config-watcher.ts` | File watcher for hot-reload |

---

## Error Handling

All errors return JSON:

```json
{ "error": "message", "detail": "optional detail" }
```

| Error | HTTP Status | Cause |
|-------|------------|-------|
| Config missing | 500 | `config.toml` not found |
| Config invalid | 500 | Zod validation failed |
| Database error | 500 | SQLite failure |
| Upstream unreachable | 502/503 | Proxy failed |
| Not found | 404 | Route not matched |
| Method not allowed | 405 | Wrong HTTP method |

---

## Configuration

See `config.example.toml`:

```toml
port = 3000
staticDir = "../frontend/public"
heartbeatInterval = 30
logLevel = "info"
debug = false

[database]
path = "data/chat.db"

[filesystem]
root = "data/files"

[streaming]
enabled = true
bufferWords = 0

[[upstreams]]
id = "local"
label = "Local llama.cpp"
url = "http://localhost:8080"
type = "llamacpp"
apiKey = null
enabled = true

[cors]
allowedOrigins = ["*"]
allowCredentials = true
maxAge = 86400
```

---

## Running

```bash
# Development (hot reload)
bun run dev

# Production
bun run start

# Type check
bun run check
```