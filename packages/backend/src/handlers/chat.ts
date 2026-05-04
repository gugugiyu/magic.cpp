import type { ModelPool } from '../pool/model-pool.ts';
import { proxyRequest } from '../utils/proxy.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('chat');

/**
 * Count words in a string (handles both whitespace-separated and CJK characters)
 */
function countWords(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	const words = trimmed.split(/\s+/).filter(w => w.length > 0);
	return words.length + (words.length === 0 && trimmed.length > 0 ? 1 : 0);
}

/**
 * Extract content from SSE data
 */
function extractContent(line: string): string | null {
	if (line.startsWith('data: ')) {
		const data = line.slice(6).trim();
		if (data === '[DONE]') return null;
		try {
			const json = JSON.parse(data);
			if (json.choices?.[0]?.delta?.content) {
				return json.choices[0].delta.content;
			}
		} catch {
			return data;
		}
	}
	return null;
}

/**
 * POST /v1/chat/completions — route to the upstream that owns the requested model.
 * Streaming responses can be buffered before forwarding based on config.
 */
export async function handleChat(req: Request, pool: ModelPool): Promise<Response> {
	let modelId: string | undefined;
	const rawBody = await req.text();
	// console.log('[chat] raw incoming body:', rawBody);

	try {
		const body = JSON.parse(rawBody) as { model?: string; stream?: boolean };
		modelId = body.model;
		log.debug('incoming request, model:', modelId);
	} catch (err) {
		log.error('failed to parse request body:', err);
		// body may not be JSON — proceed without model routing
	}

	let upstream;
	const allUpstreams = pool.getAllUpstreams();

	if (!modelId) {
		log.debug('no model in request, using fallback upstream');
		const fallback = allUpstreams[0];
		if (!fallback) {
			return Response.json({ error: 'no upstreams configured' }, { status: 503 });
		}
		upstream = fallback;
	} else {
		upstream = pool.resolveUpstream(modelId);
		log.debug('resolved upstream for model:', modelId, '->', upstream?.id);

		if (!upstream) {
			// DEBUG: Check available upstreams and their model lists
			log.error('model not found in routing map');
			log.error('available upstreams:', allUpstreams.map(u => ({ id: u.id, url: u.url, enabled: u.enabled })));
			log.error('merged models from pool:', pool.getMergedModels().map(m => m.id));

			return Response.json(
				{ error: `model '${modelId}' not found in any upstream` },
				{ status: 404 },
			);
		}
	}

	// Guard: ensure upstream is enabled and has API key
	if (!upstream.enabled) {
		log.error('upstream is disabled:', upstream.id);
		return Response.json({ error: `upstream '${upstream.id}' is disabled` }, { status: 503 });
	}
	if (!upstream.resolvedApiKey) {
		log.error('upstream has no API key:', upstream.id);
		return Response.json({ error: `upstream '${upstream.id}' missing API key` }, { status: 503 });
	}

	log.debug('using API key:', upstream.resolvedApiKey?.slice(0, 10) + '...');

	log.debug('proxying to upstream:', upstream.id, 'url:', upstream.url);

	const streamingConfig = pool.getStreamingConfig();
	const shouldStream = streamingConfig.enabled;

	if (!shouldStream || !streamingConfig.bufferWords) {
		return proxyRequest(req, upstream, '/v1/chat/completions', rawBody);
	}

	const upstreamUrl = `${upstream.url}/v1/chat/completions`;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'Accept': 'text/event-stream'
	};
	if (upstream.resolvedApiKey) {
		headers['Authorization'] = `Bearer ${upstream.resolvedApiKey}`;
	}

	const parsed = JSON.parse(rawBody);
	parsed.stream = true;

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const decoder = new TextDecoder();
			let buffer = '';
			let wordCount = 0;

			let closed = false;
			const abortHandler = () => {
				if (!closed) {
					closed = true;
					controller.close();
				}
			};
			req.signal.addEventListener('abort', abortHandler);

			try {
				if (req.signal.aborted) {
					return;
				}

				const response = await fetch(upstreamUrl, {
					method: 'POST',
					headers,
					body: JSON.stringify(parsed),
					signal: req.signal,
				});

				if (!response.body) {
					return;
				}

				const reader = response.body.getReader();

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					buffer += chunk;

					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const content = extractContent(line);

							if (content === null) {
								controller.enqueue(encoder.encode(line + '\n'));
								continue;
							}
							wordCount += countWords(content);
							controller.enqueue(encoder.encode(line + '\n'));
						} else if (line.trim()) {
							controller.enqueue(encoder.encode(line + '\n'));
						}
					}
				}

				if (buffer) {
					controller.enqueue(encoder.encode(buffer + '\n'));
				}
			} catch (err) {
				if (err instanceof Error && err.name === 'AbortError') {
					return;
				}
				log.error('streaming error:', err);
			} finally {
				req.signal.removeEventListener('abort', abortHandler);
				if (!closed) {
					closed = true;
					controller.close();
				}
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});
}
