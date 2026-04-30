/**
 *
 * SERVICES
 *
 * Stateless service layer for API communication and data operations.
 * Services handle protocol-level concerns (HTTP, WebSocket, MCP, IndexedDB)
 * without managing reactive state — that responsibility belongs to stores.
 *
 * **Design Principles:**
 * - All methods are static — no instance state
 * - Pure I/O operations (network requests, database queries)
 * - No Svelte runes or reactive primitives
 * - Error handling at the protocol level; business-level error handling in stores
 *
 * **Architecture (bottom to top):**
 * - **Services** (this layer): Stateless protocol communication
 * - **Stores**: Reactive state management consuming services
 * - **Components**: UI consuming stores
 *
 */

/**
 * **ChatService** - Chat Completions API communication layer
 *
 * Handles direct communication with the llama-server's `/v1/chat/completions` endpoint.
 * Provides streaming and non-streaming response parsing, message format conversion
 * (DatabaseMessage → API format), and request lifecycle management.
 *
 * **Terminology - Chat vs Conversation:**
 * - **Chat**: The active interaction space with the Chat Completions API. Ephemeral and
 *   runtime-focused — sending messages, receiving streaming responses, managing request lifecycles.
 * - **Conversation**: The persistent database entity storing all messages and metadata.
 *   Managed by conversationsStore, conversations persist across sessions.
 *
 * **Architecture & Relationships:**
 * - **ChatService** (this class): Stateless API communication layer
 *   - Handles HTTP requests/responses with the llama-server
 *   - Manages streaming and non-streaming response parsing
 *   - Converts database messages to API format (multimodal, tool calls)
 *   - Handles error translation with user-friendly messages
 *
 * - **chatStore**: Primary consumer — uses ChatService for all AI model communication
 * - **agenticStore**: Uses ChatService for multi-turn agentic loop streaming
 * - **conversationsStore**: Provides message context for API requests
 *
 * **Key Responsibilities:**
 * - Streaming response handling with real-time content/reasoning/tool-call callbacks
 * - Non-streaming response parsing with complete response extraction
 * - Database message to API format conversion (attachments, tool calls, multimodal)
 * - Tool call delta merging for incremental streaming aggregation
 * - Request parameter assembly (sampling, penalties, custom params)
 * - File attachment processing (images, PDFs, audio, text, MCP prompts/resources)
 * - Reasoning content stripping from prompt history to avoid KV cache pollution
 * - Error translation (network, timeout, server errors → user-friendly messages)
 *
 * @see chatStore in stores/chat.svelte.ts — primary consumer for chat state management
 * @see agenticStore in stores/agentic.svelte.ts — uses ChatService for agentic loop streaming
 * @see conversationsStore in stores/conversations.svelte.ts — provides message context
 */
export { ChatService } from './chat/chat.service';

/**
 * **DatabaseService** - IndexedDB persistence layer via Dexie ORM
 *
 * Provides stateless data access for conversations and messages using IndexedDB.
 * Handles all low-level storage operations including branching tree structures,
 * cascade deletions, and transaction safety for multi-table operations.
 *
 * **Architecture & Relationships (bottom to top):**
 * - **DatabaseService** (this class): Stateless IndexedDB operations
 *   - Lowest layer — direct Dexie/IndexedDB communication
 *   - Pure CRUD operations without business logic
 *   - Handles branching tree structure (parent-child relationships)
 *   - Provides transaction safety for multi-table operations
 *
 * - **conversationsStore**: Reactive state management layer
 *   - Uses DatabaseService for all persistence operations
 *   - Manages conversation list, active conversation, and messages in memory
 *
 * - **chatStore**: Active AI interaction management
 *   - Uses conversationsStore for conversation context
 *   - Directly uses DatabaseService for message CRUD during streaming
 *
 * **Key Responsibilities:**
 * - Conversation CRUD (create, read, update, delete)
 * - Message CRUD with branching support (parent-child relationships)
 * - Root message and system prompt creation
 * - Cascade deletion of message branches (descendants)
 * - Transaction-safe multi-table operations
 * - Conversation import with duplicate detection
 *
 * **Database Schema:**
 * - `conversations`: id, lastModified, currNode, name
 * - `messages`: id, convId, type, role, timestamp, parent, children
 *
 * **Branching Model:**
 * Messages form a tree structure where each message can have multiple children,
 * enabling conversation branching and alternative response paths. The conversation's
 * `currNode` tracks the currently active branch endpoint.
 *
 * @see conversationsStore in stores/conversations.svelte.ts — reactive layer on top of DatabaseService
 * @see chatStore in stores/chat.svelte.ts — uses DatabaseService directly for message CRUD during streaming
 */
export { DatabaseService } from './database.service';

/**
 * **ModelsService** - Model management API communication
 *
 * Handles communication with model-related endpoints for both MODEL (single model)
 * and ROUTER (multi-model) server modes. Provides model listing, loading/unloading,
 * and status checking without managing any model state.
 *
 * **Architecture & Relationships:**
 * - **ModelsService** (this class): Stateless HTTP communication
 *   - Sends requests to model endpoints
 *   - Parses and returns typed API responses
 *   - Provides model status utility methods
 *
 * - **modelsStore**: Primary consumer — manages reactive model state
 *   - Calls ModelsService for all model API operations
 *   - Handles polling, caching, and state updates
 *
 * **Key Responsibilities:**
 * - List available models via OpenAI-compatible `/v1/models` endpoint
 * - Load/unload models via `/models/load` and `/models/unload` (ROUTER mode)
 * - Model status queries (loaded, loading)
 *
 * **Server Mode Behavior:**
 * - **MODEL mode**: Only `list()` is relevant — single model always loaded
 * - **ROUTER mode**: Full lifecycle — `list()`, `listRouter()`, `load()`, `unload()`
 *
 * **Endpoints:**
 * - `GET /v1/models` — OpenAI-compatible model list (both modes)
 * - `POST /models/load` — Load a model (ROUTER mode only)
 * - `POST /models/unload` — Unload a model (ROUTER mode only)
 *
 * @see modelsStore in stores/models.svelte.ts — primary consumer for reactive model state
 */
export { ModelsService } from './models.service';

/**
 * **PropsService** - Server properties and capabilities retrieval
 *
 * Fetches server configuration, model information, and capabilities from the `/props`
 * endpoint. Supports both global server props and per-model props (ROUTER mode).
 *
 * **Architecture & Relationships:**
 * - **PropsService** (this class): Stateless HTTP communication
 *   - Fetches server properties from `/props` endpoint
 *   - Handles authentication and request parameters
 *   - Returns typed `ApiLlamaCppServerProps` responses
 *
 * - **serverStore**: Consumes global server properties (role detection, connection state)
 * - **modelsStore**: Consumes per-model properties (modalities, context size)
 * - **settingsStore**: Syncs default generation parameters from props response
 *
 * **Key Responsibilities:**
 * - Fetch global server properties (default generation settings, modalities)
 * - Fetch per-model properties in ROUTER mode via `?model=<id>` parameter
 * - Handle autoload control to prevent unintended model loading
 *
 * **API Behavior:**
 * - `GET /props` → Global server props (MODEL mode: includes modalities)
 * - `GET /props?model=<id>` → Per-model props (ROUTER mode: model-specific modalities)
 * - `&autoload=false` → Prevents model auto-loading when querying props
 *
 * @see serverStore in stores/server.svelte.ts — consumes global server props
 * @see modelsStore in stores/models.svelte.ts — consumes per-model props for modalities
 * @see settingsStore in stores/settings.svelte.ts — syncs default generation params from props
 */
export { PropsService } from './props.service';

/**
 * **ParameterSyncService** - Server defaults and user settings synchronization
 *
 * Manages the complex logic of merging server-provided default parameters with
 * user-configured overrides. Ensures the UI reflects the actual server state
 * while preserving user customizations. Tracks parameter sources (server default
 * vs user override) for display in the settings UI.
 *
 * **Architecture & Relationships:**
 * - **ParameterSyncService** (this class): Stateless sync logic
 *   - Pure functions for parameter extraction, merging, and diffing
 *   - No side effects — receives data in, returns data out
 *   - Handles floating-point precision normalization
 *
 * - **settingsStore**: Primary consumer — calls sync methods during:
 *   - Initial load (`syncWithServerDefaults`)
 *   - Settings reset (`forceSyncWithServerDefaults`)
 *   - Parameter info queries (`getParameterInfo`)
 *
 * - **PropsService**: Provides raw server props that feed into extraction
 *
 * **Key Responsibilities:**
 * - Extract syncable parameters from server `/props` response
 * - Merge server defaults with user overrides (user wins)
 * - Track parameter source (Custom vs Default) for UI badges
 * - Validate server parameter values by type (number, string, boolean)
 * - Create diffs between current settings and server defaults
 * - Floating-point precision normalization for consistent comparisons
 *
 * **Parameter Source Priority:**
 * 1. **User Override** (Custom badge) — explicitly set by user in settings
 * 2. **Server Default** (Default badge) — from `/props` endpoint
 * 3. **App Default** — hardcoded fallback when server props unavailable
 *
 * **Exports:**
 * - `ParameterSyncService` class — static methods for sync logic
 * - `SYNCABLE_PARAMETERS` — mapping of webui setting keys to server parameter keys
 *
 * @see settingsStore in stores/settings.svelte.ts — primary consumer for settings sync
 * @see ChatSettingsParameterSourceIndicator — displays parameter source badges in UI
 */
export { ParameterSyncService } from './parameter-sync.service';

/**
 * **MCPService** - Low-level MCP protocol communication layer
 *
 * Implements the client-side MCP (Model Context Protocol) SDK operations for connecting
 * to MCP servers, discovering capabilities, and executing protocol operations.
 * Supports multiple transport types: WebSocket, StreamableHTTP, and SSE (legacy fallback).
 *
 * **Architecture & Relationships:**
 * - **MCPService** (this class): Stateless protocol communication
 *   - Creates and manages transport connections (WebSocket, StreamableHTTP, SSE)
 *   - Wraps MCP SDK client operations with error handling
 *   - Formats tool results and extracts server info
 *   - Provides abort signal support for cancellable operations
 *
 * - **mcpStore**: Reactive business logic facade
 *   - Uses MCPService for all protocol-level operations
 *   - Manages connection lifecycle, health checks, reconnection
 *   - Handles tool name conflict resolution and server coordination
 *
 * - **mcpResourceStore**: Reactive resource state
 *   - Receives resource data fetched via MCPService
 *   - Manages resource caching, subscriptions, and attachments
 *
 * - **agenticStore**: Agentic loop orchestration
 *   - Executes tool calls via mcpStore → MCPService chain
 *
 * **Key Responsibilities:**
 * - Transport creation with automatic fallback (StreamableHTTP → SSE)
 * - Server connection with detailed phase tracking and progress callbacks
 * - Tool discovery (`listTools`) and execution (`callTool`) with abort support
 * - Prompt listing (`listPrompts`) and retrieval (`getPrompt`) with arguments
 * - Resource operations: list, read, subscribe/unsubscribe, template support
 * - Completion suggestions for prompt arguments and resource URI templates
 * - CORS proxy routing via llama-server for cross-origin MCP servers
 * - Tool result formatting (text, images, embedded resources)
 *
 * **Transport Hierarchy:**
 * 1. **WebSocket** — bidirectional, no CORS proxy support
 * 2. **StreamableHTTP** — modern HTTP-based, supports CORS proxy
 * 3. **SSE** — legacy fallback, supports CORS proxy
 *
 * @see mcpStore in stores/mcp.svelte.ts — reactive business logic facade on top of MCPService
 * @see mcpResourceStore in stores/mcp-resources.svelte.ts — reactive resource state management
 * @see agenticStore in stores/agentic.svelte.ts — uses MCPService (via mcpStore) for tool execution
 * @see MCP Protocol Specification: https://modelcontextprotocol.io/specification/2025-06-18
 */
export { MCPService } from './mcp/mcp.service';

/**
 * **McpConfigService** - MCP server configuration building and parsing
 *
 * Stateless utilities for parsing server settings, building connection configs,
 * and managing MCP client configuration from user settings.
 *
 * @see mcpStore in stores/mcp.svelte.ts — uses McpConfigService for config building
 */
export { McpConfigService, McpIconService } from './mcp/mcp-config.service';

/**
 * **McpSchemaService** - JSON schema normalization for MCP tool definitions
 *
 * Normalizes JSON schema properties for tool input schemas, inferring types
 * from defaults and recursively processing nested structures.
 *
 * @see mcpStore in stores/mcp.svelte.ts — uses McpSchemaService for schema normalization
 */
export { McpSchemaService } from './mcp/mcp-schema.service';

/**
 * **McpReconnectService** - MCP server reconnection with exponential backoff
 *
 * Handles automatic reconnection to MCP servers when connections are lost,
 * with exponential backoff, timeout handling, and race-condition safety.
 *
 * @see mcpStore in stores/mcp.svelte.ts — uses McpReconnectService for reconnection logic
 */
export { McpReconnectService } from './mcp/mcp-reconnect.service';

/**
 * **ChatProcessingService** - Chat processing state and timing parsing
 *
 * Parses timing data from streaming responses into processing state objects
 * for display in the UI (tokens/sec, context usage, progress).
 *
 * @see chatStore in stores/chat.svelte.ts — uses ChatProcessingService for state parsing
 */
export { ChatProcessingService } from './chat/chat-processing.service';

/**
 * **AgenticBuiltinToolExecutor** - Built-in tool execution for agentic flows
 *
 * Executes built-in tools (calculator, time, location, subagent, skills, todos,
 * run_command) without requiring MCP server connections.
 *
 * @see agenticStore in stores/agentic.svelte.ts — uses AgenticBuiltinToolExecutor for tool execution
 */
export { AgenticBuiltinToolExecutor } from './agentic/agentic-builtin-tools.service';

/**
 * **AgenticToolRegistry** - Central validation, classification, and routing
 * authority for builtin tools during an agentic flow.
 *
 * Owns every decision about which tools are active, how they are dispatched,
 * and which tools the subagent is allowed to see.
 *
 * @see agenticStore in stores/agentic.svelte.ts — uses AgenticToolRegistry for tool routing
 */
export { AgenticToolRegistry } from './agentic/agentic-tool-registry.service';

/**
 * **AgenticToolUtils** - Tool call normalization and attachment extraction
 *
 * Normalizes tool calls from API responses, deduplicates identical calls,
 * and extracts base64 image attachments from tool results.
 *
 * @see agenticStore in stores/agentic.svelte.ts — uses AgenticToolUtils for tool processing
 */
export { AgenticToolUtils } from './agentic/agentic-tool-utils.service';

/**
 * **ChatApiOptionsService** - API options building from user config
 *
 * Builds API request options from user settings, filtering null values
 * and casting numeric parameters.
 *
 * @see chatStore in stores/chat.svelte.ts — uses ChatApiOptionsService for request options
 */
export { ChatApiOptionsService } from './chat/chat-api-options.service';

/**
 * **MessageUtilsService** - Message tree operations and deletion info
 *
 * Provides utilities for finding models in message history, locating
 * compaction summaries, and computing deletion impact (message counts by role).
 *
 * @see chatStore in stores/chat.svelte.ts — uses MessageUtilsService for message operations
 */
export { MessageUtilsService } from './message-utils.service';

/**
 * **McpCapabilitiesService** - MCP capabilities info building
 *
 * Transforms server and client capabilities into structured info objects
 * for display in the MCP connection UI.
 *
 * @see mcpStore in stores/mcp.svelte.ts — uses McpCapabilitiesService for capabilities display
 */
export { McpCapabilitiesService } from './mcp/mcp-capabilities.service';

/**
 * **McpToolParserService** - Tool argument parsing and repair
 *
 * Parses and repairs malformed JSON tool arguments from MCP tool calls.
 *
 * @see mcpStore in stores/mcp.svelte.ts — uses McpToolParserService for argument parsing
 */
export { McpToolParserService } from './mcp/mcp-tool-parser.service';

/**
 * **McpServerInfoService** - MCP server status and instructions aggregation
 *
 * Extracts server status, instructions, and health check information
 * from connection maps and health check state.
 *
 * @see mcpStore in stores/mcp.svelte.ts — uses McpServerInfoService for server info
 */
export { McpServerInfoService } from './mcp/mcp-server-info.service';

/**
 * **AgenticTimingService** - Agentic timing data merging
 *
 * Merges per-turn LLM timings with cumulative agentic timings
 * for accurate token statistics display.
 *
 * @see agenticStore in stores/agentic.svelte.ts — uses AgenticTimingService for final timings
 */
export { AgenticTimingService } from './agentic/agentic-timing.service';

/**
 * **AgenticAttachmentService** - Base64 attachment extraction from tool results
 *
 * Extracts and replaces base64 image data URIs in tool results with
 * attachment placeholders, building proper DatabaseMessageExtra entries.
 *
 * @see agenticStore in stores/agentic.svelte.ts — uses AgenticAttachmentService for attachment processing
 */
export { AgenticAttachmentService } from './agentic/agentic-attachment.service';
