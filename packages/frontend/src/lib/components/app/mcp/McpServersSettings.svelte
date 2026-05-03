<script lang="ts">
	import { flip } from 'svelte/animate';
	import { Plus, Loader2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { uuid } from '$lib/utils';
	import { mcpStore } from '$lib/stores/mcp.svelte';
	import { conversationsStore } from '$lib/stores/conversations.svelte';
	import { McpServerCard, McpServerCardSkeleton, McpServerForm } from '$lib/components/app/mcp';
	import { MCP_SERVER_ID_PREFIX } from '$lib/constants';
	import { HealthCheckStatus } from '$lib/enums';

	let servers = $derived(mcpStore.getServersSorted());

	let initialLoadComplete = $state(false);

	$effect(() => {
		if (initialLoadComplete) return;

		const allChecked =
			servers.length > 0 &&
			servers.every((server) => {
				const state = mcpStore.getHealthCheckState(server.id);

				return (
					state.status === HealthCheckStatus.SUCCESS || state.status === HealthCheckStatus.ERROR
				);
			});

		if (allChecked) {
			initialLoadComplete = true;
		}
	});

	let isAddingServer = $state(false);
	let isSaving = $state(false);
	let newServerUrl = $state('');
	let newServerHeaders = $state('');
	let newServerUrlError = $derived.by(() => {
		if (!newServerUrl.trim()) return 'URL is required';
		try {
			new URL(newServerUrl);

			return null;
		} catch {
			return 'Invalid URL format';
		}
	});

	function showAddServerForm() {
		isAddingServer = true;
		newServerUrl = '';
		newServerHeaders = '';
	}

	function cancelAddServer() {
		isAddingServer = false;
		newServerUrl = '';
		newServerHeaders = '';
	}

	async function saveNewServer() {
		if (newServerUrlError || isSaving) return;

		isSaving = true;

		const newServerId = uuid() ?? `${MCP_SERVER_ID_PREFIX}-${Date.now()}`;

		mcpStore.addServer({
			id: newServerId,
			enabled: true,
			url: newServerUrl.trim(),
			headers: newServerHeaders.trim() || undefined
		});

		conversationsStore.setMcpServerOverride(newServerId, true);

		isSaving = false;
		isAddingServer = false;
		newServerUrl = '';
		newServerHeaders = '';
	}
</script>

<div class="space-y-5 md:space-y-4">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h4 class="text-base font-semibold">Manage Servers</h4>
		</div>

		{#if !isAddingServer}
			<Button variant="outline" size="sm" class="shrink-0" onclick={showAddServerForm}>
				<Plus class="h-4 w-4" />

				Add New Server
			</Button>
		{/if}
	</div>

	{#if isAddingServer}
		<Card.Root class="bg-muted/30 p-4">
			<div class="space-y-4">
				<p class="font-medium">Add New Server</p>

				<McpServerForm
					url={newServerUrl}
					headers={newServerHeaders}
					onUrlChange={(v) => (newServerUrl = v)}
					onHeadersChange={(v) => (newServerHeaders = v)}
					urlError={newServerUrl ? newServerUrlError : null}
					id="new-server"
				/>

				<div class="flex items-center justify-end gap-2">
					<Button variant="secondary" size="sm" onclick={cancelAddServer}>Cancel</Button>

					<Button
						variant="default"
						size="sm"
						onclick={saveNewServer}
						disabled={!!newServerUrlError || isSaving}
						aria-label="Save"
					>
						{#if isSaving}
							<Loader2 class="h-4 w-4 animate-spin" />
						{/if}
						Add
					</Button>
				</div>
			</div>
		</Card.Root>
	{/if}

	{#if servers.length === 0 && !isAddingServer}
		<div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
			No MCP Servers configured yet. Add one to enable agentic features.
		</div>
	{/if}

	{#if servers.length > 0}
		<div class="grid grid-cols-3 gap-3">
			{#each servers as server (server.id)}
				<div animate:flip={{ duration: 200 }}>
					{#if !initialLoadComplete}
						<McpServerCardSkeleton />
					{:else}
						<McpServerCard
							{server}
							faviconUrl={mcpStore.getServerFavicon(server.id)}
							enabled={conversationsStore.isMcpServerEnabledForChat(server.id)}
							onToggle={async () => await conversationsStore.toggleMcpServerForChat(server.id)}
							onUpdate={(updates) => mcpStore.updateServer(server.id, updates)}
							onDelete={() => mcpStore.removeServer(server.id)}
							isToolEnabled={(toolName) =>
								conversationsStore.isMcpToolEnabledForChat(server.id, toolName)}
							onToolToggle={async (toolName, enabled) => {
								const currentlyEnabled = conversationsStore.isMcpToolEnabledForChat(
									server.id,
									toolName
								);
								if (currentlyEnabled !== enabled) {
									await conversationsStore.toggleMcpToolForChat(server.id, toolName);
								}
							}}
						/>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
