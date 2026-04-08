## llamagic.cpp — Backend

A lightweight HTTP gateway that sits between the frontend and one or more llama-server (or OpenAI-compatible) upstreams. It centralizes model discovery, API key injection, CORS handling, and static file serving so the frontend never needs to know about upstream URLs or credentials.

### Why

- The original llama.cpp WebUI is embedded in the C++ server binary. This decouples it entirely.
- CORS: external upstreams (e.g. OpenAI) can't be called directly from the browser without a server-side proxy.
- API key security: keys live in `config.json` (or environment variables) and are injected server-side. The frontend never sees them.
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
cp packages/backend/config.example.json packages/backend/config.json
```

---

### Configuration

Config is loaded from `config.json` (adjacent to `src/`) at startup. There is no `.env` file — API keys that should come from the environment use a `$VAR_NAME` placeholder in `config.json`.

```json
{
  "port": 3000,
  "staticDir": "../frontend/public",
  "heartbeatInterval": 30,
  "upstreams": [
    {
      "id": "local-main",
      "label": "Local (main model)",
      "url": "http://localhost:8080",
      "type": "llamacpp",
      "apiKey": null
    },
    {
      "id": "openai-subagent",
      "label": "OpenAI (subagent)",
      "url": "https://api.openai.com",
      "type": "openai",
      "apiKey": "$OPENAI_KEY"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `port` | number | Port to listen on (default: `3000`) |
| `staticDir` | string | Path to built frontend assets, relative to `config.json` |
| `heartbeatInterval` | number | Seconds between upstream health checks (default: `30`) |
| `modelList` | array | Global whitelist of model IDs to include in `/v1/models` (empty = all models) |
| `streaming` | object | Streaming configuration |
| `streaming.enabled` | boolean | Enable/disable streaming mode (default: `true`) |
| `streaming.bufferWords` | number | Buffer words before streaming to frontend (default: `0`) |
| `upstreams` | array | One or more upstream servers |
| `upstreams[].id` | string | Unique identifier used in routing and logs |
| `upstreams[].label` | string | Human-readable name |
| `upstreams[].url` | string | Base URL of the upstream (no trailing slash) |
| `upstreams[].type` | `llamacpp` \| `openai` | Protocol variant |
| `upstreams[].apiKey` | string \| null | API key, or `$ENV_VAR` to read from environment |
| `upstreams[].enabled` | boolean | Enable/disable this upstream (default: `true`) |
| `upstreams[].modelList` | array | Per-upstream whitelist of model IDs (empty = all models from this upstream) |

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
