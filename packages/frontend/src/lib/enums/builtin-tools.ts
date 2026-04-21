import { SETTINGS_KEYS } from '$lib/constants';
import { BUILTIN_TOOLS } from '@shared/constants/prompts-and-tools';
import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
import type { SettingsConfigType } from '$lib/types';
import type { OpenAIToolDefinition } from '$lib/types';

export const BUILTIN_TOOL_NAMES = {
	CALCULATOR: 'calculator',
	GET_TIME: 'get_time',
	GET_LOCATION: 'get_location',
	SEQUENTIAL_THINKING: 'sequential_thinking',
	CALL_SUBAGENT: 'call_subagent',
	LIST_SKILL: 'list_skill',
	READ_SKILL: 'read_skill'
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
		key: SETTINGS_KEYS.BUILTIN_TOOL_SEQUENTIAL_THINKING,
		label: 'Sequential thinking',
		description:
			'Inject a sequential_thinking tool that lets the model break problems into explicit reasoning steps before answering.'
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
	}
] as const;

const SETTING_KEY_TO_TOOL: Record<string, OpenAIToolDefinition> = {
	[SETTINGS_KEYS.BUILTIN_TOOL_CALCULATOR]: BUILTIN_TOOLS[0],
	[SETTINGS_KEYS.BUILTIN_TOOL_TIME]: BUILTIN_TOOLS[1],
	[SETTINGS_KEYS.BUILTIN_TOOL_LOCATION]: BUILTIN_TOOLS[2],
	[SETTINGS_KEYS.BUILTIN_TOOL_SEQUENTIAL_THINKING]: BUILTIN_TOOLS[3],
	[SETTINGS_KEYS.BUILTIN_TOOL_CALL_SUBAGENT]: BUILTIN_TOOLS[4],
	[SETTINGS_KEYS.BUILTIN_TOOL_SKILLS]: BUILTIN_TOOLS[5]
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

	return tools;
}

export function getBuiltinToolNames(): Set<string> {
	return new Set(BUILTIN_TOOLS.map((t) => t.function.name));
}
