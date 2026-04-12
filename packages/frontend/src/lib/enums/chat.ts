// Re-export shared enums for backward compatibility
export { MessageRole, MessageType } from '@shared/enums/chat';

// Frontend-only enums
export enum ChatMessageStatsView {
	GENERATION = 'generation',
	READING = 'reading',
	TOOLS = 'tools',
	SUMMARY = 'summary'
}

/**
 * Reasoning format options for API requests.
 */
export enum ReasoningFormat {
	NONE = 'none',
	AUTO = 'auto'
}

/**
 * Content part types for API chat message content.
 */
export enum ContentPartType {
	TEXT = 'text',
	IMAGE_URL = 'image_url',
	INPUT_AUDIO = 'input_audio'
}

/**
 * Error dialog types for displaying server/timeout errors.
 */
export enum ErrorDialogType {
	TIMEOUT = 'timeout',
	SERVER = 'server'
}
