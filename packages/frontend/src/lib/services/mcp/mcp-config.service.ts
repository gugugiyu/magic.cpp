import { detectMcpTransportFromUrl, getProxiedUrlString, getFaviconUrl } from '$lib/utils';
import {
	DEFAULT_MCP_CONFIG,
	EXPECTED_THEMED_ICON_PAIR_COUNT,
	MCP_ALLOWED_ICON_MIME_TYPES,
	MCP_SERVER_ID_PREFIX
} from '$lib/constants';
import { ColorMode, UrlProtocol } from '$lib/enums';
import type {
	MCPServerSettingsEntry,
	MCPServerConfig,
	MCPClientConfig,
	MCPResourceIcon,
	McpServerOverride
} from '$lib/types';
import type { SettingsConfigType } from '$lib/types/settings';

export class McpConfigService {
	static generateServerId(id: unknown, index: number): string {
		if (typeof id === 'string' && id.trim()) {
			return id.trim();
		}
		return `${MCP_SERVER_ID_PREFIX}-${index + 1}`;
	}

	static parseServerSettings(rawServers: unknown): MCPServerSettingsEntry[] {
		if (!rawServers) {
			return [];
		}

		let parsed: unknown;
		if (typeof rawServers === 'string') {
			const trimmed = rawServers.trim();
			if (!trimmed) {
				return [];
			}
			try {
				parsed = JSON.parse(trimmed);
			} catch (error) {
				console.warn('[McpConfigService] Failed to parse mcpServers JSON:', error);
				return [];
			}
		} else {
			parsed = rawServers;
		}
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.map((entry, index) => {
			const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
			const headers = typeof entry?.headers === 'string' ? entry.headers.trim() : undefined;

			return {
				id: this.generateServerId((entry as { id?: unknown })?.id, index),
				enabled: Boolean((entry as { enabled?: unknown })?.enabled),
				url,
				name: (entry as { name?: string })?.name,
				requestTimeoutSeconds: DEFAULT_MCP_CONFIG.requestTimeoutSeconds,
				headers: headers || undefined,
				useProxy: Boolean((entry as { useProxy?: unknown })?.useProxy)
			} satisfies MCPServerSettingsEntry;
		});
	}

	static buildServerConfig(
		entry: MCPServerSettingsEntry,
		connectionTimeoutMs = DEFAULT_MCP_CONFIG.connectionTimeoutMs
	): MCPServerConfig | undefined {
		if (!entry?.url) {
			return undefined;
		}

		let headers: Record<string, string> | undefined;
		if (entry.headers) {
			try {
				const parsed = JSON.parse(entry.headers);
				if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
					headers = parsed as Record<string, string>;
			} catch {
				console.warn('[McpConfigService] Failed to parse custom headers JSON:', entry.headers);
			}
		}

		return {
			url: entry.url,
			transport: detectMcpTransportFromUrl(entry.url),
			handshakeTimeoutMs: connectionTimeoutMs,
			requestTimeoutMs: Math.round(entry.requestTimeoutSeconds * 1000),
			headers,
			useProxy: entry.useProxy
		};
	}

	static checkServerEnabled(
		server: MCPServerSettingsEntry,
		perChatOverrides?: McpServerOverride[]
	): boolean {
		const override = perChatOverrides?.find((o) => o.serverId === server.id);
		return override?.enabled ?? false;
	}

	static buildMcpClientConfig(
		cfg: SettingsConfigType,
		perChatOverrides?: McpServerOverride[]
	): MCPClientConfig | undefined {
		const rawServers = this.parseServerSettings(cfg.mcpServers);
		if (!rawServers.length) {
			return undefined;
		}

		const servers: Record<string, MCPServerConfig> = {};

		for (const [index, entry] of rawServers.entries()) {
			if (!this.checkServerEnabled(entry, perChatOverrides)) continue;
			const normalized = this.buildServerConfig(entry);
			if (normalized) servers[this.generateServerId(entry.id, index)] = normalized;
		}

		if (Object.keys(servers).length === 0) {
			return undefined;
		}

		return {
			protocolVersion: DEFAULT_MCP_CONFIG.protocolVersion,
			capabilities: DEFAULT_MCP_CONFIG.capabilities,
			clientInfo: DEFAULT_MCP_CONFIG.clientInfo,
			requestTimeoutMs: Math.round(DEFAULT_MCP_CONFIG.requestTimeoutSeconds * 1000),
			servers
		};
	}

	static parseHeaders(headersJson?: string): Record<string, string> | undefined {
		if (!headersJson?.trim()) {
			return undefined;
		}

		try {
			const parsed = JSON.parse(headersJson);
			if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
				return parsed as Record<string, string>;
		} catch {
			console.warn('[McpConfigService] Failed to parse custom headers JSON:', headersJson);
		}

		return undefined;
	}
}

export class McpIconService {
	static isValidIconUri(src: string): boolean {
		try {
			if (src.startsWith(UrlProtocol.DATA)) return true;
			const url = new URL(src);
			return url.protocol === UrlProtocol.HTTPS;
		} catch {
			return false;
		}
	}

	static proxyIconSrc(src: string, proxyAvailable: boolean): string {
		if (src.startsWith('data:')) return src;
		if (!proxyAvailable) return src;
		return getProxiedUrlString(src);
	}

	static getMcpIconUrl(
		icons: MCPResourceIcon[] | undefined,
		isDark = false,
		proxyAvailable = false
	): string | null {
		if (!icons?.length) return null;

		const validIcons = icons.filter((icon) => {
			if (!icon.src || !this.isValidIconUri(icon.src)) return false;
			if (icon.mimeType && !MCP_ALLOWED_ICON_MIME_TYPES.has(icon.mimeType)) return false;
			return true;
		});

		if (validIcons.length === 0) return null;

		const preferredTheme = isDark ? ColorMode.DARK : ColorMode.LIGHT;

		const themedIcon = validIcons.find((icon) => icon.theme === preferredTheme);
		if (themedIcon) return this.proxyIconSrc(themedIcon.src, proxyAvailable);

		const universalIcons = validIcons.filter((icon) => !icon.theme);

		if (universalIcons.length === EXPECTED_THEMED_ICON_PAIR_COUNT) {
			return this.proxyIconSrc(universalIcons[isDark ? 1 : 0].src, proxyAvailable);
		}

		if (universalIcons.length > 0) {
			return this.proxyIconSrc(universalIcons[0].src, proxyAvailable);
		}

		return this.proxyIconSrc(validIcons[0].src, proxyAvailable);
	}

	static getServerFavicon(
		server: MCPServerSettingsEntry | undefined,
		healthState: { status: string; serverInfo?: { icons?: MCPResourceIcon[] } } | undefined,
		currentColorMode: string,
		proxyAvailable: boolean
	): string | null {
		if (!server) {
			return null;
		}

		const isDark = currentColorMode === ColorMode.DARK;
		if (healthState?.status === 'success' && healthState.serverInfo?.icons) {
			const mcpIconUrl = this.getMcpIconUrl(healthState.serverInfo.icons, isDark, proxyAvailable);
			if (mcpIconUrl) {
				return mcpIconUrl;
			}
		}

		return getFaviconUrl(server.url, proxyAvailable);
	}
}
