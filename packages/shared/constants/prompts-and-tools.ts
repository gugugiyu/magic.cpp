import type { OpenAIToolDefinition } from '../types';

export const SUBAGENT_DEFAULT_PROMPT = "You are a comprehensive but concise agentic machine. Upon receiving a request, you'll analyze it thoroughly, make appropriate tool calls, before return the condensed version of your findings back. Do not assume or hallucinate. Prefer structured data (like markdown list and tables) over plain description.";

export const COMPACT_SUMMARIZER_BASE_PROMPT = `You are an expert conversation summarizer. Your task is to create a concise but comprehensive summary of a conversation history that can be used as context for future interactions.

The summary should:
- Capture all key points, decisions, and important information
- Preserve context about user preferences, goals, and constraints
- Be concise but thorough enough that the conversation can continue naturally
- Be written as a single paragraph or a few short paragraphs
- NOT include the anchor messages that follow this summary
- Be strictly under 1000 words

Format: Provide the summary directly without preamble.`;

export const TOOL_OUTPUT_SUMMARIZER_PROMPT = `You are an expert tool output summarizer. Your task is to create a concise but comprehensive summary of a tool execution result.

The summary should:
- Capture all key data, findings, and important information from the tool output
- Preserve structured data patterns (tables, lists, key-value pairs) where applicable
- Be concise enough to save tokens but thorough enough that the agent can continue reasoning
- Be written in a structured format (bullet points, tables, or short paragraphs as appropriate)
- Preserve any error messages or warnings if present
- Be strictly under 500 words

Format: Provide the summary directly without preamble.`;

export function buildCompactSystemMessage(previousSummary?: string): { role: 'system'; content: string } {
	const previousSummarySection = previousSummary
		? `\n\nPreviously Compacted Context:\nThe following summary was generated from a previous compaction of earlier messages. You MUST incorporate its key context into your new summary to preserve conversation continuity.\n\n<PREVIOUS_COMPACT_SUMMARY>\n${previousSummary}\n</PREVIOUS_COMPACT_SUMMARY>`
		: '';

	const mustIncorporate = previousSummary ? '\n- MUST incorporate key context from the <PREVIOUS_COMPACT_SUMMARY> section above' : '';

	return {
		role: 'system',
		content: `${COMPACT_SUMMARIZER_BASE_PROMPT}${previousSummarySection}${mustIncorporate}`
	};
}

export const TOOL_CALCULATOR: OpenAIToolDefinition = {
	type: 'function',
	function: {
		name: 'calculator',
		description:
			'Evaluate a mathematical expression and return the numeric result, use this instead of hallucinating numbers. Javascript-compatible expressions allowed.',
		parameters: {
			type: 'object',
			properties: {
				expression: {
					type: 'string',
					description: 'A valid JavaScript arithmetic expression, e.g. "(3 + 4) * 2 / 1.5"'
				}
			},
			required: ['expression']
		}
	}
};

export const TOOL_GET_TIME: OpenAIToolDefinition = {
	type: 'function',
	function: {
		name: 'get_time',
		description:
			'Return the current date and time as an ISO 8601 string in the specified timezone (or local timezone if not specified).',
		parameters: {
			type: 'object',
			properties: {
				timezone: {
					type: 'string',
					description:
						'IANA timezone string (e.g. "America/New_York", "Europe/London", "Asia/Bangkok"). Defaults to "UTC" if not set.'
				}
			},
			required: []
		}
	}
};

export const TOOL_GET_LOCATION: OpenAIToolDefinition = {
	type: 'function',
	function: {
		name: 'get_location',
		description:
			"Return the user's approximate geolocation (latitude, longitude, accuracy) using the browser Geolocation API. The user must grant permission.",
		parameters: {
			type: 'object',
			properties: {},
			required: []
		}
	}
};

export const TOOL_SEQUENTIAL_THINKING: OpenAIToolDefinition = {
	type: 'function',
	function: {
		name: 'sequential_thinking',
		description:
			'Think through a problem step by step before giving a final answer. Call this tool once per reasoning step. Set nextThoughtNeeded=false on the last step.',
		parameters: {
			type: 'object',
			properties: {
				thought: {
					type: 'string',
					description:
						'The content of this reasoning step. **MAX** 100-120 words. Write it in a narrative way. Use plain text in 1 single paragraph only. (e.g. "Now I\'m pondering about...")'
				},
				thoughtNumber: {
					type: 'integer',
					description: 'The 1-based index of this thought.'
				},
				totalThoughts: {
					type: 'integer',
					description: 'Estimated total number of thoughts needed (may be revised upward).'
				},
				nextThoughtNeeded: {
					type: 'boolean',
					description: 'True if another thought step is needed; false when reasoning is done.'
				}
			},
			required: ['thought', 'thoughtNumber', 'totalThoughts', 'nextThoughtNeeded']
		}
	}
};

export const TOOL_CALL_SUBAGENT: OpenAIToolDefinition = {
	type: 'function',
	function: {
		name: 'call_subagent',
		description: `Delegate a task to a specialized subagent model running on a separate server.

USE THIS TOOL for:
- Long document analysis, summarization, or data extraction
- Structured report generation describable in a self-contained prompt
- Analytically heavy tasks where parallel offloading provides benefit
- Any prompt that does NOT require the current conversation history

HIGHLY RECOMMENDED for:
- Delegating web search summarizations
- Extracting structured data from documents

DO NOT use for short replies, clarifications, or tasks that need current context.

The subagent has no access to this conversation. Your prompt must be fully self-contained.`,
		parameters: {
			type: 'object',
			properties: {
				prompt: {
					type: 'string',
					description:
						'Complete, self-contained prompt for the subagent. Include all necessary context.'
				},
				system: {
					type: 'string',
					description: 'Optional system prompt to customise subagent behaviour for this task.'
				}
			},
			required: ['prompt']
		}
	}
};

export const TOOL_LIST_SKILL: OpenAIToolDefinition = {
	type: 'function',
	function: {
		name: 'list_skill',
		description:
			'List all available user-enabled skills with their names, titles, and descriptions. Use this to discover skills before deciding which one to read.',
		parameters: {
			type: 'object',
			properties: {},
			required: []
		}
	}
};

export const TOOL_READ_SKILL: OpenAIToolDefinition = {
	type: 'function',
	function: {
		name: 'read_skill',
		description:
			"Read the full content of a specific skill by its name. Use this after list_skill() to get the complete skill instructions, including $ARGUMENTS placeholders and frontmatter metadata.",
		parameters: {
			type: 'object',
			properties: {
				name: {
					type: 'string',
					description: 'The name identifier of the skill to read (from list_skill results).'
				}
			},
			required: ['name']
		}
	}
};

export interface OpinionatedPromptOptions {
	enabledToolNames: string[];
	hasMcpServers: boolean;
}

export function buildOpinionatedSystemPrompt(opts: OpinionatedPromptOptions): string {
	const { enabledToolNames, hasMcpServers } = opts;

	const allToolNames = [...enabledToolNames];
	if (hasMcpServers) allToolNames.push('(+ connected MCP tools)');

	const toolSection =
		allToolNames.length > 0
			? `\n\n## Available Tools\n${allToolNames.map((n) => `- \`${n}\``).join('\n')}`
			: '';

	const planSection = allToolNames.includes("sequential_thinking")
		? `\n\n## Plan-Then-Execute\nFor non-trivial multi-step tasks, call \`sequential_thinking\` to outline a plan first. Execute each step in order, revising the plan if new findings change direction.`
		: '';

	const delegateSection = allToolNames.includes("call_subagent")
		? `\n\n## Delegation\nOffload atomic, self-contained subtasks to \`call_subagent\`. The subagent has no access to this conversation — every prompt must be fully self-contained with all required context.`
		: '';

	const parallelSection = allToolNames.length > 1
		? `\n\n## Parallel Tool Calls\nMultiple tool calls per response are supported. For independent tasks (e.g. parallel web searches, fetching multiple resources, calling unrelated tools simultaneously), issue all tool calls in a single response turn to maximize efficiency. Only serialize calls when a later call depends on the result of an earlier one.`
		: '';

	return `You are a capable AI assistant.${toolSection}
## Working Style
Prefer interleaved thinking: reason briefly → call a tool → write one short sentence updating the user on what you found or what you are doing next → call the next tool. Avoid front-loading all reasoning before acting.${planSection}${delegateSection}${parallelSection}
## Temporal awareness protocol
When user uses temporal-related trigger words like 'online', 'latest', 'newest', 'modern',... You must fetch the latest time BEFORE continuing with other actions, this ensures your temporal awareness is freshed and unbiased when retrieving contemporary contents.
## Example Workflow
user: Make me a comparison table between the latest model from OpenAI, Claude, and Z.AI
A: I'll help you find all relevant information regarding the latest model generation from those providers. Let me first think through this step by step with the sequential_thinking tool.
Reason to break the task the these steps:
1. Retrieve the latest time with the get_time() tool, because user mentioned 'latest'
2. Make websearch covering model from OpenAI
3. Make websearch covering model from Claude
4. Make websearch covering model from Z.AI
5. Construct the comparison table, covering model pricing, context window, and capbilities. Adding a small section at the end of the response for use case recommendation

[Assistant continues with the plan. calling get_time() tool]
Great, I've fetch the current time. Now let me move on to searching for the latest model from OpenAI with the current time.
[Assistant also does web searches for the two remaining provder]
Now I have everything I need, let me present it back to the user.
[Assistant presents the table and the recommendation at the end]
`.trim();
}

export const BUILTIN_TOOLS: OpenAIToolDefinition[] = [
	TOOL_CALCULATOR,
	TOOL_GET_TIME,
	TOOL_GET_LOCATION,
	TOOL_SEQUENTIAL_THINKING,
	TOOL_CALL_SUBAGENT,
	TOOL_LIST_SKILL,
	TOOL_READ_SKILL
];