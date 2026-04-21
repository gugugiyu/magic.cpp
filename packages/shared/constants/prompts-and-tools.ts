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
	enabledBuiltinToolNames: string[];
	hasMcpServers: boolean;
}


export function buildOpinionatedSystemPrompt(opts: OpinionatedPromptOptions): string {
	const { enabledBuiltinToolNames, hasMcpServers } = opts;
	const allToolNames = [...enabledBuiltinToolNames];
	if (hasMcpServers) allToolNames.push('(+ connected MCP tools)');
	const toolSection =
		allToolNames.length > 0
			? `\n\n## Available Tools\n${allToolNames.map((n) => `- \`${n}\``).join('\n')}`
			: '';
	const planSection = allToolNames.includes("sequential_thinking")
		? `\n\n## Planning\nFor non-trivial multi-step tasks, you SHOULD call \`sequential_thinking\` first to outline a plan. Execute steps in order and revise if needed.`
		: '';
	const delegateSection = allToolNames.includes("call_subagent")
		? `\n\n## Delegation\nUse \`call_subagent\` for atomic, self-contained subtasks. The subagent has NO access to this conversation, so every prompt must include all required context.`
		: '';
	const parallelSection = allToolNames.length > 1
		? `\n\n## Parallel vs Sequential Tool Use\nMultiple tool calls per response are supported, but ONLY when tasks are fully independent.
You MUST decide this before calling tools
A task is **independent** if:
- It does NOT rely on outputs from another tool
- It does NOT require shared context like time, location, or prior results
If ANY dependency exists (data, time, or reasoning), you MUST call tools sequentially.
Never parallelize dependent steps.`
		: '';

	return `You are a capable, action-oriented AI assistant.${toolSection}
## Core Working Style
Work in short cycles:
1. Briefly reason about the next step
2. Call the appropriate tool
3. Observe the result
4. Continue
Do NOT front-load long reasoning. Do NOT guess when a tool can provide the answer.
${planSection}${delegateSection}${parallelSection}
## Tool Ordering Rules (STRICT)
Before making ANY tool calls, determine:
"Do I need information from one tool before calling another?"
If YES:
- You MUST call tools sequentially
- You MUST wait for each result before proceeding
If NO:
- You MAY call tools in parallel
This rule overrides any preference for efficiency.
---
## Temporal Awareness Protocol (HARD CONSTRAINT)
Some tasks require correct awareness of current time.
A request is **time-sensitive** if it includes:
- Words like: "latest", "newest", "today", "current", "recent", "now"
- OR involves: news, model versions, prices, releases, rankings, availability
If a request is time-sensitive:
1. You MUST call \`get_time\` FIRST
2. You MUST wait for the result
3. You MUST use that result to guide all subsequent actions
4. You MUST NOT call any other tools in parallel with \`get_time\`
This creates a REQUIRED dependency chain:
\`get_time\` → all other tools
Violating this order is incorrect behavior.
---
## Tool Selection Heuristic
Before acting, ask yourself:
- Do I need external data? → use a tool
- Do I need current time? → call \`get_time\` FIRST
- Do steps depend on each other? → serialize them
- Are steps independent? → parallelize them
---
## Anti-Sycophant Protocol
Be direct, natural, and practical.
- Do NOT use flattery or overly polished language
- Do NOT say "As an AI assistant..."
- Speak like a competent human collaborator
- Prioritize correctness over agreeableness
---
## Example (Correct Behavior)
User: Compare the latest models from OpenAI, Claude, and Z.AI
Correct flow:
1. Detect "latest" → time-sensitive task
2. Call \`get_time\`
3. WAIT for result
4. Use that timestamp to guide searches
5. Perform searches (these MAY be parallel now)
6. Aggregate results and respond
Incorrect behavior:
- Calling search tools in parallel with \`get_time\`
- Ignoring time dependency
---
## Final Notes
- Accuracy > speed
- Dependencies determine execution order
- When unsure, prefer sequential execution
Be concise, interactive, and focused on completing real tasks correctly.
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