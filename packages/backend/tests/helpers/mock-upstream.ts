/**
 * Mock upstream server.
 * Spins up a Bun.serve() that mimics an OpenAI-compatible endpoint for E2E tests.
 */

export interface MockUpstreamOptions {
	port: number;
	models?: Array<{ id: string; object?: string; owned_by?: string; created?: number }>;
	chatResponse?: {
		content: string;
		reasoningContent?: string;
		toolCalls?: Array<{ id: string; name: string; arguments: string }>;
	};
	propsResponse?: Record<string, unknown>;
	healthResponse?: { status: string };
	/** Delay in ms before responding (to test timeouts) */
	chatDelayMs?: number;
	/** Force an error response */
	chatError?: { status: number; body: unknown };
}

export function createMockUpstreamServer(opts: MockUpstreamOptions) {
	const models = opts.models ?? [
		{ id: 'test-model-1', object: 'model', owned_by: 'test-upstream-1', created: 1234567890 },
	];

	const chatResponse = opts.chatResponse ?? {
		content: 'Hello from mock upstream!',
	};

	const propsResponse = opts.propsResponse ?? {
		context: 4096,
		architecture: 'llama',
		chat_template: 'template',
	};

	const healthResponse = opts.healthResponse ?? { status: 'ok' };

	const server = Bun.serve({
		port: opts.port,
		async fetch(req: Request) {
			const url = new URL(req.url);

			// GET /v1/models
			if (url.pathname === '/v1/models') {
				return Response.json({
					object: 'list',
					data: models,
				});
			}

			// POST /v1/chat/completions
			if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
				if (opts.chatError) {
					return Response.json(opts.chatError.body, { status: opts.chatError.status });
				}

				if (opts.chatDelayMs) {
					await new Promise((r) => setTimeout(r, opts.chatDelayMs));
				}

				const body = await req.json() as { stream?: boolean; model?: string };

				if (body.stream) {
					// SSE streaming response
					const encoder = new TextEncoder();
					const stream = new ReadableStream({
						start(controller) {
							// Send content chunks
							const words = chatResponse.content.split(' ');
							for (const word of words) {
								const chunk = {
									choices: [{
										delta: { content: word + ' ' },
										index: 0,
										finish_reason: null,
									}],
									created: Date.now(),
									model: body.model ?? 'test-model-1',
									object: 'chat.completion.chunk',
								};
								controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
							}

							// Send tool calls if configured
							if (chatResponse.toolCalls && chatResponse.toolCalls.length > 0) {
								const toolChunk = {
									choices: [{
										delta: {
											tool_calls: chatResponse.toolCalls.map((tc, i) => ({
												index: i,
												id: tc.id,
												type: 'function',
												function: { name: tc.name, arguments: tc.arguments },
											})),
										},
										index: 0,
										finish_reason: null,
									}],
									created: Date.now(),
									model: body.model ?? 'test-model-1',
									object: 'chat.completion.chunk',
								};
								controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolChunk)}\n\n`));
							}

							// Send [DONE]
							controller.enqueue(encoder.encode('data: [DONE]\n\n'));
							controller.close();
						},
					});

					return new Response(stream, {
						headers: {
							'Content-Type': 'text/event-stream',
							'Cache-Control': 'no-cache',
							'Connection': 'keep-alive',
						},
					});
				} else {
					// Non-streaming response
					const resp = {
						id: 'chatcmpl-mock-' + Date.now(),
						object: 'chat.completion',
						created: Date.now(),
						model: body.model ?? 'test-model-1',
						choices: [{
							index: 0,
							message: {
								role: 'assistant',
								content: chatResponse.content,
								reasoning_content: chatResponse.reasoningContent ?? null,
								tool_calls: chatResponse.toolCalls ?? null,
							},
							finish_reason: 'stop',
						}],
						usage: {
							prompt_tokens: 10,
							completion_tokens: 20,
							total_tokens: 30,
						},
					};
					return Response.json(resp);
				}
			}

			// GET /props
			if (url.pathname === '/props') {
				return Response.json(propsResponse);
			}

			// GET /health (for heartbeat testing)
			if (url.pathname === '/health') {
				return Response.json(healthResponse);
			}

			// POST /models/load
			if (url.pathname === '/models/load' && req.method === 'POST') {
				return Response.json({ success: true });
			}

			// POST /models/unload
			if (url.pathname === '/models/unload' && req.method === 'POST') {
				return Response.json({ success: true });
			}

			// GET /models (for llamacpp model list proxy)
			if (url.pathname === '/models' && req.method === 'GET') {
				return Response.json({
					object: 'list',
					data: models,
				});
			}

			return new Response('Not Found', { status: 404 });
		},
	});

	return {
		server,
		url: `http://localhost:${opts.port}`,
		port: opts.port,
		stop: () => server.stop(),
	};
}
