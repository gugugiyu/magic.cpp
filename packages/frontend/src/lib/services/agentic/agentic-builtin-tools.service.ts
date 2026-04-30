import { AgenticToolRegistry } from './agentic-tool-registry.service';
import { BUILTIN_TOOL_EXECUTION_TARGET } from '$lib/enums/builtin-tools';
import { serverEndpointStore } from '$lib/stores/server-endpoint.svelte';
import { runCommandSessionStore } from '$lib/stores/run-command-session.svelte';
import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
import { modelCapabilityStore } from '$lib/stores/model-capabilities.svelte';
import { skillsStore } from '$lib/stores/skills.svelte';
import { todoStore } from '$lib/stores/todos.svelte';
import { mcpStore } from '$lib/stores/mcp.svelte';
import { createLinkedController, repairJsonObject, sanitizeToolName } from '$lib/utils';
import { SUBAGENT_DEFAULT_PROMPT } from '@shared/constants/prompts-and-tools';
import { AttachmentType } from '$lib/enums';
import type { OpenAIToolDefinition } from '$lib/types';
import type { DatabaseMessageExtra } from '$lib/types/database';

export class AgenticBuiltinToolExecutor {
	static async executeBuiltinTool(
		name: string,
		args: string,
		conversationId: string,
		messageId: string,
		allTools?: OpenAIToolDefinition[],
		signal?: AbortSignal,
		toolCallId?: string
	): Promise<{ content: string; extras?: DatabaseMessageExtra[] }> {
		let parsed: Record<string, unknown> = {};
		try {
			parsed = JSON.parse(args || '{}');
		} catch {
			/* use empty object if args are malformed */
		}

		if (BUILTIN_TOOL_EXECUTION_TARGET[name] === 'backend') {
			if (name === 'run_command') {
				const command = String(parsed.command ?? '');
				if (!command) return { content: 'Error: command is required' };
				if (!runCommandSessionStore.isApproved(command)) {
					const approved = await runCommandSessionStore.requestApproval(
						toolCallId || '',
						command,
						signal
					);
					if (!approved) {
						const baseCommand = command.trim().split(/\s+/)[0];
						return {
							content: `Error: command '${baseCommand}' is not approved for this session`
						};
					}
				}
			}

			const endpoint = serverEndpointStore.getBaseUrl();
			try {
				const resp = await fetch(`${endpoint}/api/tools/execute`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name, args: parsed }),
					signal
				});
				if (!resp.ok) {
					const text = await resp.text().catch(() => 'Unknown error');
					return { content: `Error: HTTP ${resp.status} — ${text}` };
				}
				const data = (await resp.json()) as {
					result?: string;
					error?: string;
					truncated?: boolean;
					originalLength?: number;
				};
				if (data.error) return { content: `Error: ${data.error}` };
				const extras: DatabaseMessageExtra[] = [];
				if (data.truncated && typeof data.originalLength === 'number') {
					extras.push({
						type: AttachmentType.TRUNCATED,
						name: 'truncated',
						originalLength: data.originalLength
					});
				}
				return {
					content: String(data.result ?? ''),
					extras: extras.length > 0 ? extras : undefined
				};
			} catch (err) {
				return { content: `Error: ${err instanceof Error ? err.message : String(err)}` };
			}
		}

		switch (name) {
			case 'calculator':
				return { content: this.executeCalculator(parsed) };
			case 'get_time':
				return { content: this.executeGetTime(parsed) };
			case 'get_location':
				return { content: await this.executeGetLocation() };
			case 'call_subagent':
				return {
					content: await this.executeCallSubagent(
						parsed,
						conversationId,
						messageId,
						allTools,
						signal
					)
				};
			case 'list_skill':
				return { content: await this.executeListSkill() };
			case 'read_skill':
				return { content: await this.executeReadSkill(parsed, conversationId) };
			case 'create_todo': {
				const texts = Array.isArray(parsed.todos)
					? parsed.todos.filter((t: unknown) => typeof t === 'string')
					: [];
				const isRecreated = Boolean(parsed.isRecreated);
				const items = await todoStore.createTodos(conversationId, texts, isRecreated);
				return { content: todoStore.formatMarkdownList(items) };
			}
			case 'mark_todo': {
				const indices = Array.isArray(parsed.indices)
					? parsed.indices.filter((i: unknown) => typeof i === 'number' && Number.isInteger(i))
					: [];
				await todoStore.markTodos(conversationId, indices);
				return { content: 'Confirmed' };
			}
			case 'read_todo': {
				const current = await todoStore
					.loadTodos(conversationId)
					.then(() => todoStore.getTodos(conversationId));
				return { content: todoStore.formatMarkdownList(current) };
			}
			default:
				return { content: `Error: unknown built-in tool "${name}"` };
		}
	}

	private static executeCalculator(parsed: Record<string, unknown>): string {
		const expression = String(parsed.expression ?? '');
		if (!expression) return 'Error: missing expression';
		try {
			const result = new Function(`"use strict"; return (${expression})`)();
			if (typeof result !== 'number' || !isFinite(result)) {
				return 'Error: expression did not produce a finite number';
			}
			return String(result);
		} catch (err) {
			return `Error: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	private static executeGetTime(parsed: Record<string, unknown>): string {
		const tz = String(parsed.timezone ?? import.meta.env.TZ ?? 'UTC');
		let formatter: Intl.DateTimeFormat;
		try {
			formatter = new Intl.DateTimeFormat('en-CA', {
				timeZone: tz,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false,
				timeZoneName: 'short'
			});
		} catch {
			return `Error: invalid timezone "${tz}"`;
		}
		const parts = formatter.formatToParts(new Date());
		const get = (unit: string) => parts.find((p) => p.type === unit)?.value ?? '';
		const dateStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
		const tzAbbr = parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
		return JSON.stringify({ iso: `${dateStr}`, timezone: tz, tz_abbr: tzAbbr });
	}

	private static executeGetLocation(): Promise<string> {
		if (!navigator.geolocation) {
			return Promise.resolve('Error: Geolocation is not supported by this browser');
		}
		return new Promise<string>((resolve) => {
			navigator.geolocation.getCurrentPosition(
				(pos) => {
					resolve(
						JSON.stringify({
							latitude: pos.coords.latitude,
							longitude: pos.coords.longitude,
							accuracy_meters: pos.coords.accuracy
						})
					);
				},
				(err) => {
					resolve(`Error: ${err.message}`);
				},
				{ timeout: 10_000 }
			);
		});
	}

	private static async executeCallSubagent(
		parsed: Record<string, unknown>,
		conversationId: string,
		messageId: string,
		allTools?: OpenAIToolDefinition[],
		signal?: AbortSignal
	): Promise<string> {
		if (!subagentConfigStore.isConfigured) {
			return JSON.stringify({
				error:
					'Subagent not configured. Please set endpoint, model, and enable the subagent in Settings.'
			});
		}

		const subagentModelId = subagentConfigStore.getModel();
		if (!modelCapabilityStore.isToolCallingEnabled(subagentModelId)) {
			return JSON.stringify({
				error:
					`Subagent model "${subagentModelId}" has tool-calling disabled. ` +
					'A subagent needs tool-calling capabilities to assist the main model. ' +
					'Please select another model that supports function calling in Settings → Connection → Subagent.'
			});
		}

		const { prompt, system } = parsed as { prompt: string; system?: string };
		if (!prompt) {
			return JSON.stringify({ error: 'call_subagent requires a prompt argument' });
		}

		const registry = AgenticToolRegistry.fromToolDefinitions(allTools ?? []);
		const subagentTools = registry.getSubagentTools(allTools ?? []);

		const linkedController = createLinkedController(signal);
		const subagentSignal = linkedController.signal;

		const endpoint = subagentConfigStore.getEndpoint();
		const apiKey = subagentConfigStore.getApiKey();
		const url = `${endpoint}/v1/chat/completions`;
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
		const subagentToolsPayload = subagentTools.length > 0 ? subagentTools : undefined;

		const loopMessages: Record<string, unknown>[] = [];
		if (system) {
			loopMessages.push({ role: 'system', content: system });
		} else {
			loopMessages.push({ role: 'system', content: SUBAGENT_DEFAULT_PROMPT });
		}
		loopMessages.push({ role: 'user', content: prompt });

		const SUBAGENT_MAX_TURNS = 10;
		let _totalTokens = 0;
		let _promptTokens = 0;
		let _completionTokens = 0;

		try {
			for (let subTurn = 0; subTurn < SUBAGENT_MAX_TURNS; subTurn++) {
				if (subagentSignal?.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}

				const requestBody: Record<string, unknown> = {
					model: subagentModelId,
					messages: loopMessages,
					stream: false,
					...(subagentToolsPayload !== undefined ? { tools: subagentToolsPayload } : {})
				};

				const response = await fetch(url, {
					method: 'POST',
					headers,
					body: JSON.stringify(requestBody),
					signal: subagentSignal
				});

				if (!response.ok) {
					const errorText = await response.text().catch(() => 'Unknown error');
					return JSON.stringify({
						error: `Subagent error (${response.status}): ${errorText}`
					});
				}

				const data = (await response.json()) as {
					choices?: {
						message?: {
							content?: string | { type: string; text?: string }[] | null;
							tool_calls?: {
								id?: string;
								function?: { name?: string; arguments?: string };
							}[];
						};
						finish_reason?: string;
					}[];
					usage?: {
						prompt_tokens?: number;
						completion_tokens?: number;
						total_tokens?: number;
					};
				};

				if (data.usage) {
					_promptTokens += data.usage.prompt_tokens ?? 0;
					_completionTokens += data.usage.completion_tokens ?? 0;
					_totalTokens += data.usage.total_tokens ?? 0;
				}

				const choice = data.choices?.[0];
				if (!choice) {
					return JSON.stringify({ error: 'Invalid subagent response format' });
				}

				const assistantMsg = choice.message;
				const toolCalls = assistantMsg?.tool_calls;

				if (toolCalls && toolCalls.length > 0) {
					loopMessages.push({
						role: 'assistant',
						content: assistantMsg?.content ?? null,
						tool_calls: toolCalls
					});

					for (const tc of toolCalls ?? []) {
						const tcName = sanitizeToolName(tc.function?.name ?? '');
						const tcArgs = repairJsonObject(tc.function?.arguments ?? '{}');
						const tcId = tc.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;

						let toolResult: string;
						try {
							if (registry.isBuiltin(tcName)) {
								const builtinResult = await this.executeBuiltinTool(
									tcName,
									tcArgs,
									conversationId,
									messageId,
									allTools,
									subagentSignal,
									tcId
								);
								toolResult = builtinResult.content;
							} else {
								const mcpResult = await mcpStore.executeTool(
									{ id: tcId, function: { name: tcName, arguments: tcArgs } },
									subagentSignal
								);
								toolResult = mcpResult.content;
							}
						} catch (err) {
							if (err instanceof DOMException && err.name === 'AbortError') throw err;
							toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
						}

						loopMessages.push({ role: 'tool', tool_call_id: tcId, content: toolResult });
					}
				} else {
					const resultContent =
						typeof assistantMsg?.content === 'string'
							? assistantMsg.content
							: (assistantMsg?.content
									?.map((c) =>
										typeof c === 'object' && c !== null && 'text' in c
											? ((c as { text?: string }).text ?? '')
											: ''
									)
									.join('') ?? '');

					return JSON.stringify({ result: resultContent });
				}
			}

			return JSON.stringify({
				error: 'Subagent reached maximum turn limit without producing a final answer'
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') throw error;
			const message = error instanceof Error ? error.message : String(error);
			return JSON.stringify({ error: `Subagent request failed: ${message}` });
		}
	}

	private static async executeListSkill(): Promise<string> {
		await skillsStore.loadSkillsIfStale(30_000);
		const entries = skillsStore.getListSkillEntries();
		if (entries.length === 0) {
			return JSON.stringify({
				skills: [],
				message: 'No skills are currently enabled.'
			});
		}
		return JSON.stringify({ skills: entries });
	}

	private static async executeReadSkill(
		parsed: Record<string, unknown>,
		_conversationId: string
	): Promise<string> {
		const name = String(parsed.name ?? '');
		if (!name) {
			return JSON.stringify({ error: 'Missing required parameter: name' });
		}
		await skillsStore.loadSkillsIfStale(30_000);
		const content = skillsStore.getReadSkillContent(name);
		if (content === null) {
			return JSON.stringify({ error: `Skill "${name}" not found or not enabled.` });
		}
		return JSON.stringify({ name, content });
	}
}
