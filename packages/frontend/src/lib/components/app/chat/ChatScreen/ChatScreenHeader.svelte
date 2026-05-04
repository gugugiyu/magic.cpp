<script lang="ts">
	import { Settings, FolderTree, Bot } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { filesystemStore } from '$lib/stores/filesystem.svelte.js';
	import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
	import { subagentDialogStore } from '$lib/stores/subagent-dialog.svelte';
	import { config } from '$lib/stores/settings.svelte';
	import { activeConversation } from '$lib/stores/conversations.svelte';
	import { poolStatusStore } from '$lib/stores/pool-status.svelte';
	import { goto } from '$app/navigation';

	const sidebar = useSidebar();
	const isSubagentEnabled = $derived(config().builtinToolCallSubagent);

	let isSubagentConfigured = $derived(subagentConfigStore.isConfigured);
	let conversationId = $derived(activeConversation()?.id ?? '');

	function handleOpenSubagentDialog() {
		if (conversationId) {
			subagentDialogStore.openDialog({ conversationId });
		}
	}

	let showPoolStatus = $derived(poolStatusStore.total > 0);
	let poolDotColor = $derived.by(() => {
		if (poolStatusStore.isHealthy) return 'bg-success';
		if (poolStatusStore.isDegraded) return 'bg-warning';
		return 'bg-destructive';
	});
	let poolLabel = $derived.by(() => {
		if (poolStatusStore.isHealthy) return 'Full';
		if (poolStatusStore.isDegraded) return 'Partial';
		return 'Down';
	});
</script>

<header
	class="pointer-events-none fixed top-0 right-0 left-0 z-50 flex items-center justify-end p-2 duration-200 ease-linear md:p-4 {sidebar.open
		? 'md:left-[var(--sidebar-width)]'
		: ''}"
>
	<div class="pointer-events-auto flex items-center space-x-2">
		{#if showPoolStatus}
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Badge variant="tertiary" class="gap-1.5 text-xs backdrop-blur-lg">
							<span class="h-2 w-2 rounded-full {poolDotColor}"></span>
							{poolLabel}
						</Badge>
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom">
						{poolStatusStore.connected}/{poolStatusStore.total} upstreams connected
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		{/if}
		{#if isSubagentConfigured && isSubagentEnabled && conversationId}
			<Button
				variant="ghost"
				size="icon-lg"
				onclick={handleOpenSubagentDialog}
				class="rounded-full backdrop-blur-lg"
				title="Open subagent traces"
			>
				<Bot class="h-4 w-4 text-foreground" />
			</Button>
		{/if}
		<Button
			variant="ghost"
			size="icon-lg"
			onclick={() => (filesystemStore.sidebarOpen = !filesystemStore.sidebarOpen)}
			class="rounded-full backdrop-blur-lg"
			title="Toggle file tree (Ctrl+Shift+B)"
		>
			<FolderTree class="h-4 w-4 text-foreground" />
		</Button>
		<Button
			variant="ghost"
			size="icon-lg"
			onclick={() => goto('#/settings/general')}
			class="rounded-full backdrop-blur-lg"
		>
			<Settings class="h-4 w-4 text-foreground" />
		</Button>
	</div>
</header>
