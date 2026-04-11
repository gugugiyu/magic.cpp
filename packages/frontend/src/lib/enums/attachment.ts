/**
 * Attachment type enum for database message extras
 */
export enum AttachmentType {
	AUDIO = 'AUDIO',
	IMAGE = 'IMAGE',
	MCP_PROMPT = 'MCP_PROMPT',
	MCP_RESOURCE = 'MCP_RESOURCE',
	MCP_SUMMARY = 'MCP_SUMMARY',
	PDF = 'PDF',
	TEXT = 'TEXT',
	LEGACY_CONTEXT = 'context' // Legacy attachment type for backward compatibility
}
