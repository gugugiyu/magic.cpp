<script lang="ts">
	import { page } from '$app/state';
	import { Plus, MessageSquare, Settings, Zap, FolderOpen, Wrench } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Switch } from '$lib/components/ui/switch';
	import { FILE_TYPE_ICONS, TOOLTIP_DELAY_DURATION } from '$lib/constants';
	import { McpLogo, DropdownMenuSearchable } from '$lib/components/app';
	import { conversationsStore } from '$lib/stores/conversations.svelte';
	import { mcpStore } from '$lib/stores/mcp.svelte';
	import { config, settingsStore } from '$lib/stores/settings.svelte';

	import { HealthCheckStatus } from '$lib/enums';
	import type { MCPServerSettingsEntry } from '$lib/types';
	import { builtinToolFields, BUILTIN_TOOL_SETTING_KEY_TARGET } from '$lib/enums/builtin-tools';

	interface Props {
		class?: string;
		disabled?: boolean;
		hasAudioModality?: boolean;
		hasVisionModality?: boolean;
		hasMcpPromptsSupport?: boolean;
		hasMcpResourcesSupport?: boolean;
		onFileUpload?: () => void;
		onSystemPromptClick?: () => void;
		onMcpPromptClick?: () => void;
		onMcpSettingsClick?: () => void;
		onMcpResourcesClick?: () => void;
	}

	let {
		class: className = '',
		disabled = false,
		hasAudioModality = false,
		hasVisionModality = false,
		hasMcpPromptsSupport = false,
		hasMcpResourcesSupport = false,
		onFileUpload,
		onSystemPromptClick,
		onMcpPromptClick,
		onMcpSettingsClick,
		onMcpResourcesClick
	}: Props = $props();

	let isNewChat = $derived(!page.params.id);

	let systemMessageTooltip = $derived(
		isNewChat
			? 'Add custom system message for a new conversation'
			: 'Inject custom system message at the beginning of the conversation'
	);

	let dropdownOpen = $state(false);

	let mcpServers = $derived(mcpStore.getServersSorted().filter((s) => s.enabled));
	let hasMcpServers = $derived(mcpServers.length > 0);
	let mcpSearchQuery = $state('');
	let filteredMcpServers = $derived.by(() => {
		const query = mcpSearchQuery.toLowerCase().trim();
		if (!query) return mcpServers;
		return mcpServers.filter((s) => {
			const name = getServerLabel(s).toLowerCase();
			const url = s.url.toLowerCase();
			return name.includes(query) || url.includes(query);
		});
	});

	function getServerLabel(server: MCPServerSettingsEntry): string {
		return mcpStore.getServerLabel(server);
	}

	function isServerEnabledForChat(serverId: string): boolean {
		return conversationsStore.isMcpServerEnabledForChat(serverId);
	}

	async function toggleServerForChat(serverId: string) {
		await conversationsStore.toggleMcpServerForChat(serverId);
	}

	function handleMcpSubMenuOpen(open: boolean) {
		if (open) {
			mcpSearchQuery = '';
			mcpStore.runHealthChecksForServers(mcpServers);
		}
	}

	function handleMcpPromptClick() {
		dropdownOpen = false;
		onMcpPromptClick?.();
	}

	function handleMcpSettingsClick() {
		dropdownOpen = false;
		onMcpSettingsClick?.();
	}

	function handleMcpResourcesClick() {
		dropdownOpen = false;
		onMcpResourcesClick?.();
	}

	const fileUploadTooltipText = 'Add files, system prompt or MCP Servers';

	let currentConfig = $derived(config());

	function toggleBuiltinTool(key: string, enabled: boolean) {
		console.log(key as keyof typeof currentConfig, enabled);
		settingsStore.updateConfig(key as keyof typeof currentConfig, enabled);
	}

	// ─── MCP Tools sub-menu state ─────────────────────────────────────────────
	let mcpToolsForToolbar = $derived.by(() => {
		const result: Array<{
			serverId: string;
			serverName: string;
			toolName: string;
			toolDescription?: string;
		}> = [];
		for (const server of mcpStore.getServers()) {
			if (!conversationsStore.isMcpServerEnabledForChat(server.id)) continue;
			const health = mcpStore.getHealthCheckState(server.id);
			if (health.status !== HealthCheckStatus.SUCCESS || !health.tools) continue;
			for (const tool of health.tools) {
				if (!tool.name) continue;
				result.push({
					serverId: server.id,
					serverName: getServerLabel(server),
					toolName: tool.name,
					toolDescription: tool.description
				});
			}
		}
		return result;
	});

	let hasMcpToolsForToolbar = $derived(mcpToolsForToolbar.length > 0);

	let mcpToolsGrouped = $derived.by(() => {
		const map: Record<string, { serverName: string; tools: typeof mcpToolsForToolbar }> = {};
		for (const item of mcpToolsForToolbar) {
			if (!map[item.serverId]) {
				map[item.serverId] = { serverName: item.serverName, tools: [] };
			}
			map[item.serverId].tools.push(item);
		}
		return Object.entries(map).map(([serverId, { serverName, tools }]) => ({
			serverId,
			serverName,
			tools
		}));
	});

	function isMcpToolEnabled(serverId: string, toolName: string): boolean {
		return conversationsStore.isMcpToolEnabledForChat(serverId, toolName);
	}

	async function toggleMcpTool(serverId: string, toolName: string) {
		await conversationsStore.toggleMcpToolForChat(serverId, toolName);
	}

	// ─── Built-in tools grouped by execution target ───────────────────────────
	let builtinToolsGrouped = $derived.by(() => {
		const frontend = builtinToolFields.filter(
			(tool) => BUILTIN_TOOL_SETTING_KEY_TARGET[tool.key] === 'frontend'
		);
		const backend = builtinToolFields.filter(
			(tool) => BUILTIN_TOOL_SETTING_KEY_TARGET[tool.key] === 'backend'
		);
		return [
			{ label: 'Frontend Tools', items: frontend },
			{ label: 'Backend Tools', items: backend }
		].filter((g) => g.items.length > 0);
	});
</script>

<div class="flex items-center gap-1 {className}">
	<DropdownMenu.Root bind:open={dropdownOpen}>
		<DropdownMenu.Trigger name="Attach files" {disabled}>
			<Tooltip.Root>
				<Tooltip.Trigger class="w-full">
					<Button
						class="file-upload-button h-8 w-8 rounded-full p-0"
						{disabled}
						variant="secondary"
						type="button"
					>
						<span class="sr-only">{fileUploadTooltipText}</span>

						<Plus class="h-4 w-4" />
					</Button>
				</Tooltip.Trigger>

				<Tooltip.Content>
					<p>{fileUploadTooltipText}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="start" class="w-48">
			{#if hasVisionModality}
				<DropdownMenu.Item
					class="images-button flex cursor-pointer items-center gap-2"
					onclick={() => onFileUpload?.()}
				>
					<FILE_TYPE_ICONS.image class="h-4 w-4" />

					<span>Images</span>
				</DropdownMenu.Item>
			{:else}
				<Tooltip.Root delayDuration={TOOLTIP_DELAY_DURATION}>
					<Tooltip.Trigger class="w-full">
						<DropdownMenu.Item
							class="images-button flex cursor-pointer items-center gap-2"
							disabled
						>
							<FILE_TYPE_ICONS.image class="h-4 w-4" />

							<span>Images</span>
						</DropdownMenu.Item>
					</Tooltip.Trigger>

					<Tooltip.Content side="right">
						<p>Image processing requires a vision model</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}

			{#if hasAudioModality}
				<DropdownMenu.Item
					class="audio-button flex cursor-pointer items-center gap-2"
					onclick={() => onFileUpload?.()}
				>
					<FILE_TYPE_ICONS.audio class="h-4 w-4" />

					<span>Audio Files</span>
				</DropdownMenu.Item>
			{:else}
				<Tooltip.Root delayDuration={TOOLTIP_DELAY_DURATION}>
					<Tooltip.Trigger class="w-full">
						<DropdownMenu.Item class="audio-button flex cursor-pointer items-center gap-2" disabled>
							<FILE_TYPE_ICONS.audio class="h-4 w-4" />

							<span>Audio Files</span>
						</DropdownMenu.Item>
					</Tooltip.Trigger>

					<Tooltip.Content side="right">
						<p>Audio files processing requires an audio model</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}

			<DropdownMenu.Item
				class="flex cursor-pointer items-center gap-2"
				onclick={() => onFileUpload?.()}
			>
				<FILE_TYPE_ICONS.text class="h-4 w-4" />

				<span>Text Files</span>
			</DropdownMenu.Item>

			{#if hasVisionModality}
				<DropdownMenu.Item
					class="flex cursor-pointer items-center gap-2"
					onclick={() => onFileUpload?.()}
				>
					<FILE_TYPE_ICONS.pdf class="h-4 w-4" />

					<span>PDF Files</span>
				</DropdownMenu.Item>
			{:else}
				<Tooltip.Root delayDuration={TOOLTIP_DELAY_DURATION}>
					<Tooltip.Trigger class="w-full">
						<DropdownMenu.Item
							class="flex cursor-pointer items-center gap-2"
							onclick={() => onFileUpload?.()}
						>
							<FILE_TYPE_ICONS.pdf class="h-4 w-4" />

							<span>PDF Files</span>
						</DropdownMenu.Item>
					</Tooltip.Trigger>

					<Tooltip.Content side="right">
						<p>PDFs will be converted to text. Image-based PDFs may not work properly.</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}

			<Tooltip.Root delayDuration={TOOLTIP_DELAY_DURATION}>
				<Tooltip.Trigger class="w-full">
					<DropdownMenu.Item
						class="flex cursor-pointer items-center gap-2"
						onclick={() => onSystemPromptClick?.()}
					>
						<MessageSquare class="h-4 w-4" />

						<span>System Message</span>
					</DropdownMenu.Item>
				</Tooltip.Trigger>

				<Tooltip.Content side="right">
					<p>{systemMessageTooltip}</p>
				</Tooltip.Content>
			</Tooltip.Root>

			<DropdownMenu.Separator />

			<DropdownMenu.Sub onOpenChange={handleMcpSubMenuOpen}>
				<DropdownMenu.SubTrigger class="flex cursor-pointer items-center gap-2">
					<McpLogo class="h-4 w-4" />

					<span>MCP Servers</span>
				</DropdownMenu.SubTrigger>

				<DropdownMenu.SubContent class="w-72 pt-0">
					<DropdownMenuSearchable
						placeholder="Search servers..."
						bind:searchValue={mcpSearchQuery}
						emptyMessage={hasMcpServers ? 'No servers found' : 'No MCP servers configured'}
						isEmpty={filteredMcpServers.length === 0}
					>
						<div class="max-h-64 overflow-y-auto">
							{#each filteredMcpServers as server (server.id)}
								{@const healthState = mcpStore.getHealthCheckState(server.id)}
								{@const hasError = healthState.status === HealthCheckStatus.ERROR}
								{@const isEnabledForChat = isServerEnabledForChat(server.id)}

								<button
									type="button"
									class="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
									onclick={() => !hasError && toggleServerForChat(server.id)}
									disabled={hasError}
								>
									<div class="flex min-w-0 flex-1 items-center gap-2">
										{#if mcpStore.getServerFavicon(server.id)}
											<img
												src={mcpStore.getServerFavicon(server.id)}
												alt=""
												class="h-4 w-4 shrink-0 rounded-sm"
												onerror={(e) => {
													(e.currentTarget as HTMLImageElement).style.display = 'none';
												}}
											/>
										{/if}

										<span class="truncate text-sm">{getServerLabel(server)}</span>

										{#if hasError}
											<span
												class="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive"
											>
												Error
											</span>
										{/if}
									</div>

									<Switch
										checked={isEnabledForChat}
										disabled={hasError}
										onclick={(e: MouseEvent) => e.stopPropagation()}
										onCheckedChange={() => toggleServerForChat(server.id)}
									/>
								</button>
							{/each}
						</div>

						{#snippet footer()}
							<DropdownMenu.Item
								class="flex cursor-pointer items-center gap-2"
								onclick={handleMcpSettingsClick}
							>
								<Settings class="h-4 w-4" />

								<span>Manage MCP Servers</span>
							</DropdownMenu.Item>
						{/snippet}
					</DropdownMenuSearchable>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>

			{#if hasMcpPromptsSupport}
				<DropdownMenu.Item
					class="flex cursor-pointer items-center gap-2"
					onclick={handleMcpPromptClick}
				>
					<Zap class="h-4 w-4" />

					<span>MCP Prompt</span>
				</DropdownMenu.Item>
			{/if}

			{#if hasMcpResourcesSupport}
				<DropdownMenu.Item
					class="flex cursor-pointer items-center gap-2"
					onclick={handleMcpResourcesClick}
				>
					<FolderOpen class="h-4 w-4" />

					<span>MCP Resources</span>
				</DropdownMenu.Item>
			{/if}

			{#if hasMcpToolsForToolbar}
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger class="flex cursor-pointer items-center gap-2">
						<Wrench class="h-4 w-4" />

						<span>MCP Tools</span>
					</DropdownMenu.SubTrigger>

					<DropdownMenu.SubContent class="w-72 pt-0">
						<div class="px-2 py-1.5">
							<p class="text-xs font-medium text-muted-foreground">Toggle MCP tools</p>
							<p class="text-xs text-muted-foreground">Per-conversation tool selection</p>
						</div>

						<div class="max-h-64 overflow-y-auto">
							{#each mcpToolsGrouped as group (group.serverId)}
								<div class="sticky top-0 z-10 bg-background px-2 py-1.5">
									<p class="text-xs font-semibold text-muted-foreground">{group.serverName}</p>
								</div>
								{#each group.tools as item (item.serverId + ':' + item.toolName)}
									{@const enabled = isMcpToolEnabled(item.serverId, item.toolName)}
									<button
										type="button"
										class="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
										onclick={() => toggleMcpTool(item.serverId, item.toolName)}
									>
										<div class="min-w-0">
											<p class="truncate text-sm">{item.toolName}</p>
											{#if item.toolDescription}
												<p class="truncate text-xs text-muted-foreground">{item.toolDescription}</p>
											{/if}
										</div>
										<Switch checked={enabled} />
									</button>
								{/each}
							{/each}
						</div>
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
			{/if}

			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger class="flex cursor-pointer items-center gap-2">
					<Wrench class="h-4 w-4" />

					<span>Built-in tools</span>
				</DropdownMenu.SubTrigger>

				<DropdownMenu.SubContent class="w-64 pt-0">
					<div class="px-2 py-1.5">
						<p class="text-xs font-medium text-muted-foreground">Toggle built-in tools</p>
						<p class="text-xs text-muted-foreground">Tools are shared across all conversations</p>
					</div>

					<div class="max-h-64 overflow-y-auto">
						{#each builtinToolsGrouped as group (group.label)}
							<div class="sticky top-0 z-10 bg-background px-2 py-1.5">
								<p class="text-xs font-semibold text-muted-foreground">{group.label}</p>
							</div>
							{#each group.items as tool (tool.key)}
								{@const isEnabled = !!currentConfig[tool.key]}
								<button
									type="button"
									class="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
									onclick={() => toggleBuiltinTool(tool.key, !isEnabled)}
								>
									<span class="text-sm hover:text-foreground">{tool.label}</span>
									<Switch checked={isEnabled} />
								</button>
							{/each}
						{/each}
					</div>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
