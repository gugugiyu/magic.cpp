## magic.cpp — Backend

A lightweight HTTP gateway that sits between the frontend and one or more llama-server (or OpenAI-compatible) upstreams. It centralizes model discovery, API key injection, CORS handling, and static file serving so the frontend never needs to know about upstream URLs or credentials.

### Why

- The original llama.cpp WebUI is embedded in the C++ server binary. This decouples it entirely.
- CORS: external upstreams (e.g. OpenAI) can't be called directly from the browser without a server-side proxy.
- API key security: keys live in `config.toml` (or environment variables) and are injected server-side. The frontend never sees them.
- Model pool centralization: multiple upstreams are merged into a single model list for the frontend.

---

### Tech Stack

| Concern | Technology |
|---|---|
| Runtime | Bun |
| HTTP server | `Bun.serve` (native) |
| Config validation | Zod |
| Language | TypeScript (ESM) |

---

### Setup

Install [Bun](https://bun.sh) if not already available:

```bash
curl -fsSL https://bun.sh/install | bash
```

Install dependencies from the repo root:

```bash
bun install
```

Copy and edit the example config:

```bash
cp packages/backend/config.example.toml packages/backend/config.toml
```

If any upstream uses `$ENV_VAR` placeholders for API keys, copy the `.env.example` file and fill in the actual values:

```bash
cp packages/backend/.env.example packages/backend/.env
# Edit .env and set your actual API keys
```

---

### Configuration

Config is loaded from `config.toml` (adjacent to `src/`) at startup. Environment variables for API keys are loaded from `.env` (adjacent to `src/`). Placeholders like `$OPENAI_KEY` in `config.toml` are resolved against the environment — if the variable is not set, the upstream will have no API key and requests to it will likely fail with an auth error.

**Hot Reload**: The server watches `config.toml` for changes and automatically reloads most settings without requiring a restart. Changes to `port`, `staticDir`, or `database.path` require a full server restart and will be logged as warnings.

```toml
port = 3000
staticDir = "../frontend/public"
heartbeatInterval = 30

[database]
path = "data/chat.db"

[streaming]
enabled = true
bufferWords = 0

[[upstreams]]
id = "local-main"
label = "Local (main model)"
url = "http://localhost:8080"
type = "llamacpp"
apiKey = null
enabled = true

[[upstreams]]
id = "openai-subagent"
label = "OpenAI (subagent)"
url = "https://api.openai.com"
type = "openai"
apiKey = "$OPENAI_KEY"
enabled = true
modelList = ["gpt-4o"]
```

| Field | Type | Default | Description |
|---|---|---|---|
| `port` | number | `3000` | Port to listen on |
| `staticDir` | string | `../frontend/public` | Path to built frontend assets, relative to `config.toml` |
| `heartbeatInterval` | number | `30` | Seconds between upstream health checks |
| `database` | object | — | SQLite database configuration |
| `database.path` | string | `data/chat.db` | Path to the SQLite database file, relative to `config.toml` |
| `streaming` | object | — | Streaming configuration |
| `streaming.enabled` | boolean | `true` | Enable/disable streaming mode |
| `streaming.bufferWords` | number | `0` | Buffer words before streaming to frontend |
| `upstreams` | array | — | One or more upstream servers (required, min 1) |
| `upstreams[].id` | string | — | Unique identifier used in routing and logs |
| `upstreams[].label` | string | — | Human-readable name |
| `upstreams[].url` | string | — | Base URL of the upstream (no trailing `/v1`) |
| `upstreams[].type` | `llamacpp` \| `openai` | — | Protocol variant |
| `upstreams[].apiKey` | string \| null | `null` | API key, or `$ENV_VAR` to read from environment |
| `upstreams[].enabled` | boolean | `true` | Enable/disable this upstream |
| `upstreams[].modelList` | array | `[]` | Per-upstream whitelist of model IDs (empty = all models) |

---

#### Hot-Reloadable Settings

The following settings are automatically reloaded when `config.toml` changes:

| Field | Description |
|---|---|
| `upstreams` | Add/remove/disable upstreams, change URLs, API keys |
| `modelList` | Global model whitelist |
| `streaming.enabled` | Enable/disable streaming mode |
| `streaming.bufferWords` | Buffer size before streaming |
| `cors.allowedOrigins` | CORS origin whitelist |
| `cors.allowCredentials` | CORS credentials flag |
| `cors.maxAge` | CORS preflight max-age |
| `heartbeatInterval` | Seconds between health checks |

#### Settings Requiring Restart

These changes are logged as warnings but **require** server restart to take effect:

| Field | Description |
|---|---|
| `port` | HTTP server bind port |
| `staticDir` | Frontend static files directory |
| `database.path` | SQLite database file location |


---

### Running

```bash
# Development (restarts on file changes)
bun run dev

# Production
bun run start

# Type checking
bun run check
```

Run from `packages/backend/` or use the workspace scripts from the repo root.

---

### Error Handling

Startup errors display a formatted error message with actionable guidance instead of crashing silently:

| Error | Behavior |
|---|---|
| Missing `config.toml` | Prints config path and shows `cp config.example.toml config.toml` command |
| Invalid `config.toml` | Shows which Zod validation field failed |
| Missing `.env` variables | Warns at startup — upstream will have no API key |
| Database directory missing | Shows database path and `mkdir -p` command to create it |
| Upstream unreachable | Returns 502/503 with JSON error body, frontend shows graceful error |

All API routes return JSON error responses with `error` and optional `detail` fields. API requests from the frontend have a 30-second timeout to prevent indefinite hangs.

---

### API Routes

All routes accept and return JSON unless otherwise noted. CORS preflight (`OPTIONS`) is handled globally.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Pool health summary — lists each upstream and its status |
| `GET` | `/v1/models` | Merged OpenAI-compatible model list across all upstreams |
| `POST` | `/v1/chat/completions` | Proxied chat completions — routes to the correct upstream by `model` field, injects auth |
| `GET` | `/props` | Server properties from the upstream that owns `?model=` (or first upstream) |
| `GET` | `/models` | Extended model list (llamacpp router format) |
| `POST` | `/models/load` | Load a model on its upstream |
| `POST` | `/models/unload` | Unload a model on its upstream |
| `GET` | `/cors-proxy` | Proxies an arbitrary URL supplied as `?url=` — used for MCP resource fetching |
| `GET` | `/api/conversations` | List all conversations |
| `POST` | `/api/conversations` | Create a new conversation |
| `GET` | `/api/conversations/:id` | Get a conversation by ID |
| `PUT` | `/api/conversations/:id` | Update a conversation |
| `DELETE` | `/api/conversations/:id` | Delete a conversation (cascades to messages) |
| `POST` | `/api/conversations/:id/fork` | Fork a conversation |
| `GET` | `/api/conversations/:id/messages` | Get messages for a conversation |
| `POST` | `/api/conversations/:id/messages` | Create a message |
| `GET` | `/api/messages/:id` | Get a message by ID |
| `PUT` | `/api/messages/:id` | Update a message |
| `DELETE` | `/api/messages/:id` | Delete a message |
| `POST` | `/api/messages/:id/delete-cascading` | Delete a message and all its children |
| `DELETE` | `/api/messages/:id` | Delete a message |
| `POST` | `/api/messages/:id/delete-cascading` | Delete a message and all its children |
| `POST` | `/api/conversations/import` | Import conversations from JSON |
| `GET` | `/api/conversations/export` | Export all conversations as JSON |
| `POST` | `/api/conversations/:id/fork` | Fork a conversation |
| `GET` | `/api/skills` | List all skills |
| `POST` | `/api/skills` | Create a skill |
| `GET` | `/api/skills/:name` | Get a skill by name |
| `PUT` | `/api/skills/:name` | Update a skill |
| `DELETE` | `/api/skills/:name` | Delete a skill |
| `GET` | `/api/presets` | List all presets |
| `POST` | `/api/presets` | Create a preset |
| `GET` | `/api/presets/:id` | Get a preset by ID |
| `PUT` | `/api/presets/:id` | Update a preset |
| `DELETE` | `/api/presets/:id` | Delete a preset |
| `GET` | `/api/tools/allowed-commands` | List allowed shell commands |
| `POST` | `/api/tools/execute` | Execute a shell command |
| `POST` | `/compact` | Context condenser (condense conversation context) |
| `GET` | `/*` | Static file serving with SPA fallback to `index.html` |

---

### Architecture

```
Frontend (browser)
      │  relative paths only
      ▼
Backend (:3000)
  ├── ModelPool  ─── discovers + caches models from all upstreams
  ├── Heartbeat  ─── periodic health + model refresh (every N seconds)
  └── Router     ─── dispatches requests to handlers
        ├── /v1/chat/completions  →  resolves upstream by model ID, streams response
        ├── /v1/models            →  returns merged pool
        ├── /props                →  proxies to correct upstream
        ├── /models/*             →  proxies to correct upstream
        ├── /cors-proxy           →  fetch-on-behalf-of
        ├── /health               →  pool status
        └── /*                   →  static files + SPA fallback

Upstream A (llamacpp :8080)
Upstream B (openai api.openai.com)
...
```

#### Model Pool

`ModelPool` (`src/pool/model-pool.ts`) polls each upstream's `/v1/models` endpoint, merges the results into a single list, and maintains a routing map of `model ID → upstream ID`. When a request arrives with a `model` field, the router resolves the correct upstream via this map.

#### Heartbeat

`Heartbeat` (`src/pool/heartbeat.ts`) runs on a configurable interval. Each tick refreshes the model pool and checks `/health` on each upstream, marking them `healthy` or `degraded`.

#### Auth injection

API keys are never sent to the frontend. The `injectAuth` utility (`src/utils/headers.ts`) adds the `Authorization: Bearer <key>` header on outbound upstream requests only.
