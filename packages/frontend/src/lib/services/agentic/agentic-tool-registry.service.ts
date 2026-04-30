import { SETTINGS_KEYS } from '$lib/constants';
import {
	BUILTIN_TOOLS,
	TOOL_READ_FILE,
	TOOL_WRITE_FILE,
	TOOL_PATCH_FILE,
	TOOL_LIST_DIRECTORY,
	TOOL_SEARCH_FILES,
	TOOL_DELETE_FILE,
	TOOL_MOVE_FILE,
	TOOL_LIST_SKILL,
	TOOL_READ_SKILL,
	TOOL_CREATE_TODO,
	TOOL_MARK_TODO,
	TOOL_READ_TODO
} from '@shared/constants/prompts-and-tools';
import { BUILTIN_TOOL_EXECUTION_TARGET, BUILTIN_TOOL_NAMES } from '$lib/enums/builtin-tools';
import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
import type { SettingsConfigType } from '$lib/types';
import type { OpenAIToolDefinition } from '$lib/types';

/** Result of classifying a tool call for dispatch. */
export interface ToolDispatchResult {
	/** Whether the tool is a builtin, MCP, or unsupported. */
	type: 'builtin' | 'mcp' | 'unsupported';
	/** For builtins: frontend (browser) or backend (API) execution target. */
	executionTarget?: 'frontend' | 'backend';
}

/**
 * AgenticToolRegistry - Central validation, classification, and routing
 * authority for builtin tools during an agentic flow.
 *
 * Owns every decision about:
 * - Which builtin tools are active for a session
 * - Whether a tool call should be treated as builtin or MCP
 * - Where a builtin runs (frontend vs backend)
 * - Which tools the subagent is allowed to see
 * - Whether tool results should be fed through the MCP summarize harness
 */
export class AgenticToolRegistry {
	private readonly _builtinTools: OpenAIToolDefinition[];
	private readonly _builtinNames: Set<string>;

	private constructor(builtinTools: OpenAIToolDefinition[]) {
		this._builtinTools = builtinTools;
		this._builtinNames = new Set(builtinTools.map((t) => t.function.name));
	}

	/** Build a registry from user settings (main agentic flow entry point). */
	static fromSettings(settings: SettingsConfigType): AgenticToolRegistry {
		const tools = getActiveBuiltinToolsFromSettings(settings);
		return new AgenticToolRegistry(tools);
	}

	/**
	 * Build a registry from an arbitrary tool list (subagent re-hydration).
	 * Only tools whose names match known builtins are registered;
	 * everything else is implicitly MCP.
	 */
	static fromToolDefinitions(tools: OpenAIToolDefinition[]): AgenticToolRegistry {
		const knownNames = new Set<string>(Object.values(BUILTIN_TOOL_NAMES));
		const builtins = tools.filter((t) => {
			const name = t.function?.name;
			return name ? knownNames.has(name) : false;
		});
		return new AgenticToolRegistry(builtins);
	}

	/** All active builtin definitions for this session. */
	getBuiltinTools(): OpenAIToolDefinition[] {
		return this._builtinTools;
	}

	/** Merge builtins with MCP definitions for the LLM payload. */
	mergeWithMcpTools(mcpTools: OpenAIToolDefinition[]): OpenAIToolDefinition[] {
		return [...this._builtinTools, ...mcpTools];
	}

	/** True if the name is an *active* builtin for this session. */
	isBuiltin(name: string): boolean {
		return this._builtinNames.has(name);
	}

	/** True if the name is NOT an active builtin (treated as MCP). */
	isMcp(name: string): boolean {
		return !this._builtinNames.has(name);
	}

	/** Where the builtin is physically executed. */
	getExecutionTarget(name: string): 'frontend' | 'backend' | 'unknown' {
		return BUILTIN_TOOL_EXECUTION_TARGET[name] ?? 'unknown';
	}

	/**
	 * Classify a tool name for dispatch.
	 * Returns whether it should be routed to the builtin executor or the MCP layer.
	 */
	dispatch(name: string): ToolDispatchResult {
		if (!this.isBuiltin(name)) {
			return { type: 'mcp' };
		}
		const target = this.getExecutionTarget(name);
		if (target === 'unknown') {
			return { type: 'unsupported' };
		}
		return { type: 'builtin', executionTarget: target };
	}

	/**
	 * Whether the MCP summarize/crop harness should run for this tool result.
	 */
	shouldSummarize(
		name: string,
		opts: {
			mcpSummarizeOutputs: boolean;
			mcpSummarizeAllTools: boolean;
		}
	): boolean {
		if (!opts.mcpSummarizeOutputs) return false;
		if (opts.mcpSummarizeAllTools) return true;
		return this.isMcp(name);
	}

	/**
	 * Tools the subagent is allowed to see.
	 *
	 * Mirrors the main model's palette with three explicit exclusions:
	 * - call_subagent  → prevent infinite recursive spawning
	 * - read_skill     → prevent skill context from ballooning the subagent prompt
	 * - list_skill     → prevent skill context from ballooning the subagent prompt
	 *
	 * Everything else — frontend builtins, backend builtins, and MCP tools —
	 * remains available to the subagent.
	 */
	getSubagentTools(allTools?: OpenAIToolDefinition[]): OpenAIToolDefinition[] {
		// NO recursive subagent, skills and todo list access
		const excluded = new Set([
			'call_subagent',
			'read_skill',
			'list_skill',
			'create_todo',
			'read_todo',
			'mark_todo'
		]);
		return (allTools ?? []).filter((t) => {
			const tName = t.function?.name;
			return tName && !excluded.has(tName);
		});
	}

	/**
	 * Decide how the subagent should execute a tool call.
	 * Returns 'builtin' if the name is a known builtin, otherwise 'mcp'.
	 */
	getSubagentDispatchTarget(name: string): 'builtin' | 'mcp' {
		return this.isBuiltin(name) ? 'builtin' : 'mcp';
	}
}

// ─── Internal helpers (moved from builtin-tools.ts) ─────────────────────────

/** Maps a single-tool setting key → the corresponding tool definition. */
const SETTING_KEY_TO_TOOL: Record<string, OpenAIToolDefinition> = {
	[SETTINGS_KEYS.BUILTIN_TOOL_CALCULATOR]: BUILTIN_TOOLS[0],
	[SETTINGS_KEYS.BUILTIN_TOOL_TIME]: BUILTIN_TOOLS[1],
	[SETTINGS_KEYS.BUILTIN_TOOL_LOCATION]: BUILTIN_TOOLS[2],
	[SETTINGS_KEYS.BUILTIN_TOOL_CALL_SUBAGENT]: BUILTIN_TOOLS[3],
	[SETTINGS_KEYS.BUILTIN_TOOL_RUN_COMMAND]: BUILTIN_TOOLS[13]
};

/** Maps a group setting key → the list of tool definitions it enables. */
const SETTING_KEY_TO_TOOL_GROUP: Record<string, OpenAIToolDefinition[]> = {
	[SETTINGS_KEYS.BUILTIN_TOOL_SKILLS]: [TOOL_LIST_SKILL, TOOL_READ_SKILL],
	[SETTINGS_KEYS.BUILTIN_TOOL_SAFE_FILE_TOOLS]: [
		TOOL_READ_FILE,
		TOOL_LIST_DIRECTORY,
		TOOL_SEARCH_FILES
	],
	[SETTINGS_KEYS.BUILTIN_TOOL_MUTATING_FILE_TOOLS]: [
		TOOL_WRITE_FILE,
		TOOL_PATCH_FILE,
		TOOL_DELETE_FILE,
		TOOL_MOVE_FILE
	],
	[SETTINGS_KEYS.BUILTIN_TOOL_TODO_LIST]: [TOOL_CREATE_TODO, TOOL_MARK_TODO, TOOL_READ_TODO]
};

function getActiveBuiltinToolsFromSettings(settings: SettingsConfigType): OpenAIToolDefinition[] {
	const tools: OpenAIToolDefinition[] = [];

	for (const [settingKey, toolDef] of Object.entries(SETTING_KEY_TO_TOOL)) {
		if (!settings[settingKey]) continue;

		if (
			settingKey === SETTINGS_KEYS.BUILTIN_TOOL_CALL_SUBAGENT &&
			!subagentConfigStore.isConfigured
		) {
			continue;
		}

		tools.push(toolDef);
	}

	for (const [settingKey, toolDefs] of Object.entries(SETTING_KEY_TO_TOOL_GROUP)) {
		if (!settings[settingKey]) continue;
		tools.push(...toolDefs);
	}

	return tools;
}
