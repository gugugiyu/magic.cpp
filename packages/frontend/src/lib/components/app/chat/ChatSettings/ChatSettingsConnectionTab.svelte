<script lang="ts">
	import { Plug, Check, X, RefreshCw, Loader2, ChevronDown } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { DialogConfirmation, SettingsSectionDivider } from '$lib/components/app';
	import {
		serverEndpointStore,
		serverEndpointConfig,
		isUsingDefaultEndpoint
	} from '$lib/stores/server-endpoint.svelte';
	import { modelsStore, modelOptions, selectedModelId } from '$lib/stores/models.svelte';
	import {
		serverStore,
		serverError,
		serverLoading,
		serverRetryAttempt
	} from '$lib/stores/server.svelte';
	import { subagentConfigStore } from '$lib/stores/subagent-config.svelte';
	import { modelCapabilityStore } from '$lib/stores/model-capabilities.svelte';
	import { toast } from 'svelte-sonner';
	import { slide } from 'svelte/transition';

	interface Props {
		subagentEnabled?: boolean;
	}

	let { subagentEnabled = true }: Props = $props();

	let endpointInput = $derived(serverEndpointConfig().baseUrl);

	let showResetConfirm = $state(false);
	let isRefreshing = $state(false);
	let activeModelId = $derived(selectedModelId());
	let dismissedError = $state<string | null>(null);

	// ─── Connection health polling ────────────────────────────────────────────
	$effect(() => {
		const interval = setInterval(() => {
			if (document.visibilityState === 'visible') {
				serverStore.fetch();
			}
		}, 5000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		if (!serverError()) {
			dismissedError = null;
		}
	});

	// ─── Capability override panel ────────────────────────────────────────────
	let expandedModelId = $state<string | null>(null);

	function toggleExpand(modelId: string) {
		expandedModelId = expandedModelId === modelId ? null : modelId;
	}

	// ─── Subagent state ───────────────────────────────────────────────────────
	let subagentEndpointInput = $derived(
		subagentConfigStore.config.endpoint || serverEndpointConfig().baseUrl
	);
	let subagentSelectedModel = $derived(subagentConfigStore.config.model);
	let subagentSummarizeEnabled = $derived(subagentConfigStore.config.summarizeEnabled);

	function handleModelSelect(modelId: string) {
		modelsStore.selectModelById(modelId);
	}

	async function handleRefreshModels() {
		isRefreshing = true;
		serverStore.error = null;
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
			dismissedError = null;
			toast.success('Server endpoint updated');
		}
	}

	function handleEndpointInput() {
		if (serverError()) {
			dismissedError = serverError();
		}
	}

	function handleReset() {
		serverEndpointStore.setDefault();
		showResetConfirm = false;
		dismissedError = null;
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

	// ─── Subagent handlers ────────────────────────────────────────────────────

	function handleSubagentEndpointChange() {
		const url = subagentEndpointInput.trim();
		try {
			new URL(url);
			subagentConfigStore.setEndpoint(url);
			toast.success('Subagent endpoint updated');
		} catch {
			toast.error('Invalid subagent endpoint URL');
		}
	}

	function handleSubagentEndpointKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSubagentEndpointChange();
		}
	}

	function handleSubagentModelSelect(modelId: string) {
		subagentConfigStore.setModel(modelId);
	}

	function handleSubagentSummarizeToggle(checked: boolean) {
		subagentConfigStore.setSummarizeEnabled(checked);
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
				oninput={handleEndpointInput}
				placeholder="http://localhost:8080"
				class="w-full"
			/>

			<Button variant="outline" size="icon" onclick={handleEndpointChange} title="Save endpoint">
				<Check class="h-4 w-4" />
			</Button>
		</div>

		<div class="flex items-center justify-between">
			<p class="text-xs text-muted-foreground">
				{#if isUsingDefaultEndpoint()}
					Using default endpoint (localhost:8080)
				{:else}
					Using custom endpoint
				{/if}
			</p>
			{#if serverLoading()}
				<span class="animate-pulse text-xs text-muted-foreground">
					Connecting… attempt {serverRetryAttempt() + 1}/3
				</span>
			{/if}
		</div>
	</div>

	<SettingsSectionDivider class="flex gap-2">
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
	</SettingsSectionDivider>

	{#if serverError() && serverError() !== dismissedError}
		<div
			class="flex items-start justify-between gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
		>
			<span class="break-words">{serverError()}</span>
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6 shrink-0"
				onclick={() => (dismissedError = serverError())}
			>
				<X class="h-3.5 w-3.5" />
			</Button>
		</div>
	{/if}

	<SettingsSectionDivider class="space-y-3">
		<h4 class="text-sm font-medium">Available Models</h4>

		{#if modelsStore.loading}
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 class="h-4 w-4 animate-spin" />
				Loading models...
			</div>
		{:else if modelOptions().length > 0}
			<div class="max-h-60 overflow-y-auto rounded-md border border-border/30">
				{#each modelOptions() as model (model.id)}
					{@const modelId = model.model ?? model.id}
					{@const isActive = model.id === activeModelId}
					{@const isExpanded = expandedModelId === modelId}
					{@const serverModalities = modelsStore.getModelModalities(modelId)}
					{@const serverVision = serverModalities?.vision ?? false}
					{@const serverAudio = serverModalities?.audio ?? false}
					{@const overrides = modelCapabilityStore.getOverride(modelId)}
					<div class="border-b border-border/20 last:border-b-0">
						<div class="flex items-center">
							<button
								type="button"
								class="flex flex-1 items-center justify-between px-2 py-1.5 text-left transition-colors hover:bg-muted/50 {isActive
									? 'bg-muted/70 font-medium'
									: 'cursor-pointer'}"
								onclick={() => handleModelSelect(model.id)}
							>
								<span class="truncate text-sm">{model.name}</span>
								<span class="ml-2 flex shrink-0 items-center gap-1.5">
									{#if isActive}
										<Badge variant="secondary" class="px-1.5 py-0 text-[10px]">active</Badge>
									{:else if model.model}
										<span class="truncate text-xs text-muted-foreground"
											>{model.model.split('/').pop()}</span
										>
									{/if}
								</span>
							</button>
							<button
								type="button"
								title="Model capabilities"
								class="flex shrink-0 items-center px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
								onclick={() => toggleExpand(modelId)}
							>
								<ChevronDown
									class="h-3.5 w-3.5 transition-transform duration-150 {isExpanded
										? 'rotate-180'
										: ''}"
								/>
							</button>
						</div>
						{#if isExpanded}
							<div
								transition:slide={{ duration: 150 }}
								class="space-y-2 border-t border-border/20 bg-muted/20 px-3 py-2.5"
							>
								<p class="text-xs font-medium text-muted-foreground">Capability overrides</p>
								<label class="flex cursor-pointer items-center gap-2">
									<Checkbox
										id="cap-tool-{modelId}"
										checked={modelCapabilityStore.isToolCallingEnabled(modelId)}
										onCheckedChange={(c: boolean | 'indeterminate') =>
											modelCapabilityStore.setToolCalling(modelId, Boolean(c))}
										class="h-3.5 w-3.5"
									/>
									<span class="text-xs">Tool calling</span>
								</label>
								<label
									class="flex items-center gap-2 {serverVision
										? 'cursor-default opacity-50'
										: 'cursor-pointer'}"
								>
									<Checkbox
										id="cap-vision-{modelId}"
										checked={serverVision || (overrides.vision ?? false)}
										disabled={serverVision}
										onCheckedChange={(c: boolean | 'indeterminate') =>
											modelCapabilityStore.setVision(modelId, Boolean(c))}
										class="h-3.5 w-3.5"
									/>
									<span class="text-xs">
										Vision{serverVision ? ' (auto-detected)' : ''}
									</span>
								</label>
								<label
									class="flex items-center gap-2 {serverAudio
										? 'cursor-default opacity-50'
										: 'cursor-pointer'}"
								>
									<Checkbox
										id="cap-audio-{modelId}"
										checked={serverAudio || (overrides.audio ?? false)}
										disabled={serverAudio}
										onCheckedChange={(c: boolean | 'indeterminate') =>
											modelCapabilityStore.setAudio(modelId, Boolean(c))}
										class="h-3.5 w-3.5"
									/>
									<span class="text-xs">
										Audio{serverAudio ? ' (auto-detected)' : ''}
									</span>
								</label>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else if modelsStore.error}
			<p class="text-sm text-destructive">{modelsStore.error}</p>
		{:else}
			<p class="text-sm text-muted-foreground">
				No models available. Click "Refresh Models" to fetch from server.
			</p>
		{/if}
	</SettingsSectionDivider>

	<!-- ─── Subagent Configuration ─────────────────────────────────────────── -->
	{#if subagentEnabled}
		<SettingsSectionDivider class="space-y-4">
			<div>
				<h4 class="text-sm font-medium">Subagent</h4>
				<p class="mt-1 text-xs text-muted-foreground">
					Configure a separate endpoint and model for the <span class="font-mono text-xs"
						>call_subagent</span
					> built-in tool.
				</p>
			</div>

			<div class="space-y-2">
				<label for="subagent-endpoint" class="text-sm font-medium text-muted-foreground">
					Endpoint URL
				</label>
				<Input
					id="subagent-endpoint"
					type="text"
					bind:value={subagentEndpointInput}
					onblur={handleSubagentEndpointChange}
					onkeydown={handleSubagentEndpointKeydown}
					placeholder="http://localhost:8080"
					class="w-full"
				/>
			</div>

			<div class="space-y-2">
				<span class="text-sm font-medium text-muted-foreground">Model</span>

				{#if modelsStore.loading}
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 class="h-4 w-4 animate-spin" />
						Loading models...
					</div>
				{:else if modelOptions().length > 0}
					<div class="max-h-40 overflow-y-auto rounded-md border border-border/30">
						{#each modelOptions() as model (model.id)}
							{@const modelId = model.model ?? model.id}
							{@const isActive =
								model.model === subagentSelectedModel || model.id === subagentSelectedModel}
							{@const toolCallingOn = modelCapabilityStore.isToolCallingEnabled(modelId)}
							<div class="flex items-center border-b border-border/20 last:border-b-0">
								<button
									type="button"
									class="flex flex-1 items-center justify-between px-2 py-1.5 text-left transition-colors hover:bg-muted/50 {isActive
										? 'bg-muted/70 font-medium'
										: 'cursor-pointer'}"
									onclick={() => handleSubagentModelSelect(modelId)}
								>
									<span class="truncate text-sm">{model.name}</span>
									{#if isActive}
										<Badge variant="secondary" class="ml-2 shrink-0 px-1.5 py-0 text-[10px]"
											>active</Badge
										>
									{/if}
								</button>
								<button
									type="button"
									title={toolCallingOn
										? 'Tool-calling enabled'
										: 'Tool-calling disabled — subagent will not work'}
									class="flex shrink-0 items-center gap-1 px-2 py-1.5 text-xs transition-colors {toolCallingOn
										? 'text-muted-foreground hover:text-foreground'
										: 'text-destructive hover:text-destructive/80'}"
									onclick={() => modelCapabilityStore.setToolCalling(modelId, !toolCallingOn)}
								>
									<span class="font-mono">{toolCallingOn ? 'tools ✓' : 'tools ✗'}</span>
								</button>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-xs text-muted-foreground">
						No models available. Refresh models from the server first.
					</p>
				{/if}
			</div>

			<div class="flex items-center justify-between rounded-md border border-border/30 px-3 py-2.5">
				<div class="space-y-0.5">
					<p class="text-sm font-medium">Summarize long text</p>
					<p class="text-xs text-muted-foreground">
						Automatically summarize large context before sending to the main model.
					</p>
				</div>
				<Switch
					checked={subagentSummarizeEnabled}
					onCheckedChange={handleSubagentSummarizeToggle}
					aria-label="Summarize long text"
				/>
			</div>
		</SettingsSectionDivider>
	{/if}
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
