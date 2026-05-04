import type { ModelPool } from '../pool/model-pool.ts';
import { getTokenCount } from '../utils/token-count.ts';
import { buildCompactSystemMessage } from '#shared/constants/prompts-and-tools.ts';
import { createLogger } from '../utils/logger.ts';
import { fetchWithTimeout, isAbortError } from '#shared/utils/abort';

const log = createLogger('compact');

interface CompactRequest {
  messages: Array<{
    role: string;
    content: string;
    [key: string]: unknown;
  }>;
  model?: string;
  previousSummary?: string;
}

interface CompactResponse {
  summary: string;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
}

/**
 * POST /compact — Summarize conversation history.
 *
 * Compacts all messages by:
 * 1. Building a summarization prompt from all messages
 * 2. Calling upstream LLM to generate summary
 * 3. Returning summary with token statistics
 */
export async function handleCompact(req: Request, pool: ModelPool): Promise<Response> {
  try {
    const body = await req.json() as CompactRequest;
    const { messages, model, previousSummary } = body;

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: 'Invalid request: messages must be an array' },
        { status: 400 }
      );
    }

    if (messages.length === 0) {
      return Response.json(
        { error: 'No messages to compact' },
        { status: 400 }
      );
    }

    // Build the compacted content with role prefixes
    const compactedContent = messages
      .map(msg => `[${msg.role.toUpperCase()}]: ${msg.content}`)
      .join('\n\n');

    // Resolve upstream model (needed for both summarization and token counting)
    let upstream;
    const allUpstreams = pool.getAllUpstreams();

    if (!model) {
      const fallback = allUpstreams.find(u => u.enabled);
      if (!fallback) {
        return Response.json(
          { error: 'No upstream models available' },
          { status: 503 }
        );
      }
      upstream = fallback;
    } else {
      upstream = pool.resolveUpstream(model);
      if (!upstream) {
        return Response.json(
          { error: `Model '${model}' not found` },
          { status: 404 }
        );
      }
    }

    if (!upstream.enabled) {
      return Response.json(
        { error: `Upstream '${upstream.id}' is disabled` },
        { status: 503 }
      );
    }

    if (!upstream.resolvedApiKey) {
      return Response.json(
        { error: `Upstream '${upstream.id}' missing API key` },
        { status: 503 }
      );
    }

    // Calculate tokens before compaction — try upstream /tokenize, fall back to
    // heuristic estimation on the actual formatted content that will be sent to
    // the LLM (includes [ROLE]: prefixes and separators).
    const tokensBefore = await getTokenCount(compactedContent, pool, model || upstream.id);

    // Build summarization prompt
    const systemMessage = buildCompactSystemMessage(previousSummary);

    const userMessage = {
      role: 'user',
      content: `Please summarize the following conversation history:\n\n${compactedContent}`
    };

    // Call LLM for summarization
    const upstreamUrl = `${upstream.url}/v1/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (upstream.resolvedApiKey) {
      headers['Authorization'] = `Bearer ${upstream.resolvedApiKey}`;
    }

    // Use a reasonable max_tokens that fits a concise summary without truncation.
    // 800 tokens ≈ ~600 words, which is ample for a compact summary and avoids
    // the waste of generating 1000+ words only to truncate afterward.
    const MAX_SUMMARY_TOKENS = 2000;

    const requestBody = {
      model: model || upstream.modelList[0] || '',
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      // max_tokens: MAX_SUMMARY_TOKENS,
      stream: false,
    };

    log.debug('requesting summarization from:', upstream.id);

    let response: Response;
    try {
      response = await fetchWithTimeout(
        upstreamUrl,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        },
        60_000
      );
    } catch (fetchError) {
      const status = isAbortError(fetchError) ? 504 : 502;
      return Response.json(
        { error: `Summarization request failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}` },
        { status }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      log.error('upstream error:', errorText);
      return Response.json(
        { error: `Summarization failed: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    log.debug('upstream response message:', data.choices?.[0]?.message);
    let summary = data.choices?.[0]?.message?.content || '';

    if (!summary) {
      return Response.json(
        { error: 'No summary generated' },
        { status: 500 }
      );
    }

    summary = summary.trim();

    // Calculate tokens after compaction — only the summary itself.
    // Try upstream /tokenize first, fall back to heuristic.
    const tokensAfter = await getTokenCount(summary, pool, model || upstream.id);
    const tokensSaved = tokensBefore - tokensAfter;

    const result: CompactResponse = {
      summary,
      tokensBefore,
      tokensAfter,
      tokensSaved: Math.max(0, tokensSaved),
    };

    log.debug('tokens before:', tokensBefore, 'after:', tokensAfter, 'saved:', tokensSaved);

    return Response.json(result);

  } catch (error) {
    log.error('error:', error);
    return Response.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
