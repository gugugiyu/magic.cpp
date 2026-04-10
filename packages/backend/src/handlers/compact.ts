import type { ModelPool } from '../pool/model-pool.ts';
import { estimateTokenCount, estimateMessagesTokenCount } from '../utils/token-estimator.ts';
import { buildCompactSystemMessage } from '#shared/constants/prompts-and-tools.ts'

interface CompactRequest {
  messages: Array<{
    role: string;
    content: string;
    [key: string]: unknown;
  }>;
  anchorMessagesCount: number;
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
 * POST /compact — Summarize conversation history while preserving recent context.
 * 
 * Compacts all messages except the last N anchor messages by:
 * 1. Extracting messages to compact
 * 2. Building a summarization prompt
 * 3. Calling upstream LLM to generate summary
 * 4. Returning summary with token statistics
 */
export async function handleCompact(req: Request, pool: ModelPool): Promise<Response> {
  try {
    const body = await req.json() as CompactRequest;
    const { messages, anchorMessagesCount, model, previousSummary } = body;

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: 'Invalid request: messages must be an array' },
        { status: 400 }
      );
    }

    if (!anchorMessagesCount || anchorMessagesCount < 0) {
      return Response.json(
        { error: 'Invalid request: anchorMessagesCount must be a non-negative integer' },
        { status: 400 }
      );
    }

    if (anchorMessagesCount >= messages.length) {
      return Response.json(
        { error: 'Cannot compact: anchor count exceeds or equals total messages' },
        { status: 400 }
      );
    }

    // Split messages into compacted and anchor
    const messagesToCompact = messages.slice(0, messages.length - anchorMessagesCount);
    const anchorMessages = messages.slice(messages.length - anchorMessagesCount);

    if (messagesToCompact.length === 0) {
      return Response.json(
        { error: 'No messages to compact' },
        { status: 400 }
      );
    }

    // Build the compacted content with role prefixes (this is what gets sent to the LLM)
    const compactedContent = messagesToCompact
      .map(msg => `[${msg.role.toUpperCase()}]: ${msg.content}`)
      .join('\n\n');

    // Calculate tokens before compaction — estimate on the actual formatted content
    // that will be sent to the LLM (includes [ROLE]: prefixes and separators).
    const tokensBefore = estimateTokenCount(compactedContent);

    // Build summarization prompt
    const systemMessage = buildCompactSystemMessage(previousSummary);

    const userMessage = {
      role: 'user',
      content: `Please summarize the following conversation history:\n\n${compactedContent}`
    };

    // Resolve upstream model
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

    // Call LLM for summarization
    const upstreamUrl = `${upstream.url}/v1/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (upstream.resolvedApiKey) {
      headers['Authorization'] = `Bearer ${upstream.resolvedApiKey}`;
    }

    const requestBody = {
      model: model || upstream.modelList[0] || '',
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 1000,
      stream: false,
    };

    console.log('[compact] requesting summarization from:', upstream.id);

    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[compact] upstream error:', errorText);
      return Response.json(
        { error: `Summarization failed: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    let summary = data.choices?.[0]?.message?.content || '';

    if (!summary) {
      return Response.json(
        { error: 'No summary generated' },
        { status: 500 }
      );
    }

    // Enforce strict 1000-word limit
    const words = summary.trim().split(/\s+/);
    if (words.length > 1000) {
      summary = words.slice(0, 1000).join(' ');
    }

    // Calculate tokens after compaction
    const tokensAfter = estimateTokenCount(summary) + estimateMessagesTokenCount(anchorMessages);
    const tokensSaved = tokensBefore - tokensAfter;

    const result: CompactResponse = {
      summary,
      tokensBefore,
      tokensAfter,
      tokensSaved: Math.max(0, tokensSaved),
    };

    console.log('[compact] tokens before:', tokensBefore, 'after:', tokensAfter, 'saved:', tokensSaved);

    return Response.json(result);

  } catch (error) {
    console.error('[compact] error:', error);
    return Response.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
