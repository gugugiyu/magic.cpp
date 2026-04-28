/**
 * mock-completions-server.ts
 *
 * A self-contained Bun HTTP server that mimics the OpenAI Chat Completions
 * streaming API for a fixed agentic conversation script.
 *
 * Each POST to /v1/chat/completions streams the pre-baked SSE chunks
 * with a 20 ms inter-chunk delay.
 *
 * Usage:
 *   bun run mock-completions-server.ts
 *   bun run mock-completions-server.ts --error 429   # simulate error
 *   bun run mock-completions-server.ts --error 500
 *
 * Endpoints:
 *   POST /v1/chat/completions   — main completions endpoint (stream: true assumed)
 *   GET  /v1/models         — stub model list
 */

// Add this to the config.toml to route traffic to it
// [[upstreams]]
// id        = "mock"
// label     = "mock"
// url       = "http://localhost:3030"
// type      = "openai"
// apiKey    = "mock-api-key"
// enabled   = true
// MAKE SURE UI HAS BOTH GET TIME TOOL AND RUN COMMAND TOOL ENABLED

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let errorCode: number | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--error" && args[i + 1]) {
    const code = parseInt(args[i + 1], 10);
    if ([413, 429, 500, 502, 503, 504].includes(code)) {
      errorCode = code;
    }
    i++;
  }
}

const VALID_ERROR_CODES = [413, 429, 500, 502, 503, 504];
const API_KEY = "mock-api-key";


// ---------------------------------------------------------------------------
// Types (minimal subset of OpenAI streaming schema)
// ---------------------------------------------------------------------------

type Role = "system" | "user" | "assistant" | "tool";

interface ToolCallFunction {
  name?: string;
  arguments?: string;
}

interface ToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: ToolCallFunction;
}

interface Delta {
  role?: Role;
  content?: string | null;
  tool_calls?: ToolCallDelta[];
}

interface Choice {
  index: number;
  delta: Delta;
  finish_reason: string | null;
  logprobs: null;
}

interface ChunkPayload {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Choice[];
}

// A "script frame" is either a sequence of content string chunks, or a
// tool-call turn described declaratively — the emitter handles serialisation.
type ContentTurn = {
  kind: "content";
  chunks: string[];
};

type ToolCallTurn = {
  kind: "tool_call";
  calls: {
    id: string;          // tool_call_id, e.g. "call_abc123"
    name: string;        // function name
    args: object;        // will be JSON-serialised and streamed argument-by-argument
  }[];
};

type ScriptTurn = ContentTurn | ToolCallTurn;

// ---------------------------------------------------------------------------
// Tool definitions (verbatim from the spec)
// ---------------------------------------------------------------------------

const TOOL_RUN_COMMAND = {
  type: "function",
  function: {
    name: "run_command",
    description:
      "Run a shell command inside the sandboxed filesystem. You MUST provide a rationale explaining why this command is necessary in gerund form (e.g. checking git history, rerunning project's test script, etc). Avoid shell mode (inShell) UNLESS absolutely required — it is more dangerous and may be disabled by the server.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: 'The command to run, e.g. "ls -la" or "git status".',
        },
        rationale: {
          type: "string",
          description:
            "Explain why you need to run this command (visible to user), gerund narrative phrasing.",
        },
        inShell: {
          type: "boolean",
          description:
            "Set to true to run through a shell (allows pipes, redirections). Only use if absolutely necessary.",
        },
      },
      required: ["command", "rationale"],
    },
  },
};

const TOOL_GET_TIME = {
  type: "function",
  function: {
    name: "get_time",
    description:
      "Return the current date and time as an ISO 8601 string in the specified timezone (or local timezone if not specified).",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description:
            'IANA timezone string (e.g. "America/New_York", "Europe/London", "Asia/Bangkok"). Defaults to "UTC" if not set.',
        },
      },
      required: [],
    },
  },
};

// ---------------------------------------------------------------------------
// Scripted conversation — 5 assistant turns matching the spec
// ---------------------------------------------------------------------------
//
//  Turn 0  user: "What are the tools you have?"
//          → assistant lists tools (content)
//
//  Turn 1  user: "Get me current time"
//          → assistant calls get_time() (single tool call)
//
//  Turn 2  tool result delivered by frontend
//          → assistant narrates result (content)
//
//  Turn 3  user: "Get current time in multiple timezones"
//          → assistant calls get_time() twice in parallel (UTC + Bangkok)
//
//  Turn 4  tool result delivered by frontend
//          → assistant narrates both times (content)
//
//  Turn 5  user: "Run `uname`"
//          → assistant calls run_command() (tool_call)
//
//  Turn 6  tool result delivered by frontend
//          → assistant narrates "Linux" (content)
//
// The script is an ordered array; each request cycles through the next turn.

const SCRIPT: ScriptTurn[] = [
  // Turn 0 — list tools
  {
    kind: "content",
    chunks: [
      "I have access to the following tools:\n\n",
      "1. **`get_time(timezone?)`** — returns the current date and time as an ISO 8601 ",
      "string in the requested IANA timezone (defaults to UTC).\n\n",
      "2. **`run_command(command, rationale, inShell?)`** — executes a shell command ",
      "inside a sandboxed filesystem. A `rationale` is required so you always know ",
      "why I'm running something.",
    ],
  },

  // Turn 1 — tool call: get_time (single)
  {
    kind: "tool_call",
    calls: [
      {
        id: "call_get_time_001",
        name: "get_time",
        args: { timezone: "UTC" },
      },
    ],
  },

  // Turn 2 — narrate get_time result
  {
    kind: "content",
    chunks: [
      "The current time is **",
      new Date().toISOString(),
      "** (UTC).",
    ],
  },

  // Turn 3 — parallel tool calls: get_time for UTC and Bangkok
  {
    kind: "tool_call",
    calls: [
      {
        id: "call_get_time_002",
        name: "get_time",
        args: { timezone: "UTC" },
      },
      {
        id: "call_get_time_003",
        name: "get_time",
        args: { timezone: "Asia/Bangkok" },
      },
    ],
  },

  // Turn 4 — narrate parallel get_time results
  {
    kind: "content",
    chunks: [
      "Current times:\n",
      "- **UTC**: ",
      new Date().toISOString(),
      "\n- **Asia/Bangkok**: ",
      new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
    ],
  },

  // Turn 5 — tool call: run_command
  {
    kind: "tool_call",
    calls: [
      {
        id: "call_run_command_001",
        name: "run_command",
        args: {
          command: "uname",
          rationale: "identifying the operating system kernel name",
        },
      },
    ],
  },

  // Turn 6 — narrate run_command result
  {
    kind: "content",
    chunks: ["The output of `uname` is **Linux**."],
  },
];

// ---------------------------------------------------------------------------
// Turn state (stateless)
// ---------------------------------------------------------------------------

let globalTurn = 0;

function advanceTurn(): number {
  const current = globalTurn;
  globalTurn = (globalTurn + 1) % SCRIPT.length;
  return current;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

const MOCK_MODEL = "gpt-4o-mock";
const CHUNK_DELAY_MS = 20;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serialise a payload object into an SSE data line. */
function sseData(payload: ChunkPayload): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Build a skeleton chunk with a stable id/created pair for the response. */
function makeChunk(
  completionId: string,
  created: number,
  delta: Delta,
  finishReason: string | null = null
): ChunkPayload {
  return {
    id: completionId,
    object: "chat.completion.chunk",
    created,
    model: MOCK_MODEL,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
        logprobs: null,
      },
    ],
  };
}

/**
 * Async generator that yields SSE-formatted strings for a given ScriptTurn.
 *
 * Content turns:  role delta → N content deltas → finish_reason=stop
 * Tool-call turns: role delta → tool_call header delta → argument chunk deltas
 *                 → finish_reason=tool_calls
 *
 * This mirrors exactly what the real OpenAI API streams, making it a drop-in
 * for any client that speaks the streaming chat completions protocol.
 */
async function* streamTurn(
  turn: ScriptTurn,
  completionId: string,
  created: number
): AsyncGenerator<string> {
  if (turn.kind === "content") {
    // ── 1. Role delta (OpenAI always opens with this) ──────────────────────
    yield sseData(makeChunk(completionId, created, { role: "assistant" }));
    await delay(CHUNK_DELAY_MS);

    // ── 2. Content deltas ───────────────────────────────────────────────────
    for (const chunk of turn.chunks) {
      yield sseData(makeChunk(completionId, created, { content: chunk }));
      await delay(CHUNK_DELAY_MS);
    }

    // ── 3. Finish ───────────────────────────────────────────────────────────
    yield sseData(
      makeChunk(completionId, created, {}, "stop")
    );
    await delay(CHUNK_DELAY_MS);
  } else {
    const calls = turn.calls;

    // ── 1. Role delta ───────────────────────────────────────────────────────
    yield sseData(makeChunk(completionId, created, { role: "assistant" }));
    await delay(CHUNK_DELAY_MS);

    // ── 2. Tool-call header deltas (parallel: emit all headers first) ────────────
    //
    // OpenAI streams tool_calls as an array of deltas with `index` as the
    // "channel" identifier — think of it as an array slot address. The first
    // chunk for a slot carries `id`, `type`, and `function.name`; subsequent
    // chunks carry only `function.arguments` fragments.
    yield sseData(
      makeChunk(completionId, created, {
        tool_calls: calls.map((c, idx) => ({
          index: idx,
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: "" },
        })),
      })
    );
    await delay(CHUNK_DELAY_MS);

    // ── 3. Argument chunks (stream JSON char-by-char-ish in 4-char tokens) ─
    //
    // Real OpenAI streams arguments in small arbitrary string fragments.
    // We simulate that by splitting the JSON into fixed-width slices, which
    // gives clients a realistic chunked-JSON parsing exercise.
    const TOKEN_SIZE = 4;
    for (const call of calls) {
      const argsJson = JSON.stringify(call.args);
      for (let i = 0; i < argsJson.length; i += TOKEN_SIZE) {
        const slice = argsJson.slice(i, i + TOKEN_SIZE);
        yield sseData(
          makeChunk(completionId, created, {
            tool_calls: [{ index: calls.indexOf(call), function: { arguments: slice } }],
          })
        );
        await delay(CHUNK_DELAY_MS);
      }
    }

    // ── 4. Finish ───────────────────────────────────────────────────────────
    yield sseData(makeChunk(completionId, created, {}, "tool_calls"));
    await delay(CHUNK_DELAY_MS);
  }

  // ── Terminal SSE sentinel ─────────────────────────────────────────────────
  yield "data: [DONE]\n\n";
}

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

interface CompletionRequest {
  model?: string;
  messages?: unknown[];
  stream?: boolean;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const PORT = 3030;

Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    // ── POST /v1/chat/completions ───────────────────────────────────────────
    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      // Validate API key
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.slice(7) !== API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: "Invalid or missing API key", type: "authentication_error" } }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      // Simulate error if configured
      if (errorCode) {
        const errorMessages: Record<number, string> = {
          413: "Request too large",
          429: "Rate limit exceeded",
          500: "Internal server error",
          502: "Bad gateway",
          503: "Service unavailable",
          504: "Gateway timeout",
        };
        return new Response(
          JSON.stringify({ error: { message: errorMessages[errorCode], type: "server_error", code: String(errorCode) } }),
          { status: errorCode, headers: { "Content-Type": "application/json" } }
        );
      }

      let body: CompletionRequest = {};
      try {
        body = (await req.json()) as CompletionRequest;
      } catch {
        return new Response(
          JSON.stringify({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const turnIndex = advanceTurn();
      const scriptTurn = SCRIPT[turnIndex];

      const completionId = `chatcmpl-mock-t${turnIndex}`;
      const created = Math.floor(Date.now() / 1000);

      console.log(
        `[${new Date().toISOString()}] turn=${turnIndex} kind=${scriptTurn.kind}`
      );

      // Build a ReadableStream that pulls from our async generator.
      // This is analogous to a pipe() between an async producer and an HTTP
      // response socket — Bun's fetch handler accepts a ReadableStream body
      // directly, so no manual buffering is needed.
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const chunk of streamTurn(scriptTurn, completionId, created)) {
              controller.enqueue(encoder.encode(chunk));
            }
          } finally {
            controller.close();
          }
        },
      });

return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Turn-Index": String(turnIndex),
        },
      });
    }

    // ── GET /v1/models — satisfy any client that preflight-checks models ───
    if (req.method === "GET" && url.pathname === "/v1/models") {
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: MOCK_MODEL, object: "model", owned_by: "mock" }],
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ── GET /health — health check endpoint ────────────────────────────
    if (req.method === "GET" && url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          uptime: process.uptime(),
          script_turns: SCRIPT.length,
          current_turn: globalTurn,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Mock completions server running on http://localhost:${PORT}`);
console.log(`Script has ${SCRIPT.length} turns (cycles on exhaustion)`);
if (errorCode) {
  console.log(`⚠️  Simulating error code: ${errorCode}`);
}
console.log();
console.log("Endpoints:");
console.log("  POST   /v1/chat/completions   (requires Authorization: Bearer <apiKey>)");
console.log("  GET    /v1/models             stub model list");
console.log("  GET    /health               health check");
console.log();
console.log("CLI options:");
console.log("  --error CODE   simulate error (supported: 413, 429, 500, 502, 503, 504)");
console.log(`API key: ${API_KEY}`);