import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgenticToolRegistry } from '$lib/services/agentic/agentic-tool-registry.service';
import {
	BUILTIN_TOOL_NAMES,
	BUILTIN_TOOL_EXECUTION_TARGET
} from '$lib/enums/builtin-tools';
import type { OpenAIToolDefinition } from '$lib/types';

// Mock the subagent config store so fromSettings() is testable without Svelte reactivity
vi.mock('$lib/stores/subagent-config.svelte', () => ({
	subagentConfigStore: {
		isConfigured: true,
		isEnabled: true
	}
}));

function makeTool(name: string): OpenAIToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description: `Mock ${name}`,
			parameters: { type: 'object', properties: {} }
		}
	};
}

const ALL_BUILTIN_NAMES = Object.values(BUILTIN_TOOL_NAMES);

const calculatorTool = makeTool('calculator');
const readFileTool = makeTool('read_file');
const writeFileTool = makeTool('write_file');
const mcpTool = makeTool('mcp_search');

describe('AgenticToolRegistry.fromToolDefinitions', () => {
	it('registers only known builtins from a mixed list', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([
			calculatorTool,
			readFileTool,
			mcpTool
		]);

		expect(registry.isBuiltin('calculator')).toBe(true);
		expect(registry.isBuiltin('read_file')).toBe(true);
		expect(registry.isBuiltin('mcp_search')).toBe(false);
		expect(registry.getBuiltinTools()).toHaveLength(2);
	});

	it('returns empty registry for unknown tools only', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([mcpTool]);
		expect(registry.getBuiltinTools()).toHaveLength(0);
		expect(registry.isBuiltin('mcp_search')).toBe(false);
	});
});

describe('AgenticToolRegistry.dispatch', () => {
	it('classifies frontend builtins correctly', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool]);
		const result = registry.dispatch('calculator');
		expect(result.type).toBe('builtin');
		expect(result.executionTarget).toBe('frontend');
	});

	it('classifies backend builtins correctly', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([readFileTool]);
		const result = registry.dispatch('read_file');
		expect(result.type).toBe('builtin');
		expect(result.executionTarget).toBe('backend');
	});

	it('classifies unknown tools as mcp', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool]);
		const result = registry.dispatch('mcp_search');
		expect(result.type).toBe('mcp');
	});

	it('classifies disabled builtins as mcp when not in registry', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool]);
		const result = registry.dispatch('read_file');
		expect(result.type).toBe('mcp');
	});
});

describe('AgenticToolRegistry.shouldSummarize', () => {
	it('returns false when summarizeOutputs is disabled', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool, mcpTool]);
		expect(
			registry.shouldSummarize('calculator', {
				mcpSummarizeOutputs: false,
				mcpSummarizeAllTools: false
			})
		).toBe(false);
	});

	it('summarizes MCP tools when enabled', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool]);
		expect(
			registry.shouldSummarize('mcp_search', {
				mcpSummarizeOutputs: true,
				mcpSummarizeAllTools: false
			})
		).toBe(true);
	});

	it('does not summarize builtins unless mcpSummarizeAllTools is true', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool]);
		expect(
			registry.shouldSummarize('calculator', {
				mcpSummarizeOutputs: true,
				mcpSummarizeAllTools: false
			})
		).toBe(false);
	});

	it('summarizes builtins when mcpSummarizeAllTools is true', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool]);
		expect(
			registry.shouldSummarize('calculator', {
				mcpSummarizeOutputs: true,
				mcpSummarizeAllTools: true
			})
		).toBe(true);
	});
});

describe('AgenticToolRegistry.getSubagentTools', () => {
	it('excludes call_subagent, read_skill, and list_skill only', () => {
		const all = [
			makeTool('calculator'),
			makeTool('read_file'),
			makeTool('call_subagent'),
			makeTool('read_skill'),
			makeTool('list_skill'),
			makeTool('write_file'),
			mcpTool
		];
		const registry = AgenticToolRegistry.fromToolDefinitions(all);
		const subagent = registry.getSubagentTools(all);
		const names = subagent.map((t) => t.function.name);

		expect(names).toContain('calculator');
		expect(names).toContain('read_file');
		expect(names).toContain('write_file');
		expect(names).toContain('mcp_search');
		expect(names).not.toContain('call_subagent');
		expect(names).not.toContain('read_skill');
		expect(names).not.toContain('list_skill');
	});

	it('returns empty array when all tools are excluded', () => {
		const all = [makeTool('call_subagent'), makeTool('read_skill'), makeTool('list_skill')];
		const registry = AgenticToolRegistry.fromToolDefinitions(all);
		expect(registry.getSubagentTools(all)).toHaveLength(0);
	});
});

describe('AgenticToolRegistry.getSubagentDispatchTarget', () => {
	it('returns builtin for known builtins', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool, readFileTool]);
		expect(registry.getSubagentDispatchTarget('calculator')).toBe('builtin');
		expect(registry.getSubagentDispatchTarget('read_file')).toBe('builtin');
	});

	it('returns mcp for non-builtins', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool]);
		expect(registry.getSubagentDispatchTarget('mcp_search')).toBe('mcp');
	});
});

describe('AgenticToolRegistry.mergeWithMcpTools', () => {
	it('places builtins before MCP tools', () => {
		const registry = AgenticToolRegistry.fromToolDefinitions([calculatorTool]);
		const merged = registry.mergeWithMcpTools([mcpTool]);
		expect(merged).toHaveLength(2);
		expect(merged[0].function.name).toBe('calculator');
		expect(merged[1].function.name).toBe('mcp_search');
	});
});

describe('AgenticToolRegistry.fromSettings', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('returns empty registry when all tool settings are false', async () => {
		const { AgenticToolRegistry: Registry } = await import(
			'$lib/services/agentic/agentic-tool-registry.service'
		);
		const settings = {
			builtinToolCalculator: false,
			builtinToolTime: false,
			builtinToolLocation: false,
			builtinToolCallSubagent: false,
			builtinToolSkills: false,
			builtinToolSafeFileTools: false,
			builtinToolMutatingFileTools: false,
			builtinToolRunCommand: false,
			builtinToolTodoList: false
		} as Record<string, boolean>;
		const registry = Registry.fromSettings(settings);
		expect(registry.getBuiltinTools()).toHaveLength(0);
	});

	it('includes calculator when setting is true', async () => {
		const { AgenticToolRegistry: Registry } = await import(
			'$lib/services/agentic/agentic-tool-registry.service'
		);
		const settings = {
			builtinToolCalculator: true,
			builtinToolTime: false,
			builtinToolLocation: false,
			builtinToolCallSubagent: false,
			builtinToolSkills: false,
			builtinToolSafeFileTools: false,
			builtinToolMutatingFileTools: false,
			builtinToolRunCommand: false,
			builtinToolTodoList: false
		} as Record<string, boolean>;
		const registry = Registry.fromSettings(settings);
		expect(registry.getBuiltinTools()).toHaveLength(1);
		expect(registry.isBuiltin('calculator')).toBe(true);
	});

	it('expands group settings into multiple tools', async () => {
		const { AgenticToolRegistry: Registry } = await import(
			'$lib/services/agentic/agentic-tool-registry.service'
		);
		const settings = {
			builtinToolCalculator: false,
			builtinToolTime: false,
			builtinToolLocation: false,
			builtinToolCallSubagent: false,
			builtinToolSkills: true,
			builtinToolSafeFileTools: false,
			builtinToolMutatingFileTools: false,
			builtinToolRunCommand: false,
			builtinToolTodoList: false
		} as Record<string, boolean>;
		const registry = Registry.fromSettings(settings);
		expect(registry.isBuiltin('list_skill')).toBe(true);
		expect(registry.isBuiltin('read_skill')).toBe(true);
	});
});
