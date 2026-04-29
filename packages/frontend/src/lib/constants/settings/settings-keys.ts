/**
 * Settings key constants for ChatSettings configuration.
 *
 * These keys correspond to properties in SettingsConfigType and are used
 * in settings field configurations to ensure consistency.
 */
export const SETTINGS_KEYS = {
	// General
	THEME: 'theme',
	// apiKey: removed - backend handles API key centrally
	SYSTEM_MESSAGE: 'systemMessage',
	PASTE_LONG_TEXT_TO_FILE_LEN: 'pasteLongTextToFileLen',
	COPY_TEXT_ATTACHMENTS_AS_PLAIN_TEXT: 'copyTextAttachmentsAsPlainText',
	ENABLE_CONTINUE_GENERATION: 'enableContinueGeneration',
	PDF_AS_IMAGE: 'pdfAsImage',
	ASK_FOR_TITLE_CONFIRMATION: 'askForTitleConfirmation',
	TITLE_GENERATION_USE_FIRST_LINE: 'titleGenerationUseFirstLine',
	// Display
	SHOW_MESSAGE_STATS: 'showMessageStats',
	TOKEN_COUNTER: 'tokenCounter',
	SHOW_THOUGHT_IN_PROGRESS: 'showThoughtInProgress',
	KEEP_STATS_VISIBLE: 'keepStatsVisible',
	AUTO_MIC_ON_EMPTY: 'autoMicOnEmpty',
	RENDER_USER_CONTENT_AS_MARKDOWN: 'renderUserContentAsMarkdown',
	DISABLE_AUTO_SCROLL: 'disableAutoScroll',
	ALWAYS_SHOW_SIDEBAR_ON_DESKTOP: 'alwaysShowSidebarOnDesktop',
	AUTO_SHOW_SIDEBAR_ON_NEW_CHAT: 'autoShowSidebarOnNewChat',
	FULL_HEIGHT_CODE_BLOCKS: 'fullHeightCodeBlocks',
	SHOW_RAW_MODEL_NAMES: 'showRawModelNames',
	ANIMATION_SPEED: 'animationSpeed',
	// Sampling
	TEMPERATURE: 'temperature',
	DYNATEMP_RANGE: 'dynatemp_range',
	DYNATEMP_EXPONENT: 'dynatemp_exponent',
	TOP_K: 'top_k',
	TOP_P: 'top_p',
	MIN_P: 'min_p',
	XTC_PROBABILITY: 'xtc_probability',
	XTC_THRESHOLD: 'xtc_threshold',
	TYP_P: 'typ_p',
	MAX_TOKENS: 'max_tokens',
	SAMPLERS: 'samplers',
	BACKEND_SAMPLING: 'backend_sampling',
	// Penalties
	REPEAT_LAST_N: 'repeat_last_n',
	REPEAT_PENALTY: 'repeat_penalty',
	PRESENCE_PENALTY: 'presence_penalty',
	FREQUENCY_PENALTY: 'frequency_penalty',
	DRY_MULTIPLIER: 'dry_multiplier',
	DRY_BASE: 'dry_base',
	DRY_ALLOWED_LENGTH: 'dry_allowed_length',
	DRY_PENALTY_LAST_N: 'dry_penalty_last_n',
	// MCP
	AGENTIC_MAX_TURNS: 'agenticMaxTurns',
	MCP_SUMMARIZE_OUTPUTS: 'mcpSummarizeOutputs',
	MCP_SUMMARIZE_LINE_THRESHOLD: 'mcpSummarizeLineThreshold',
	MCP_SUMMARIZE_HARD_CAP: 'mcpSummarizeHardCap',
	MCP_SUMMARIZE_ALL_TOOLS: 'mcpSummarizeAllTools',
	MCP_SUMMARIZE_AUTO_TIMEOUT: 'mcpSummarizeAutoTimeout',
	// Built-in tools
	BUILTIN_TOOL_CALCULATOR: 'builtinToolCalculator',
	BUILTIN_TOOL_TIME: 'builtinToolTime',
	BUILTIN_TOOL_LOCATION: 'builtinToolLocation',
	BUILTIN_TOOL_CALL_SUBAGENT: 'builtinToolCallSubagent',
	BUILTIN_TOOL_SKILLS: 'builtinToolSkills',
	BUILTIN_TOOL_SAFE_FILE_TOOLS: 'builtinToolSafeFileTools',
	BUILTIN_TOOL_MUTATING_FILE_TOOLS: 'builtinToolMutatingFileTools',
	BUILTIN_TOOL_RUN_COMMAND: 'builtinToolRunCommand',
	BUILTIN_TOOL_TODO_LIST: 'builtinToolTodoList',
	ALWAYS_SHOW_AGENTIC_TURNS: 'alwaysShowAgenticTurns',
	AGENTIC_MAX_TOOL_PREVIEW_LINES: 'agenticMaxToolPreviewLines',
	SHOW_TOOL_CALL_IN_PROGRESS: 'showToolCallInProgress',
	// Filter
	FILTER_EMOJI_REMOVAL: 'filterEmojiRemoval',
	FILTER_CODEBLOCK_ONLY: 'filterCodeblockOnly',
	FILTER_RAW_MODE: 'filterRawMode',
	FILTER_LANGUAGE_PINNER: 'filterLanguagePinner',
	FILTER_NORMALIZE_MARKDOWN: 'filterNormalizeMarkdown',
	// Developer
	DISABLE_REASONING_PARSING: 'disableReasoningParsing',
	EXCLUDE_REASONING_FROM_CONTEXT: 'excludeReasoningFromContext',
	SHOW_RAW_OUTPUT_SWITCH: 'showRawOutputSwitch',
	CUSTOM: 'custom'
} as const;
