<script lang="ts">
	import { Plug, RotateCcw, RefreshCw, Loader2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { DialogConfirmation } from '$lib/components/app';
	import {
		serverEndpointStore,
		serverEndpointConfig,
		isUsingDefaultEndpoint
	} from '$lib/stores/server-endpoint.svelte';
	import { modelsStore, modelOptions, selectedModelId } from '$lib/stores/models.svelte';
	import { serverStore, serverError } from '$lib/stores/server.svelte';
	import { toast } from 'svelte-sonner';

	let endpointInput = $derived(serverEndpointConfig().baseUrl);
	let showResetConfirm = $state(false);
	let isRefreshing = $state(false);
	let activeModelId = $derived(selectedModelId());

	function handleModelSelect(modelId: string) {
		modelsStore.selectModelById(modelId);
	}

	async function handleRefreshModels() {
		isRefreshing = true;
		try {
			modelsStore.clear();
			await serverStore.fetch();
			await modelsStore.fetch(true);
			toast.success('Models refreshed');
		} catch (error) {
			toast.error(
				'Failed to refresh models:' + (error instanceof Error ? error.message : 'Unknown error')
			);
		} finally {
			isRefreshing = false;
		}
	}

	function handleEndpointChange() {
		const trimmed = endpointInput.trim();
		if (trimmed && trimmed !== serverEndpointStore.getBaseUrl()) {
			serverEndpointStore.setBaseUrl(trimmed);
			toast.success('Server endpoint updated');
		}
	}

	function handleReset() {
		serverEndpointStore.setDefault();
		endpointInput = serverEndpointConfig().baseUrl;
		showResetConfirm = false;
		toast.info('Server endpoint reset to default');
	}

	function handleResetCancel() {
		showResetConfirm = false;
	}

	function handleEndpointKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleEndpointChange();
		}
	}
</script>

<div class="space-y-6">
	<div class="space-y-3">
		<label for="server-endpoint" class="text-sm font-medium"> Server Endpoint </label>

		<div class="flex gap-2">
			<Input
				id="server-endpoint"
				type="text"
				bind:value={endpointInput}
				onblur={handleEndpointChange}
				onkeydown={handleEndpointKeydown}
				placeholder="http://localhost:8080"
				class="w-full"
			/>

			<Button variant="outline" size="icon" onclick={handleEndpointChange} title="Save endpoint">
				<RotateCcw class="h-4 w-4" />
			</Button>
		</div>

		<p class="text-xs text-muted-foreground">
			{#if isUsingDefaultEndpoint()}
				Using default endpoint (localhost:8080)
			{:else}
				Using custom endpoint
			{/if}
		</p>
	</div>

	<div class="flex gap-2 border-t border-border/30 pt-4">
		<Button variant="outline" onclick={handleRefreshModels} disabled={isRefreshing}>
			{#if isRefreshing}
				<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				Refreshing...
			{:else}
				<RefreshCw class="mr-2 h-4 w-4" />
				Refresh Models
			{/if}
		</Button>

		<Button
			variant="outline"
			onclick={() => (showResetConfirm = true)}
			disabled={isUsingDefaultEndpoint()}
		>
			<Plug class="mr-2 h-4 w-4" />
			Reset to Default
		</Button>
	</div>

	{#if serverError()}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{serverError()}
		</div>
	{/if}

	<div class="space-y-3 border-t border-border/30 pt-4">
		<h4 class="text-sm font-medium">Available Models</h4>

		{#if modelsStore.loading}
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 class="h-4 w-4 animate-spin" />
				Loading models...
			</div>
		{:else if modelOptions().length > 0}
			<div class="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border/30 p-2">
				{#each modelOptions() as model (model.id)}
					{@const isActive = model.id === activeModelId}
					<button
						type="button"
						class="flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/50 {isActive
							? 'bg-muted/70 font-medium'
							: 'cursor-pointer'}"
						onclick={() => handleModelSelect(model.id)}
					>
						<span class="truncate text-sm">{model.name}</span>
						<span class="ml-2 flex shrink-0 items-center gap-1.5">
							{#if isActive}
								<span class="text-xs text-muted-foreground">active</span>
							{:else if model.model}
								<span class="truncate text-xs text-muted-foreground"
									>{model.model.split('/').pop()}</span
								>
							{/if}
						</span>
					</button>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				No models available. Click "Refresh Models" to fetch from server.
			</p>
		{/if}
	</div>
</div>

<DialogConfirmation
	bind:open={showResetConfirm}
	title="Reset to Default"
	description="Are you sure you want to reset the server endpoint to localhost:8080?"
	confirmText="Reset"
	variant="default"
	icon={Plug}
	onConfirm={handleReset}
	onCancel={handleResetCancel}
/>
