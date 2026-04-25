<script lang="ts">
	import { AlertTriangle, Server, Globe } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		serverProps,
		serverLoading,
		serverError,
		isCompatibilityMode
	} from '$lib/stores/server.svelte';
	import { singleModelName } from '$lib/stores/models.svelte';

	interface Props {
		class?: string;
		showActions?: boolean;
	}

	let { class: className = '', showActions = false }: Props = $props();

	let error = $derived(serverError());
	let loading = $derived(serverLoading());
	let model = $derived(singleModelName());
	let serverData = $derived(serverProps());
	let compatMode = $derived(isCompatibilityMode());

	function getStatusColor() {
		if (loading) return 'bg-warning';
		if (compatMode) return 'bg-warning'; // amber = working but limited
		if (error) return 'bg-destructive';
		if (serverData) return 'bg-success';

		return 'bg-muted-foreground';
	}

	function getStatusTextColor() {
		if (loading) return 'text-warning';
		if (compatMode) return 'text-warning';
		if (error) return 'text-destructive';
		if (serverData) return 'text-success';

		return 'text-muted-foreground';
	}

	function getStatusText() {
		if (loading) return 'Connecting...';
		if (compatMode) return 'Compatibility Mode';
		if (error) return 'Connection Error';
		if (serverData) return 'Connected';

		return 'Unknown';
	}
</script>

<div class="flex items-center space-x-3 {className}">
	<div class="flex items-center space-x-2">
		<div class="h-2 w-2 rounded-full {getStatusColor()}"></div>

		<span class="text-sm {getStatusTextColor()}">{getStatusText()}</span>
	</div>

	{#if serverData && !error}
		<Badge variant="outline" class="text-xs">
			<Server class="mr-1 h-3 w-3" />

			{model || 'Unknown Model'}
		</Badge>

		{#if serverData?.default_generation_settings?.n_ctx}
			<Badge variant="secondary" class="text-xs">
				ctx: {serverData.default_generation_settings.n_ctx.toLocaleString()}
			</Badge>
		{/if}
	{/if}

	{#if compatMode}
		<Badge variant="outline" class="text-xs">
			<Globe class="mr-1 h-3 w-3" />
			OpenAI-compatible
		</Badge>
	{/if}

	{#if showActions && error && !compatMode}
		<Button variant="outline" size="sm" class="text-destructive">
			<AlertTriangle class="h-4 w-4" />

			{error}
		</Button>
	{/if}
</div>
