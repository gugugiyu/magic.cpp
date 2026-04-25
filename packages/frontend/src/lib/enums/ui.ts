export enum ColorMode {
	LIGHT = 'light',
	DARK = 'dark',
	SYSTEM = 'system',
	TOKYO_NIGHT = 'tokyo-night',
	EVERFOREST = 'everforest'
}

export enum AnimationSpeed {
	NONE = 'none',
	SLOW = 'slow',
	BASE = 'base',
	FAST = 'fast'
}

/**
 * MCP prompt display variant
 */
export enum McpPromptVariant {
	MESSAGE = 'message',
	ATTACHMENT = 'attachment'
}

/**
 * URL prefixes for protocol detection
 */
export enum UrlProtocol {
	DATA = 'data:',
	HTTP = 'http://',
	HTTPS = 'https://',
	WEBSOCKET = 'ws://',
	WEBSOCKET_SECURE = 'wss://'
}
