d# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

---

## Project Overview

`magic.cpp` is a Bun-workspace monorepo that provides a complete WebUI for llama-server:

- **Frontend** (`packages/frontend/`) — SvelteKit + Svelte 5 chat interface
- **Backend** (`packages/backend/`) — Bun HTTP gateway with SQLite persistence

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Browser        │────▶│  Backend :3000  │────▶│  llama-server   │
│  (WebUI)        │◀────│  (SQLite)       │◀────│  (upstreams)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Commands

### Workspace (from repo root)

```bash
bun install           # Install all dependencies
```

### Frontend (`packages/frontend/`)

```bash
# Development (Vite :5173 + Storybook :6006)
bun run dev

# Production build (single-file bundle to ./public)
bun run build

# Type checking
bun run check
bun run check:watch

# Linting/formatting
bun run lint
bun run format

# Testing
bun run test              # All suites
bun run test:unit         # Vitest unit tests
bun run test:client       # Vitest client tests
bun run test:ui           # Storybook visual tests
bun run test:e2e          # Playwright E2E
```

### Backend (`packages/backend/`)

```bash
# Development (hot reload)
bun run dev

# Production
bun run start

# Type check
bun run check
```

---

## Architecture

### Frontend — Layer Stack

```
Routes → Components → Stores → Services → HTTP API
```

| Layer | Location | Purpose |
|-------|----------|---------|
| Routes | `src/routes/` | `/`, `/chat/[id]`, `+layout.svelte` |
| Components | `src/lib/components/app/` | Chat UI, dialogs, MCP, models |
| Stores | `src/lib/stores/` | Reactive state (Svelte 5 runes) |
| Services | `src/lib/services/` | Stateless I/O |
| HTTP | — | Calls to backend (`/api/*`) |

### Backend — Layer Stack

```
Router → Handlers → (ModelPool | Database | Proxy)
```

| Layer | Location | Purpose |
|-------|----------|---------|
| Router | `src/router.ts` | Route dispatch |
| Handlers | `src/handlers/` | Request handling |
| ModelPool | `src/pool/model-pool.ts` | Multi-upstream routing |
| Database | `src/database/` | SQLite via Drizzle |

---

## Storage Strategy

| Data | Location | Persistence |
|------|----------|-------------|
| Conversations, messages | Backend | SQLite (Drizzle) |
| Skill files | Backend | SQLite + filesystem |
| Parameter presets | Backend | SQLite |
| Settings, theme | Frontend | LocalStorage |
| Server props, models | Frontend | Memory only (fresh per session) |

---

## Key Files

### Frontend

- `src/lib/stores/chat.svelte.ts` — Message sending, streaming, abort
- `src/lib/stores/agentic.svelte.ts` — Multi-turn tool execution
- `src/lib/stores/conversations.svelte.ts` — CRUD, branching, navigation
- `src/lib/stores/models.svelte.ts` — Model selection, load/unload
- `src/lib/stores/mcp.svelte.ts` — MCP server connections
- `src/lib/services/chat.service.ts` — `/v1/chat/completions` proxy

### Backend

- `src/index.ts` — Server entry, config loading
- `src/router.ts` — Route registry
- `src/pool/model-pool.ts` — Multi-upstream model merge
- `src/database/schema-drizzle.ts` — SQLite schema
- `src/handlers/chat.ts` — Chat completions proxy

---

## Documentation

| Doc | Location |
|-----|----------|
| Frontend README | `packages/frontend/README.md` |
| Frontend architecture | `packages/frontend/docs/architecture/` |
| Frontend flows | `packages/frontend/docs/flows/` |
| Backend README | `packages/backend/README.md` |
| Backend architecture | `packages/backend/docs/README.md` |

---

## Tech Stack

| Concern | Frontend | Backend |
|---------|----------|---------|
| Framework | SvelteKit + Svelte 5 | Bun.serve |
| Styling | TailwindCSS 4 | — |
| UI primitives | shadcn-svelte, bits-ui | — |
| Database | — | Drizzle + SQLite |
| Validation | Zod | Zod |
| Testing | Vitest, Playwright, Storybook | — |

---

## Environment

- **Bun** 1.2+ required for workspace
- **llama-server** expected on `:8080` (or configure upstreams in `config.toml`)
- **Backend** serves on `:3000` (configurable)
- **Frontend** proxies to backend during dev