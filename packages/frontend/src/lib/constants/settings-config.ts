import { ColorMode } from '$lib/enums/ui';
import { Monitor, Moon, Sun } from '@lucide/svelte';

export const SETTING_CONFIG_DEFAULT: Record<string, string | number | boolean | undefined> = {
	// Note: in order not to introduce breaking changes, please keep the same data type (number, string, etc) if you want to change the default value.
	// Do not use nested objects, keep it single level. Prefix the key if you need to group them.
	// apiKey: removed - backend handles API key centrally
	systemMessage: '',
	showSystemMessage: true,
	theme: ColorMode.SYSTEM,
	showThoughtInProgress: true,
	disableReasoningParsing: false,
	excludeReasoningFromContext: false,
	showRawOutputSwitch: false,
	keepStatsVisible: false,
	showMessageStats: true,
	askForTitleConfirmation: false,
	titleGenerationUseFirstLine: false,
	pasteLongTextToFileLen: 2500,
	copyTextAttachmentsAsPlainText: false,
	pdfAsImage: false,
	disableAutoScroll: false,
	renderUserContentAsMarkdown: false,
	alwaysShowSidebarOnDesktop: false,
	autoShowSidebarOnNewChat: true,
	autoMicOnEmpty: false,
	fullHeightCodeBlocks: false,
	showRawModelNames: false,
	mcpServers: '[]',
	mcpServerUsageStats: '{}', // JSON object: { [serverId]: usageCount }
	agenticMaxTurns: 10,
	agenticMaxToolPreviewLines: 25,
	agenticMaxToolCallsPerTurn: 10,
	showToolCallInProgress: true,
	alwaysShowAgenticTurns: false,
	mcpSummarizeOutputs: false,
	mcpSummarizeLineThreshold: 400,
	mcpSummarizeHardCap: 800,
	mcpSummarizeAllTools: false,
	mcpSummarizeAutoTimeout: 5,
	// filter settings
	filterEmojiRemoval: false,
	filterCodeblockOnly: false,
	filterRawMode: false,
	filterLanguagePinner: false,
	filterNormalizeMarkdown: true,
	// sampling params: empty means "use server default"
	// the server / preset is the source of truth
	// empty values are shown as placeholders from /props in the UI
	// and are NOT sent in API requests, letting the server decide
	samplers: '',
	backend_sampling: false,
	temperature: undefined,
	dynatemp_range: undefined,
	dynatemp_exponent: undefined,
	top_k: undefined,
	top_p: undefined,
	min_p: undefined,
	xtc_probability: undefined,
	xtc_threshold: undefined,
	typ_p: undefined,
	repeat_last_n: undefined,
	repeat_penalty: undefined,
	presence_penalty: undefined,
	frequency_penalty: undefined,
	dry_multiplier: undefined,
	dry_base: undefined,
	dry_allowed_length: undefined,
	dry_penalty_last_n: undefined,
	max_tokens: undefined,
	custom: '', // custom json-stringified object
	// built-in tools
	builtinToolCalculator: false,
	builtinToolTime: false,
	builtinToolLocation: false,
	builtinToolCallSubagent: false,
	builtinToolSkills: false,
	builtinToolSafeFileTools: false,
	builtinToolMutatingFileTools: false,
	builtinToolRunCommand: false,
	// experimental features
	pyInterpreterEnabled: false,
	enableContinueGeneration: false
};

export const SETTING_CONFIG_INFO: Record<string, string> = {
	// apiKey: removed - backend handles API key centrally
	systemMessage: 'The starting message that defines how model should behave.',
	showSystemMessage: 'Display the system message at the top of each conversation.',
	theme:
		'Choose the color theme for the interface. You can choose between System (follows your device settings), Light, or Dark.',
	pasteLongTextToFileLen:
		'On pasting long text to file, it will be converted to a file. You can control the file length by setting the value of this parameter. Value 0 means disable.',
	copyTextAttachmentsAsPlainText:
		'When copying a message with text attachments, combine them into a single plain text string instead of a special format that can be pasted back as attachments.',
	samplers:
		'The order at which samplers are applied, in simplified way. Default is "top_k;typ_p;top_p;min_p;temperature": top_k->typ_p->top_p->min_p->temperature',
	backend_sampling:
		'Enable backend-based samplers. When enabled, supported samplers run on the accelerator backend for faster sampling.',
	temperature:
		'Controls the randomness of the generated text by affecting the probability distribution of the output tokens. Higher = more random, lower = more focused.',
	dynatemp_range:
		'Addon for the temperature sampler. The added value to the range of dynamic temperature, which adjusts probabilities by entropy of tokens.',
	dynatemp_exponent:
		'Addon for the temperature sampler. Smoothes out the probability redistribution based on the most probable token.',
	top_k: 'Keeps only k top tokens.',
	top_p: 'Limits tokens to those that together have a cumulative probability of at least p',
	min_p:
		'Limits tokens based on the minimum probability for a token to be considered, relative to the probability of the most likely token.',
	xtc_probability:
		'XTC sampler cuts out top tokens; this parameter controls the chance of cutting tokens at all. 0 disables XTC.',
	xtc_threshold:
		'XTC sampler cuts out top tokens; this parameter controls the token probability that is required to cut that token.',
	typ_p: 'Sorts and limits tokens based on the difference between log-probability and entropy.',
	repeat_last_n: 'Last n tokens to consider for penalizing repetition',
	repeat_penalty: 'Controls the repetition of token sequences in the generated text',
	presence_penalty: 'Limits tokens based on whether they appear in the output or not.',
	frequency_penalty: 'Limits tokens based on how often they appear in the output.',
	dry_multiplier:
		'DRY sampling reduces repetition in generated text even across long contexts. This parameter sets the DRY sampling multiplier.',
	dry_base:
		'DRY sampling reduces repetition in generated text even across long contexts. This parameter sets the DRY sampling base value.',
	dry_allowed_length:
		'DRY sampling reduces repetition in generated text even across long contexts. This parameter sets the allowed length for DRY sampling.',
	dry_penalty_last_n:
		'DRY sampling reduces repetition in generated text even across long contexts. This parameter sets DRY penalty for the last n tokens.',
	max_tokens: 'The maximum number of token per output. Use -1 for infinite (no limit).',
	custom: 'Custom JSON parameters to send to the API. Must be valid JSON format.',
	showThoughtInProgress: 'Expand thought process by default when generating messages.',
	disableReasoningParsing:
		'Send reasoning_format=none to prevent server-side extraction of reasoning tokens into separate field',
	excludeReasoningFromContext:
		'Strip reasoning content from previous messages before sending to the model. When unchecked, reasoning is sent back via the reasoning_content field so the model can see its own chain-of-thought across turns.',
	showRawOutputSwitch:
		'Show toggle button to display messages as plain text instead of Markdown-formatted content',
	keepStatsVisible: 'Keep processing statistics visible after generation finishes.',
	showMessageStats:
		'Display generation statistics (tokens/second, token count, duration) below each assistant message.',
	askForTitleConfirmation:
		'Ask for confirmation before automatically changing conversation title when editing the first message.',
	titleGenerationUseFirstLine:
		'Use only the first non-empty line of the prompt to generate the conversation title.',
	pdfAsImage:
		'Parse PDF as image instead of text. Automatically falls back to text processing for non-vision models.',
	disableAutoScroll:
		'Disable automatic scrolling while messages stream so you can control the viewport position manually.',
	renderUserContentAsMarkdown: 'Render user messages using markdown formatting in the chat.',
	alwaysShowSidebarOnDesktop:
		'Always keep the sidebar visible on desktop instead of auto-hiding it.',
	autoShowSidebarOnNewChat:
		'Automatically show sidebar when starting a new chat. Disable to keep the sidebar hidden until you click on it.',
	autoMicOnEmpty:
		'Automatically show microphone button instead of send button when textarea is empty for models with audio modality support.',
	fullHeightCodeBlocks:
		'Always display code blocks at their full natural height, overriding any height limits.',
	showRawModelNames:
		'Display full raw model identifiers (e.g. "ggml-org/GLM-4.7-Flash-GGUF:Q8_0") instead of parsed names with badges.',
	mcpServers:
		'Configure MCP servers as a JSON list. Use the form in the MCP Client settings section to edit.',
	mcpServerUsageStats:
		'Usage statistics for MCP servers. Tracks how many times tools from each server have been used.',
	agenticMaxTurns:
		'Maximum number of tool execution cycles before stopping (prevents infinite loops).',
	agenticMaxToolPreviewLines:
		'Number of lines shown in tool output previews (last N lines). Only these previews and the final LLM response persist after the agentic loop completes.',
	agenticMaxToolCallsPerTurn:
		'Maximum number of tool calls the model may execute in a single turn. Excess calls are dropped and a warning is appended to the context. Prevents runaway parallel tool storms.',
	showToolCallInProgress:
		'Automatically expand tool call details while executing and keep them expanded after completion.',
	mcpSummarizeOutputs:
		'When enabled, long tool outputs exceeding the line threshold will trigger a pause, letting you choose to keep raw output or auto-summarize via subagent for token efficiency.',
	mcpSummarizeLineThreshold:
		'Line count threshold for tool output summarization. Outputs exceeding this limit will prompt the summarization dialog.',
	mcpSummarizeHardCap:
		'Hard line cap for tool outputs. When exceeded, output is immediately trimmed to show head+tail with a [... X lines trimmed ...] marker. Set to -1 to disable.',
	mcpSummarizeAllTools:
		'When enabled, the summarization threshold also applies to built-in tool outputs (calculator, time, location, etc.), not just MCP tools.',
	mcpSummarizeAutoTimeout:
		'Seconds before the summarize dialog auto-selects "Keep raw output". Set to 0 to disable the auto-timeout.',
	filterEmojiRemoval:
		'Remove all emoji characters from model responses. Applied after the full response is received.',
	filterCodeblockOnly:
		'Keep only the first code block in the response, discarding all surrounding text. If no code block is found, the full response is kept.',
	filterRawMode: 'Strip all Markdown formatting and display responses as plain text.',
	filterLanguagePinner:
		'Detect a language tag in your message (e.g. ![en] or ![fr]) and automatically instruct the model to respond in that language.',
	filterNormalizeMarkdown:
		'Perform various normalization and correction tasks on LLM output, recommended.',
	builtinToolCalculator:
		'Inject a calculator tool the model can call to evaluate arithmetic expressions without hallucinating results.',
	builtinToolTime:
		'Inject a get_time tool the model can call to retrieve the current date, time, and timezone (respects TZ env var, defaults to UTC).',
	builtinToolLocation:
		'Inject a get_location tool the model can call to retrieve your browser-reported geolocation (requires permission).',
	builtinToolCallSubagent:
		'Inject a call_subagent tool that delegates tasks to a separate subagent model on a different endpoint.',
	builtinToolSkills:
		'Inject skill tools that the model can invoke to access custom capabilities defined in skill files.',
	builtinToolRunCommand:
		'Enable the run_command tool that lets the model execute whitelisted commands inside the sandbox. Each command also requires per-session user approval.',
	pyInterpreterEnabled:
		'Enable Python interpreter using Pyodide. Allows running Python code in markdown code blocks.',
	enableContinueGeneration:
		'Enable "Continue" button for assistant messages. Currently works only with non-reasoning models.'
};

export const SETTINGS_COLOR_MODES_CONFIG = [
	{ value: ColorMode.SYSTEM, label: 'System', icon: Monitor },
	{ value: ColorMode.LIGHT, label: 'Light', icon: Sun },
	{ value: ColorMode.DARK, label: 'Dark', icon: Moon }
];
