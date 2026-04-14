# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`magic.cpp` is a Bun-workspace monorepo fork of the llama.cpp WebUI — a SvelteKit-based chat frontend for llama-server. Only `packages/frontend/` is implemented; `packages/backend/` is intentionally blank (planned for CORS resolution against external endpoints).

## Setup

Install [Bun](https://bun.sh) if not already available:

```bash
curl -fsSL https://bun.sh/install | bash
```

Install workspace dependencies from the repo root:

```bash
bun install
```

## Commands

All commands run from `packages/frontend/`.

```bash
# Development (starts Vite on :5173 + Storybook on :6006)
bun run dev

# Production build (outputs single-file bundle to ./public)
bun run build

# Type checking
bun run check
bun run check:watch

# Linting and formatting
bun run lint        # Prettier + ESLint check
bun run format      # Auto-format with Prettier

# Tests
bun run test               # All test suites
bun run test:unit          # Vitest unit tests (Node env)
bun run test:client        # Vitest client tests (browser via Playwright)
bun run test:ui            # Storybook visual tests
bun run test:e2e           # Playwright E2E (requires build + http-server on :8181)

# Single test
bunx vitest --project=unit tests/unit/path/to/test.spec.ts
bunx vitest --project=client tests/client/path/to/test.svelte.spec.ts
bunx playwright test tests/e2e/path/to/test.spec.ts

# Storybook
bun run storybook          # Dev server on :6006
bun run build-storybook

# Cleanup
bun run reset              # Remove .svelte-kit + node_modules
bun run cleanup            # Full cleanup including build outputs
```

E2E tests require a llama-server instance running on `:8080`. Development proxies `/v1`, `/props`, `/models`, `/cors-proxy` to `http://localhost:8080`.

## Documentation

Project docs live in `docs/`:

- `docs/frontend/architecture/` — high-level architecture diagrams
- `docs/frontend/flows/` — per-feature data flow diagrams (chat, conversations, models, MCP, settings, etc.)
- `docs/frontend/expanded_features/` — detailed write-ups for implemented features (Personalization, Filter, context condenser, subagent, display improvements)
- `docs/frontend/plans/` — implementation plans for upcoming work
- `docs/frontend/bundle-visualizer/` — build bundle analysis
- `docs/backend/` — blank; backend not yet started

Read the relevant flow or feature doc before working on a feature area.

## Architecture

### Layer Stack

```
Routes → Components → Stores → Services → IndexedDB / llama-server API
```

### Routes (`src/routes/`)

- `/` — Welcome/new conversation screen
- `/chat/[id]` — Active chat interface
- `+layout.svelte` — Global layout, sidebar, app initialization

### Stores (`src/lib/stores/`) — Svelte 5 Runes-based reactive state

The stores are the core business logic layer:

- **`chat.svelte.ts`** — Message sending, SSE streaming, abort control, per-conversation state maps (`chatLoadingStates`, `chatStreamingStates`, `abortControllers`)
- **`conversations.svelte.ts`** — Conversation CRUD, message branching tree, navigation
- **`modelsStore`** — Model list, selection, load/unload (ROUTER mode only)
- **`serverStore`** — Server props, mode detection (`isRouterMode()`)
- **`settingsStore`** — User preferences, parameter defaults (persisted to LocalStorage)
- Other stores: `memoryStore`, `mcpStore`, `apiConfigStore`, `agenticStore`, `condenserStore`, `subagentConfigStore`

### Services (`src/lib/services/`) — Stateless I/O

- **`chat.service.ts`** — POST `/v1/chat/completions` with SSE streaming
- **`models.service.ts`** — `/models`, `/models/load`, `/models/unload`
- **`props.service.ts`** — `/props` server configuration
- **`database.service.ts`** — IndexedDB via Dexie (conversations, messages, MCP resources)
- Other services: `MemoryService`, `SubagentService`, `McpService`, `ParameterSyncService`

### Components (`src/lib/components/app/`)

- `chat/ChatScreen/` — Main coordinator component
- `chat/ChatForm/` — Input, file upload, keyboard shortcuts
- `chat/ChatMessages/` — Message list with branching navigation
- `chat/ChatAttachments/` — Drag-and-drop file handling
- `chat/ChatSettings/` — Parameter panel (temperature, top-p, etc.)
- `chat/ChatSidebar/` — Conversation list, search, import/export
- `dialogs/` — Modal dialogs for settings, previews, confirmations

UI primitives live in `src/lib/components/ui/` (shadcn-svelte + bits-ui).

### Key Architectural Patterns

**Two server modes** detected automatically from `/props`:
- **MODEL mode** — single model, standard chat
- **ROUTER mode** — multi-model with dynamic load/unload; components gate on `isRouterMode()`

**Message branching** — messages form a tree (not a linear list). Each message has `parent`/`children` refs; `currentNode` tracks the active path without losing alternate branches.

**Per-conversation state** — streaming, loading, and abort state are keyed by conversation ID to support concurrent multi-tab usage.

**Storage strategy**:
- IndexedDB (Dexie) — conversations, messages, MCP resources
- LocalStorage — settings, theme, user overrides
- Memory only — server props, model list (fetched fresh per session)

**Svelte 5 runes** — use `$state`, `$derived`, `$effect` throughout. No legacy Svelte 4 store syntax in new code.

### Build Output

`bun run build` produces a self-contained single-file bundle (`bundle.js` + `bundle.css` + `index.html`) in `./public` via a custom Vite plugin (`llamaCppBuildPlugin`) that inlines the favicon, applies GZIP compression, and zeroes timestamps for deterministic output. The `_app/` directory is removed in post-build.

## Tech Stack Summary

| Concern | Technology |
|---|---|
| Framework | SvelteKit + Svelte 5 |
| Styling | TailwindCSS 4 |
| UI primitives | shadcn-svelte, bits-ui |
| Client storage | Dexie (IndexedDB) |
| Markdown/Math | remark, rehype, KaTeX, Mermaid, highlight.js |
| Validation | Zod |
| Unit/component tests | Vitest |
| E2E tests | Playwright |
| Visual tests | Storybook |