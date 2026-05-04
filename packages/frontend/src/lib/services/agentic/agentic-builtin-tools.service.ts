import { AgenticToolRegistry } from './agentic-tool-registry.service';
import { AgenticLoopHarness } from './agentic-loop-harness.service';
import { BUILTIN_TOOL_EXECUTION_TARGET } from '$lib/enums/builtin-tools';
import { serverEndpointStore } from '$lib/stores/server-endpoint.svelte';
import { runCommandSessionStore } from '$lib/stores/run-command-session.svelte';
import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
import { subagentSessionStore } from '$lib/stores/subagent-session.svelte';
import { modelCapabilityStore } from '$lib/stores/model-capabilities.svelte';
import { skillsStore } from '$lib/stores/skills.svelte';
import { todoStore } from '$lib/stores/todos.svelte';
import { DatabaseService } from '$lib/services/database.service';
import { createLinkedController } from '$lib/utils';
import { SUBAGENT_DEFAULT_PROMPT } from '@shared/constants/prompts-and-tools';
import { AttachmentType, MessageRole, MessageType } from '$lib/enums';
import type { OpenAIToolDefinition } from '$lib/types';
import type { DatabaseMessageExtra } from '$lib/types/database';
import type { ApiChatMessageData } from '$lib/types/api';

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

			if (name === 'get_time') {
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
					};
					if (data.error) return { content: `Error: ${data.error}` };
					return { content: String(data.result ?? '') };
				} catch (err) {
					return { content: `Error: ${err instanceof Error ? err.message : String(err)}` };
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
			case 'get_location':
				return { content: await this.executeGetLocation() };
			case 'call_subagent':
				return {
					content: await this.executeCallSubagent(
						parsed,
						conversationId,
						messageId,
						allTools,
						signal,
						toolCallId
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
		signal?: AbortSignal,
		toolCallId?: string
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

		const sessionId = toolCallId || `subagent_${Date.now()}_${Math.random().toString(36).slice(2)}`;
		const registry = AgenticToolRegistry.fromToolDefinitions(allTools ?? []);
		const subagentTools = registry.getSubagentTools(allTools ?? []);

		const linkedController = createLinkedController(signal);
		const subagentSignal = linkedController.signal;

		const endpoint = subagentConfigStore.getEndpoint();
		const apiKey = subagentConfigStore.getApiKey();

		subagentSessionStore.startSession({
			sessionId,
			conversationId,
			modelName: subagentModelId
		});

		const loopMessages: ApiChatMessageData[] = [];
		const systemContent = system || SUBAGENT_DEFAULT_PROMPT;
		loopMessages.push({ role: MessageRole.SYSTEM, content: systemContent });
		loopMessages.push({ role: MessageRole.USER, content: prompt });

		const SUBAGENT_MAX_TURNS = 10;
		let lastMessageId: string | null = null;

		try {
			// Persist system message to DB
			const systemMsg = await DatabaseService.createMessageBranch(
				{
					convId: conversationId,
					type: MessageType.TEXT,
					role: MessageRole.SYSTEM,
					content: systemContent,
					timestamp: Date.now(),
					subagentSessionId: sessionId
				} as Omit<DatabaseMessage, 'id'>,
				null
			);
			lastMessageId = systemMsg.id;

			for (let turn = 0; turn < SUBAGENT_MAX_TURNS; turn++) {
				if (subagentSignal?.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}

				subagentSessionStore.setTurn(sessionId, turn + 1);

				const turnResult = await AgenticLoopHarness.runSingleTurn(
					loopMessages,
					{
						model: subagentModelId,
						endpoint,
						apiKey,
						tools: subagentTools.length > 0 ? subagentTools : undefined,
						signal: subagentSignal
					},
					{
						onChunk: (chunk) => {
							subagentSessionStore.appendContent(sessionId, chunk);
						},
						onReasoningChunk: (chunk) => {
							subagentSessionStore.appendReasoning(sessionId, chunk);
						},
						onToolCallChunk: () => {
							// Tool calls are handled after the turn completes
						},
						onModel: (model) => {
							subagentSessionStore.setModel(sessionId, model);
						},
						onTimings: (timings) => {
							if (timings) {
								subagentSessionStore.addUsage(
									sessionId,
									timings.prompt_n || 0,
									timings.predicted_n || 0,
									(timings.prompt_n || 0) + (timings.predicted_n || 0)
								);
							}
						}
					}
				);

				if (subagentSignal?.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}

				// Persist assistant message to DB
				const assistantMsg = await DatabaseService.createMessageBranch(
					{
						convId: conversationId,
						type: MessageType.TEXT,
						role: MessageRole.ASSISTANT,
						content: turnResult.content,
						reasoningContent: turnResult.reasoningContent,
						toolCalls: turnResult.toolCalls ? JSON.stringify(turnResult.toolCalls) : '',
						model: subagentModelId,
						timestamp: Date.now(),
						subagentSessionId: sessionId
					} as Omit<DatabaseMessage, 'id'>,
					lastMessageId
				);
				lastMessageId = assistantMsg.id;

				// Add assistant to loop history
				loopMessages.push({
					role: MessageRole.ASSISTANT,
					content: turnResult.content,
					reasoning_content: turnResult.reasoningContent,
					tool_calls: turnResult.toolCalls
				});

				// No tool calls = final turn
				if (!turnResult.toolCalls || turnResult.toolCalls.length === 0) {
					subagentSessionStore.completeSession(sessionId);
					return JSON.stringify({ result: turnResult.content });
				}

				// Execute tools via shared harness
				const executeBuiltinToolForSubagent: import('./agentic-loop-harness.service').ExecuteBuiltinToolFn =
					(name, args, convId, msgId, tcId) =>
						AgenticBuiltinToolExecutor.executeBuiltinTool(
							name,
							args,
							convId,
							msgId,
							allTools,
							subagentSignal,
							tcId
						);

				const toolOutcomes = await AgenticLoopHarness.executeTools(turnResult.toolCalls, {
					registry,
					conversationId,
					messageId: assistantMsg.id,
					allTools,
					signal: subagentSignal,
					effectiveModel: subagentModelId,
					mcpSummarizeOutputs: false,
					mcpSummarizeLineThreshold: 400,
					mcpSummarizeHardCap: 800,
					mcpSummarizeAllTools: false,
					executeBuiltinTool: executeBuiltinToolForSubagent
				});

				if (subagentSignal?.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}

				// Persist tool results and add to history
				for (const outcome of toolOutcomes) {
					subagentSessionStore.addStep(
						sessionId,
						outcome.toolCall.function?.name || 'tool',
						'done'
					);
					subagentSessionStore.incrementToolCallsCount(sessionId);

					const toolMsg = await DatabaseService.createMessageBranch(
						{
							convId: conversationId,
							type: MessageType.TEXT,
							role: MessageRole.TOOL,
							content: outcome.result,
							toolCallId: outcome.toolCall.id,
							extra: outcome.extras,
							timestamp: Date.now(),
							subagentSessionId: sessionId
						} as Omit<DatabaseMessage, 'id'>,
						lastMessageId
					);
					lastMessageId = toolMsg.id;

					loopMessages.push({
						role: MessageRole.TOOL,
						tool_call_id: outcome.toolCall.id,
						content: outcome.contentParts ?? outcome.result
					});
				}
			}

			subagentSessionStore.completeSession(sessionId);
			return JSON.stringify({
				error: 'Subagent reached maximum turn limit without producing a final answer'
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				subagentSessionStore.setError(sessionId, 'Aborted');
				throw error;
			}
			const message = error instanceof Error ? error.message : String(error);
			subagentSessionStore.setError(sessionId, message);
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
