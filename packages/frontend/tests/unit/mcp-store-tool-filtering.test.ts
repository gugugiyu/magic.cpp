import { describe, it, expect, beforeEach } from 'vitest';
import { mcpStore, isToolDisabled } from '$lib/stores/mcp.svelte';
import type { MCPConnection, Tool } from '$lib/types';

type MCPStoreInternals = {
	connections: Map<string, Partial<MCPConnection>>;
	toolsIndex: Map<string, string>;
};

function getStoreInternals() {
	return mcpStore as unknown as MCPStoreInternals;
}

describe('mcpStore.getToolDefinitionsForLLM', () => {
	beforeEach(() => {
		// Clear internal state between tests
		getStoreInternals().connections.clear();
		getStoreInternals().toolsIndex.clear();
	});

	function makeTool(name: string, description?: string): Tool {
		return {
			name,
			description,
			inputSchema: { type: 'object', properties: {}, required: [] }
		} as Tool;
	}

	function addMockConnection(serverName: string, tools: Tool[]) {
		const connection: Partial<MCPConnection> = {
			serverName,
			tools,
			transportType: 'websocket' as const,
			connectionTimeMs: 100
		};
		getStoreInternals().connections.set(serverName, connection);
		for (const tool of tools) {
			if (tool.name) {
				getStoreInternals().toolsIndex.set(tool.name, serverName);
			}
		}
	}

	it('returns all tools when no overrides are provided', () => {
		addMockConnection('server1', [
			makeTool('search', 'Search the web'),
			makeTool('read', 'Read a file')
		]);

		const tools = mcpStore.getToolDefinitionsForLLM();
		expect(tools).toHaveLength(2);
		expect(tools.map((t) => t.function.name)).toContain('search');
		expect(tools.map((t) => t.function.name)).toContain('read');
	});

	it('excludes tools listed in disabledTools override', () => {
		addMockConnection('server1', [
			makeTool('search', 'Search the web'),
			makeTool('read', 'Read a file'),
			makeTool('write', 'Write a file')
		]);

		const tools = mcpStore.getToolDefinitionsForLLM([
			{ serverId: 'server1', enabled: true, disabledTools: ['read'] }
		]);
		expect(tools).toHaveLength(2);
		expect(tools.map((t) => t.function.name)).toContain('search');
		expect(tools.map((t) => t.function.name)).toContain('write');
		expect(tools.map((t) => t.function.name)).not.toContain('read');
	});

	it('filters tools from multiple servers independently', () => {
		addMockConnection('server1', [makeTool('search'), makeTool('read')]);
		addMockConnection('server2', [makeTool('calculate'), makeTool('plot')]);

		const tools = mcpStore.getToolDefinitionsForLLM([
			{ serverId: 'server1', enabled: true, disabledTools: ['read'] },
			{ serverId: 'server2', enabled: true, disabledTools: ['plot'] }
		]);
		expect(tools).toHaveLength(2);
		expect(tools.map((t) => t.function.name)).toContain('search');
		expect(tools.map((t) => t.function.name)).toContain('calculate');
	});

	it('ignores overrides for servers that are not in toolsIndex', () => {
		addMockConnection('server1', [makeTool('search')]);

		const tools = mcpStore.getToolDefinitionsForLLM([
			{ serverId: 'server2', enabled: true, disabledTools: ['search'] }
		]);
		expect(tools).toHaveLength(1);
		expect(tools[0].function.name).toBe('search');
	});

	it('disabling all tools from a server results in empty list for that server', () => {
		addMockConnection('server1', [makeTool('search'), makeTool('read')]);

		const tools = mcpStore.getToolDefinitionsForLLM([
			{ serverId: 'server1', enabled: true, disabledTools: ['search', 'read'] }
		]);
		expect(tools).toHaveLength(0);
	});

	it('preserves tool schema in returned definitions', () => {
		addMockConnection('server1', [
			{
				name: 'search',
				description: 'Search',
				inputSchema: {
					type: 'object',
					properties: { query: { type: 'string' } },
					required: ['query']
				}
			} as Tool
		]);

		const tools = mcpStore.getToolDefinitionsForLLM();
		expect(tools).toHaveLength(1);
		expect(tools[0].function.parameters).toEqual({
			type: 'object',
			properties: { query: { type: 'string' } },
			required: ['query']
		});
	});
});

describe('isToolDisabled', () => {
	it('returns false when no overrides are provided', () => {
		expect(isToolDisabled('search', 'server1')).toBe(false);
		expect(isToolDisabled('search', 'server1', undefined)).toBe(false);
	});

	it('returns false when override exists but has no disabledTools', () => {
		expect(isToolDisabled('search', 'server1', [{ serverId: 'server1', enabled: true }])).toBe(
			false
		);
	});

	it('returns false when tool is not in disabledTools list', () => {
		expect(
			isToolDisabled('search', 'server1', [
				{ serverId: 'server1', enabled: true, disabledTools: ['read', 'write'] }
			])
		).toBe(false);
	});

	it('returns true when tool is in disabledTools list for matching server', () => {
		expect(
			isToolDisabled('search', 'server1', [
				{ serverId: 'server1', enabled: true, disabledTools: ['search', 'read'] }
			])
		).toBe(true);
	});

	it('returns false when override is for a different server', () => {
		expect(
			isToolDisabled('search', 'server1', [
				{ serverId: 'server2', enabled: true, disabledTools: ['search'] }
			])
		).toBe(false);
	});

	it('handles multiple overrides correctly', () => {
		expect(
			isToolDisabled('search', 'server1', [
				{ serverId: 'server2', enabled: true, disabledTools: ['search'] },
				{ serverId: 'server1', enabled: true, disabledTools: ['read'] }
			])
		).toBe(false);

		expect(
			isToolDisabled('read', 'server1', [
				{ serverId: 'server2', enabled: true, disabledTools: ['search'] },
				{ serverId: 'server1', enabled: true, disabledTools: ['read'] }
			])
		).toBe(true);
	});
});
