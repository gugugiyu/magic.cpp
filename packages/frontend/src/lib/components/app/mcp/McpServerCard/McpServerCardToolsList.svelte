<script lang="ts">
	import { ChevronDown, ChevronRight } from '@lucide/svelte';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';

	interface Tool {
		name: string;
		description?: string;
	}

	interface Props {
		tools: Tool[];
		isToolEnabled: (toolName: string) => boolean;
		onToolToggle: (toolName: string, enabled: boolean) => void;
	}

	let { tools, isToolEnabled, onToolToggle }: Props = $props();

	let isExpanded = $state(false);
	let toolsCount = $derived(tools.length);
</script>

<Collapsible.Root bind:open={isExpanded}>
	<Collapsible.Trigger
		class="flex w-full items-center gap-1 text-xs text-success hover:text-success/80"
	>
		{#if isExpanded}
			<ChevronDown class="h-3.5 w-3.5" />
		{:else}
			<ChevronRight class="h-3.5 w-3.5" />
		{/if}

		<span>{toolsCount} tools available · Show details</span>
	</Collapsible.Trigger>

	<Collapsible.Content class="mt-2">
		<div class="max-h-64 overflow-y-auto">
			{#each tools as tool, i (tool.name || i)}
				<div class="border-b last:border-b-0">
					<div class="sticky top-0 z-10 flex items-start justify-between gap-2 bg-background py-2">
						<Badge variant="outline" class="bg-success-bg text-success"
							>{tool.name || '(unnamed)'}</Badge
						>

						<Switch
							checked={isToolEnabled(tool.name)}
							onCheckedChange={(checked) => onToolToggle(tool.name, Boolean(checked))}
							class="shrink-0"
						/>
					</div>

					{#if tool.description}
						<p class="pb-2 text-xs text-muted-foreground">{tool.description}</p>
					{/if}
				</div>
			{/each}
		</div>
	</Collapsible.Content>
</Collapsible.Root>
