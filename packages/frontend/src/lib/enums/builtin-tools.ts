import { SETTINGS_KEYS } from '$lib/constants';
import { BUILTIN_TOOLS } from '@shared/constants/prompts-and-tools';

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
	RUN_COMMAND: 'run_command',
	CREATE_TODO: 'create_todo',
	MARK_TODO: 'mark_todo',
	READ_TODO: 'read_todo'
} as const;

export type BuiltinToolName = (typeof BUILTIN_TOOL_NAMES)[keyof typeof BUILTIN_TOOL_NAMES];

export const builtinToolFields = [
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_CALCULATOR,
		label: 'Calculator',
		iconColor: 'var(--info)',
		description:
			'Inject a calculator tool the model can call to evaluate arithmetic expressions without hallucinating results.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_TIME,
		label: 'Get time',
		iconColor: 'var(--warning)',
		description:
			'Inject a get_time tool the model can call to retrieve the current date, time, and timezone (respects TZ env var, defaults to UTC).'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_LOCATION,
		label: 'Get location',
		iconColor: 'var(--purple)',
		description:
			'Inject a get_location tool the model can call to retrieve your browser-reported geolocation (requires permission).'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_CALL_SUBAGENT,
		label: 'Subagent',
		iconColor: 'var(--cyan)',
		description:
			'Allow the main model to spawn a subagent to handle horizontal spanning tasks. (Must configured endpoint in Connections tab)'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_SKILLS,
		label: 'Skills',
		iconColor: 'var(--purple)',
		description: 'Enable custom skill tools that the model can invoke for specialized capabilities.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_SAFE_FILE_TOOLS,
		label: 'Safe file tools',
		iconColor: 'var(--info)',
		description:
			'Enable read-only filesystem tools (read_file, list_directory, search_files) that let the model probe the sandbox without modifying anything.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_MUTATING_FILE_TOOLS,
		label: 'Mutating file tools',
		iconColor: 'var(--success)',
		description:
			'Enable write-capable filesystem tools (write_file, patch_file, delete_file, move_file) that let the model modify files in the sandbox. Use with caution.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_RUN_COMMAND,
		label: 'Run command',
		iconColor: 'var(--destructive)',
		description:
			'Enable the run_command tool that lets the model execute whitelisted commands inside the sandbox. Each command also requires per-session user approval.'
	},
	{
		key: SETTINGS_KEYS.BUILTIN_TOOL_TODO_LIST,
		label: 'Todo list',
		iconColor: 'var(--success)',
		description:
			'Enable todo list tools (create_todo, mark_todo) that let the model create and mark tasks for the current conversation.'
	}
] as const;

/** Routes tool execution: 'frontend' means browser-side switch, 'backend' means POST /api/tools/execute. */
export const BUILTIN_TOOL_EXECUTION_TARGET: Record<string, 'frontend' | 'backend'> = {
	calculator: 'frontend',
	get_time: 'backend',
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
	run_command: 'backend',
	create_todo: 'frontend',
	mark_todo: 'frontend',
	read_todo: 'frontend'
};

/** Maps settings keys to the tool names they enable. */
const SETTINGS_KEY_TO_TOOLS: Record<string, string[]> = {
	[SETTINGS_KEYS.BUILTIN_TOOL_CALCULATOR]: ['calculator'],
	[SETTINGS_KEYS.BUILTIN_TOOL_TIME]: ['get_time'],
	[SETTINGS_KEYS.BUILTIN_TOOL_LOCATION]: ['get_location'],
	[SETTINGS_KEYS.BUILTIN_TOOL_CALL_SUBAGENT]: ['call_subagent'],
	[SETTINGS_KEYS.BUILTIN_TOOL_SKILLS]: ['list_skill', 'read_skill'],
	[SETTINGS_KEYS.BUILTIN_TOOL_SAFE_FILE_TOOLS]: ['read_file', 'list_directory', 'search_files'],
	[SETTINGS_KEYS.BUILTIN_TOOL_MUTATING_FILE_TOOLS]: [
		'write_file',
		'patch_file',
		'delete_file',
		'move_file'
	],
	[SETTINGS_KEYS.BUILTIN_TOOL_RUN_COMMAND]: ['run_command'],
	[SETTINGS_KEYS.BUILTIN_TOOL_TODO_LIST]: ['create_todo', 'mark_todo', 'read_todo']
};

/**
 * Maps settings keys to execution target (derived from BUILTIN_TOOL_EXECUTION_TARGET).
 * If any tool enabled by the setting is 'backend', the setting is marked as 'backend'.
 */
export const BUILTIN_TOOL_SETTING_KEY_TARGET: Record<string, 'frontend' | 'backend'> =
	Object.fromEntries(
		Object.entries(SETTINGS_KEY_TO_TOOLS).map(([key, tools]) => {
			const target = tools.some((tool) => BUILTIN_TOOL_EXECUTION_TARGET[tool] === 'backend')
				? 'backend'
				: 'frontend';
			return [key, target];
		})
	);

export function getBuiltinToolNames(): Set<string> {
	return new Set(BUILTIN_TOOLS.map((t) => t.function.name));
}
