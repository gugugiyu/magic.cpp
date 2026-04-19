import { SETTINGS_KEYS } from '$lib/constants';

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
