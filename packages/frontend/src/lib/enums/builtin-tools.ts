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
	TOOL_READ_SKILL
} from '@shared/constants/prompts-and-tools';
import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
import type { SettingsConfigType } from '$lib/types';
import type { OpenAIToolDefinition } from '$lib/types';

export const BUILTIN_TOOL_NAMES = {
	CALCULATOR: 'calculator',
	GET_TIME: 'get_time',
	GET_LOCATION: 'get_location',
	CALL_SUBAGENT: 'call_subagent',
	LIST_SKILL: 'list_skill',
	READ_SKILL: 'read_skill',
	READ_FILE: 'read_file',
	WRITE_FILE: 'write_file',
	PATCH_FILE: 'patch_file',
	LIST_DIRECTORY: 'list_directory',
	SEARCH_FILES: 'search_files',
	DELETE_FILE: 'delete_file',
	MOVE_FILE: 'move_file',
	RUN_COMMAND: 'run_command'
} as const;

export type BuiltinToolName = (typeof BUILTIN_TOOL_NAMES)[keyof typeof BUILTIN_TOOL_NAMES];

export const builtinToolFields = [
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_CALCULATOR,
		label: 'Calculator',
		description:
			'Inject a calculator tool the model can call to evaluate arithmetic expressions without hallucinating results.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_TIME,
		label: 'Get time',
		description:
			'Inject a get_time tool the model can call to retrieve the current date, time, and timezone (respects TZ env var, defaults to UTC).'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_LOCATION,
		label: 'Get location',
		description:
			'Inject a get_location tool the model can call to retrieve your browser-reported geolocation (requires permission).'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_CALL_SUBAGENT,
		label: 'Subagent',
		description: 'Allow the main model to spawn a subagent to handle horizontal spanning tasks.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_SKILLS,
		label: 'Skills',
		description: 'Enable custom skill tools that the model can invoke for specialized capabilities.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_SAFE_FILE_TOOLS,
		label: 'Safe file tools',
		description:
			'Enable read-only filesystem tools (read_file, list_directory, search_files) that let the model probe the sandbox without modifying anything.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_MUTATING_FILE_TOOLS,
		label: 'Mutating file tools',
		description:
			'Enable write-capable filesystem tools (write_file, patch_file, delete_file, move_file) that let the model modify files in the sandbox. Use with caution.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_RUN_COMMAND,
		label: 'Run command',
		description:
			'Enable the run_command tool that lets the model execute whitelisted commands inside the sandbox. Each command also requires per-session user approval.'
	}
] as const;

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
	]
};

/** Routes tool execution: 'frontend' means browser-side switch, 'backend' means POST /api/tools/execute. */
export const BUILTIN_TOOL_EXECUTION_TARGET: Record<string, 'frontend' | 'backend'> = {
	calculator: 'frontend',
	get_time: 'frontend',
	get_location: 'frontend',
	call_subagent: 'frontend',
	list_skill: 'frontend',
	read_skill: 'frontend',
	read_file: 'backend',
	write_file: 'backend',
	patch_file: 'backend',
	list_directory: 'backend',
	search_files: 'backend',
	delete_file: 'backend',
	move_file: 'backend',
	run_command: 'backend'
};

/** Maps settings keys to execution target (derived from the tools each key enables). */
export const BUILTIN_TOOL_SETTING_KEY_TARGET: Record<string, 'frontend' | 'backend'> = {
	[SETTINGS_KEYS.BUILTIN_TOOL_CALCULATOR]: 'frontend',
	[SETTINGS_KEYS.BUILTIN_TOOL_TIME]: 'frontend',
	[SETTINGS_KEYS.BUILTIN_TOOL_LOCATION]: 'frontend',
	[SETTINGS_KEYS.BUILTIN_TOOL_CALL_SUBAGENT]: 'frontend',
	[SETTINGS_KEYS.BUILTIN_TOOL_SKILLS]: 'frontend',
	[SETTINGS_KEYS.BUILTIN_TOOL_SAFE_FILE_TOOLS]: 'backend',
	[SETTINGS_KEYS.BUILTIN_TOOL_MUTATING_FILE_TOOLS]: 'backend',
	[SETTINGS_KEYS.BUILTIN_TOOL_RUN_COMMAND]: 'backend'
};

export function getActiveBuiltinTools(settings: SettingsConfigType): OpenAIToolDefinition[] {
	const tools: OpenAIToolDefinition[] = [];

	for (const [settingKey, toolDef] of Object.entries(SETTING_KEY_TO_TOOL)) {
		if (!settings[settingKey]) continue;

		if (
			settingKey === SETTINGS_KEYS.BUILTIN_TOOL_CALL_SUBAGENT &&
			(!subagentConfigStore.isConfigured || !subagentConfigStore.isEnabled)
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

export function getBuiltinToolNames(): Set<string> {
	return new Set(BUILTIN_TOOLS.map((t) => t.function.name));
}
