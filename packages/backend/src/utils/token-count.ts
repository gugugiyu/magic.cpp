/**
 * Token counting utility with upstream fallback.
 *
 * Attempts to get accurate token counts from the upstream model's /tokenize
 * endpoint, falling back to heuristic estimation if unavailable.
 */

import type { ModelPool } from '../pool/model-pool.ts';
import { estimateTokenCount } from '#shared/utils/token-estimator.ts';
import { fetchWithTimeout } from '#shared/utils/abort';

const TOKENIZE_TIMEOUT = 5_000;

/**
 * Get token count for text, trying the upstream /tokenize endpoint first.
 * Falls back to heuristic estimation on any failure.
 */
export async function getTokenCount(
  text: string,
  pool: ModelPool,
  modelId?: string
): Promise<number> {
  if (!text.trim()) return 0;

  // Try upstream tokenize if a model is specified and available
  if (modelId) {
    const upstream = pool.resolveUpstream(modelId);
    if (upstream) {
      const result = await tryUpstreamTokenize(text, upstream);
      if (result !== null) return result;
    }
  }

  // Fallback: heuristic estimate
  return estimateTokenCount(text);
}

/**
 * Attempt to call the upstream /tokenize endpoint.
 * Returns null on any failure (network, 404, missing endpoint, etc.)
 */
async function tryUpstreamTokenize(
  text: string,
  upstream: { url: string; resolvedApiKey?: string | null }
): Promise<number | null> {
  try {
    const tokenizeUrl = `${upstream.url}/tokenize`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (upstream.resolvedApiKey) {
      headers['Authorization'] = `Bearer ${upstream.resolvedApiKey}`;
    }

    const response = await fetchWithTimeout(
      tokenizeUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: text }),
      },
      TOKENIZE_TIMEOUT
    );

    if (!response.ok) return null;

    const data = await response.json();

    // llama.cpp returns { tokens: number[] } or { count: number }
    if (Array.isArray(data.tokens)) return data.tokens.length;
    if (typeof data.count === 'number') return data.count;

    return null;
  } catch {
    return null;
  }
}
